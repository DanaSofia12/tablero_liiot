"""Cuentas de Liiot Hub: contraseñas, sesiones, códigos de un solo uso e inicio de sesión.

- Las contraseñas se guardan con scrypt (sal aleatoria); nunca en texto plano.
- La sesión es una cookie HttpOnly con un token aleatorio; en la base solo queda su huella (SHA-256).
- La primera cuenta se crea con un código que aparece en la ventana de Liiot Hub (quien abre el programa).
- Las demás personas entran con un código de invitación que genera quien administra; con otro código
  se recupera una contraseña olvidada. Los códigos valen una sola vez y vencen.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import re
import secrets
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request
from sqlmodel import Session, select

from .db import session_scope
from .models import AuthSession, Invite, Member

log = logging.getLogger("liiot.auth")

COOKIE = "liiot_session"
SESSION_DAYS = 30
INVITE_DAYS = 7
RESET_HOURS = 24
MIN_PASSWORD = 8
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # sin letras que se confunden (I, L, O, 0, 1)
SCRYPT = {"n": 2**14, "r": 8, "p": 1}
USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{2,29}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
COMMON = {"12345678", "123456789", "1234567890", "password", "contraseña", "contrasena", "qwertyui", "liiot123", "liiothub", "abcdefgh"}

_setup = {"code": None}
_dummy = {"hash": None}
_fails: dict[str, list[float]] = {}
_fails_lock = threading.Lock()


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


# ---------------------------------------------------------------- contraseñas
def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, dklen=32, **SCRYPT)
    return f"scrypt${SCRYPT['n']}${SCRYPT['r']}${SCRYPT['p']}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        algo, n, r, p, salt, digest = stored.split("$")
        if algo != "scrypt":
            return False
        expected = base64.b64decode(digest)
        candidate = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p), dklen=len(expected))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(candidate, expected)


def check_password(password: str, username: str = "", email: str = "") -> None:
    if len(password or "") < MIN_PASSWORD:
        raise ValueError(f"La contraseña necesita al menos {MIN_PASSWORD} caracteres.")
    low = password.lower()
    if low in COMMON or len(set(password)) < 4:
        raise ValueError("Esa contraseña es muy fácil de adivinar. Prueba con una frase corta o mezcla letras y números.")
    if low in {username.lower(), email.lower(), email.split("@")[0].lower()} - {""}:
        raise ValueError("La contraseña no puede ser igual a tu usuario o a tu correo.")


def clean_username(value: str) -> str:
    username = str(value or "").strip().lower()
    if not USERNAME_RE.fullmatch(username):
        raise ValueError("El usuario debe tener entre 3 y 30 caracteres: letras sin tildes, números, punto, guion o guion bajo.")
    return username


def clean_email(value: str) -> str:
    email = str(value or "").strip().lower()
    if not EMAIL_RE.fullmatch(email) or len(email) > 120:
        raise ValueError("Revisa el correo: debe verse como nombre@empresa.com.")
    return email


def _unique(s: Session, member_id: str, username: str, email: str) -> None:
    for m in s.exec(select(Member)):
        if m.id == member_id:
            continue
        if m.username and m.username == username:
            raise ValueError("Ese usuario ya lo tiene otra persona.")
        if m.email and m.email == email:
            raise ValueError("Ese correo ya lo usa otra persona.")


def set_credentials(s: Session, member: Member, username: str, email: str, password: str) -> None:
    username, email = clean_username(username), clean_email(email)
    _unique(s, member.id, username, email)
    check_password(password, username, email)
    member.username, member.email = username, email
    member.password_hash = hash_password(password)
    member.active = True
    s.add(member)


def accounts_exist(s: Session) -> bool:
    return any(m.password_hash for m in s.exec(select(Member)))


# ---------------------------------------------------------------- códigos de un solo uso
def _new_code() -> str:
    raw = "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))
    return f"{raw[:4]}-{raw[4:]}"


def _norm_code(code: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(code or "").upper())


def setup_code() -> str | None:
    """Código para crear la primera cuenta (solo mientras no exista ninguna). Se muestra en la ventana del programa."""
    with session_scope() as s:
        if accounts_exist(s):
            _setup["code"] = None
            return None
    if _setup["code"] is None:
        _setup["code"] = _new_code()
    return _setup["code"]


def announce_setup() -> None:
    code = setup_code()
    if code:
        banner = (
            "\n" + "=" * 64 + "\n"
            "  Liiot Hub todavía no tiene cuentas.\n"
            f"  Para crear la primera (la tuya), usa este código: {code}\n"
            "  Escríbelo en la pantalla de bienvenida del navegador.\n" + "=" * 64 + "\n"
        )
        print(banner, flush=True)
        log.warning("Código para crear la primera cuenta: %s", code)


def check_setup_code(code: str) -> bool:
    expected = setup_code()
    return bool(expected) and hmac.compare_digest(_norm_code(code), _norm_code(expected))


def create_invite(s: Session, member: Member, created_by: str, kind: str | None = None, hours: int | None = None) -> tuple[str, Invite]:
    """Código para activar la cuenta (si aún no tiene contraseña) o para elegir una nueva."""
    kind = kind or ("restablecer" if member.password_hash else "activar")
    for old in s.exec(select(Invite).where(Invite.member_id == member.id, Invite.used_at == None)):  # noqa: E711
        s.delete(old)  # un código vivo por persona
    code = _new_code()
    lifetime = timedelta(hours=hours) if hours else (timedelta(days=INVITE_DAYS) if kind == "activar" else timedelta(hours=RESET_HOURS))
    invite = Invite(code_hash=_sha(_norm_code(code)), member_id=member.id, kind=kind, created_by=created_by, created_at=utcnow(),
                    expires_at=utcnow() + lifetime)
    s.add(invite)
    return code, invite


def find_invite(s: Session, code: str) -> Invite | None:
    invite = s.get(Invite, _sha(_norm_code(code)))
    if invite is None or invite.used_at is not None or _aware(invite.expires_at) < utcnow():
        return None
    return invite


# ---------------------------------------------------------------- sesiones
def start_session(s: Session, member: Member, user_agent: str = "") -> str:
    token = secrets.token_urlsafe(32)
    now = utcnow()
    s.add(AuthSession(token_hash=_sha(token), member_id=member.id, created_at=now, expires_at=now + timedelta(days=SESSION_DAYS),
                      last_seen_at=now, user_agent=(user_agent or "")[:160]))
    member.last_login_at = now
    s.add(member)
    return token


def end_sessions(s: Session, member_id: str, keep_token: str | None = None) -> None:
    keep = _sha(keep_token) if keep_token else None
    for row in s.exec(select(AuthSession).where(AuthSession.member_id == member_id)):
        if row.token_hash != keep:
            s.delete(row)


def end_session(token: str | None) -> None:
    if not token:
        return
    with session_scope() as s:
        row = s.get(AuthSession, _sha(token))
        if row:
            s.delete(row)
            s.commit()


@dataclass
class Me:
    id: str
    name: str
    is_admin: bool


def resolve(token: str | None) -> Me | None:
    """Persona dueña del token, o None si no hay sesión válida. Renueva la sesión mientras se use."""
    if not token:
        return None
    with session_scope() as s:
        row = s.get(AuthSession, _sha(token))
        if row is None:
            return None
        now = utcnow()
        if _aware(row.expires_at) < now:
            s.delete(row)
            s.commit()
            return None
        member = s.get(Member, row.member_id)
        if member is None or not member.active or not member.password_hash:
            return None
        if now - _aware(row.last_seen_at) > timedelta(minutes=10):
            row.last_seen_at = now
            row.expires_at = now + timedelta(days=SESSION_DAYS)
            s.add(row)
            s.commit()
        return Me(id=member.id, name=member.name, is_admin=member.is_admin)


def set_cookie(response, token: str, request: Request) -> None:
    response.set_cookie(COOKIE, token, max_age=SESSION_DAYS * 86400, httponly=True, samesite="lax",
                        secure=request.url.scheme == "https", path="/")


def clear_cookie(response) -> None:
    response.delete_cookie(COOKIE, path="/")


# ---------------------------------------------------------------- intentos fallidos
def _client(request: Request) -> str:
    return request.client.host if request.client else "?"


def too_many(request: Request, login: str) -> bool:
    cutoff = time.monotonic() - 15 * 60
    with _fails_lock:
        for key in (f"ip:{_client(request)}", f"u:{login.lower()}"):
            _fails[key] = [t for t in _fails.get(key, []) if t > cutoff]
            if len(_fails[key]) >= 8:
                return True
    return False


def note_failure(request: Request, login: str) -> None:
    now = time.monotonic()
    with _fails_lock:
        for key in (f"ip:{_client(request)}", f"u:{login.lower()}"):
            _fails.setdefault(key, []).append(now)


def clear_failures(request: Request, login: str) -> None:
    with _fails_lock:
        _fails.pop(f"u:{login.lower()}", None)


def authenticate(login: str, password: str) -> Member | None:
    who = str(login or "").strip().lower()
    with session_scope() as s:
        member = next((m for m in s.exec(select(Member)) if who and who in {m.username or "", m.email or ""}), None)
        if member is None:
            if _dummy["hash"] is None:
                _dummy["hash"] = hash_password(secrets.token_hex(8))
            verify_password(password, _dummy["hash"])  # mismo tiempo de respuesta exista o no la cuenta
            return None
        if not member.active or not verify_password(password, member.password_hash):
            return None
        return member


# ---------------------------------------------------------------- dependencias de FastAPI
async def current_member(request: Request) -> Me:
    me = resolve(request.cookies.get(COOKIE))
    if me is None:
        raise HTTPException(401, "Tu sesión terminó. Vuelve a entrar.")
    return me


async def require_admin(me: Me = Depends(current_member)) -> Me:
    if not me.is_admin:
        raise HTTPException(403, "Esto solo lo puede hacer quien administra Liiot Hub.")
    return me
