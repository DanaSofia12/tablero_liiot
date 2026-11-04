"""Rutas de cuentas: primera cuenta, entrar, salir, códigos de invitación y administración de accesos."""
from __future__ import annotations

import secrets

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlmodel import select

from . import auth
from . import services as svc
from .auth import Me, current_member, require_admin
from .catalog import APP_NAME
from .db import session_scope
from .models import Invite, Member
from .realtime import notify

router = APIRouter(prefix="/api/auth")
accounts = APIRouter(prefix="/api/accounts")


def _bad(exc: Exception) -> HTTPException:
    return HTTPException(status_code=400, detail=str(exc))


def _signed_in(request: Request, member: Member, token: str, status: int = 200) -> JSONResponse:
    response = JSONResponse({"me": svc.member_out(member, private=True)}, status_code=status)
    auth.set_cookie(response, token, request)
    return response


@router.get("/state")
async def state(request: Request) -> JSONResponse:
    me = auth.resolve(request.cookies.get(auth.COOKIE))
    with session_scope() as s:
        needs_setup = not auth.accounts_exist(s)
        member = s.get(Member, me.id) if me else None
        out = {
            "appName": APP_NAME,
            "needsSetup": needs_setup,
            "me": svc.member_out(member, private=True) if member else None,
            # En la primera configuración se elige quién es entre las personas que ya existen
            "people": [{"id": m.id, "name": m.name, "role": m.role} for m in svc.members_all(s)] if needs_setup else [],
        }
    response = JSONResponse(out)
    if me:
        auth.set_cookie(response, request.cookies[auth.COOKIE], request)  # renueva la cookie mientras se use
    return response


@router.post("/setup")
async def setup(request: Request, payload: dict = Body(...)) -> JSONResponse:
    """Primera cuenta (queda como administradora). Pide el código que muestra la ventana de Liiot Hub."""
    with session_scope() as s:
        if auth.accounts_exist(s):
            raise HTTPException(409, "Liiot Hub ya tiene cuentas: entra con la tuya.")
    if auth.too_many(request, "setup"):
        raise HTTPException(429, "Demasiados intentos. Espera unos minutos e inténtalo otra vez.")
    if not auth.check_setup_code(str(payload.get("code") or "")):
        auth.note_failure(request, "setup")
        raise HTTPException(400, "Ese código no coincide. Míralo en la ventana negra «Liiot Hub» (donde dice «usa este código»).")
    with session_scope() as s:
        member = s.get(Member, str(payload.get("memberId") or ""))
        if member is None:
            raise HTTPException(400, "Elige quién eres.")
        try:
            auth.set_credentials(s, member, payload.get("username"), payload.get("email"), payload.get("password") or "")
        except ValueError as exc:
            raise _bad(exc) from exc
        member.is_admin = True
        token = auth.start_session(s, member, request.headers.get("user-agent", ""))
        s.commit()
        auth.setup_code()  # ya hay cuentas: el código deja de servir
        response = _signed_in(request, member, token)
    await notify("members")
    return response


@router.post("/login")
async def login(request: Request, payload: dict = Body(...)) -> JSONResponse:
    who = str(payload.get("login") or "").strip()
    if not who or not payload.get("password"):
        raise HTTPException(400, "Escribe tu correo o usuario y tu contraseña.")
    if auth.too_many(request, who):
        raise HTTPException(429, "Demasiados intentos seguidos. Espera unos 15 minutos e inténtalo otra vez.")
    member = auth.authenticate(who, str(payload.get("password")))
    if member is None:
        auth.note_failure(request, who)
        raise HTTPException(401, "El correo, el usuario o la contraseña no coinciden.")
    auth.clear_failures(request, who)
    with session_scope() as s:
        m = s.get(Member, member.id)
        token = auth.start_session(s, m, request.headers.get("user-agent", ""))
        s.commit()
        return _signed_in(request, m, token)


@router.post("/logout")
async def logout(request: Request) -> JSONResponse:
    auth.end_session(request.cookies.get(auth.COOKIE))
    response = JSONResponse({"ok": True})
    auth.clear_cookie(response)
    return response


@router.post("/code")
async def check_code(request: Request, payload: dict = Body(...)) -> dict:
    """Revisa un código de invitación o de recuperación y dice para quién es."""
    if auth.too_many(request, "code"):
        raise HTTPException(429, "Demasiados intentos. Espera unos minutos e inténtalo otra vez.")
    with session_scope() as s:
        invite = auth.find_invite(s, str(payload.get("code") or ""))
        if invite is None:
            auth.note_failure(request, "code")
            raise HTTPException(400, "Ese código no sirve: puede que ya se haya usado o que haya vencido. Pide uno nuevo.")
        member = s.get(Member, invite.member_id)
        return {
            "kind": invite.kind,
            "member": {"id": member.id, "name": member.name, "role": member.role},
            "username": member.username,
            "email": member.email,
            "expiresAt": svc.iso_dt(invite.expires_at),
        }


@router.post("/code/use")
async def use_code(request: Request, payload: dict = Body(...)) -> JSONResponse:
    if auth.too_many(request, "code"):
        raise HTTPException(429, "Demasiados intentos. Espera unos minutos e inténtalo otra vez.")
    with session_scope() as s:
        invite = auth.find_invite(s, str(payload.get("code") or ""))
        if invite is None:
            auth.note_failure(request, "code")
            raise HTTPException(400, "Ese código no sirve: puede que ya se haya usado o que haya vencido. Pide uno nuevo.")
        member = s.get(Member, invite.member_id)
        try:
            auth.set_credentials(s, member, payload.get("username") or member.username, payload.get("email") or member.email,
                                 payload.get("password") or "")
        except ValueError as exc:
            raise _bad(exc) from exc
        invite.used_at = auth.utcnow()
        s.add(invite)
        auth.end_sessions(s, member.id)  # con contraseña nueva se cierran las sesiones viejas
        token = auth.start_session(s, member, request.headers.get("user-agent", ""))
        s.commit()
        response = _signed_in(request, member, token)
    await notify("members")
    return response


@router.post("/password")
async def change_password(request: Request, payload: dict = Body(...), me: Me = Depends(current_member)) -> dict:
    with session_scope() as s:
        member = s.get(Member, me.id)
        if not auth.verify_password(str(payload.get("current") or ""), member.password_hash):
            raise HTTPException(400, "Tu contraseña actual no coincide.")
        try:
            auth.check_password(str(payload.get("password") or ""), member.username or "", member.email or "")
        except ValueError as exc:
            raise _bad(exc) from exc
        member.password_hash = auth.hash_password(str(payload["password"]))
        s.add(member)
        auth.end_sessions(s, member.id, keep_token=request.cookies.get(auth.COOKIE))
        s.commit()
    return {"ok": True}


@router.patch("/account")
async def update_account(payload: dict = Body(...), me: Me = Depends(current_member)) -> dict:
    """Cambiar el correo o el usuario propios (pide la contraseña)."""
    with session_scope() as s:
        member = s.get(Member, me.id)
        if not auth.verify_password(str(payload.get("password") or ""), member.password_hash):
            raise HTTPException(400, "Para cambiar tu correo o usuario confirma tu contraseña.")
        try:
            username = auth.clean_username(payload.get("username") or member.username)
            email = auth.clean_email(payload.get("email") or member.email)
            auth._unique(s, member.id, username, email)
        except ValueError as exc:
            raise _bad(exc) from exc
        member.username, member.email = username, email
        s.add(member)
        s.commit()
        out = svc.member_out(member, private=True)
    await notify("members")
    return out


# ---------------------------------------------------------------- accesos (solo quien administra)
def _account_row(s, m: Member) -> dict:
    pending = s.exec(select(Invite).where(Invite.member_id == m.id, Invite.used_at == None)).first()  # noqa: E711
    alive = pending and auth._aware(pending.expires_at) > auth.utcnow()
    return {
        **svc.member_out(m, private=True),
        "pendingCode": {"kind": pending.kind, "expiresAt": svc.iso_dt(pending.expires_at)} if alive else None,
    }


@accounts.get("")
async def list_accounts(me: Me = Depends(require_admin)) -> list[dict]:
    with session_scope() as s:
        return [_account_row(s, m) for m in svc.members_all(s)]


@accounts.post("")
async def add_person(payload: dict = Body(...), me: Me = Depends(require_admin)) -> dict:
    """Registra a una persona nueva y devuelve su código para que active la cuenta."""
    name = str(payload.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Escribe el nombre de la persona.")
    with session_scope() as s:
        existing = svc.members_all(s)
        base = svc.slugify(name).replace("-", "")[:12] or "persona"
        member_id, n = base, 2
        while any(m.id == member_id for m in existing):
            member_id, n = f"{base}{n}", n + 1
        member = Member(
            id=member_id,
            name=name.split()[0] if len(name.split()) > 2 else name,
            full_name=str(payload.get("fullName") or name).strip(),
            role=str(payload.get("role") or "Equipo").strip()[:40],
            area=str(payload.get("area") or "").strip()[:120],
            color=svc.PROJECT_COLORS[len(existing) % len(svc.PROJECT_COLORS)],
            avatar_json='{"hair": "short", "hairColor": "#2B1E18", "skin": "#E8BD9C", "eyes": "#2E2018", "top": "#F4F1F6", '
                        '"outer": null, "outerStyle": "none", "glasses": false, "necklace": false, "lips": null}',
            link_code=secrets.token_hex(4),
            order=max((m.order for m in existing), default=0) + 1,
            is_admin=bool(payload.get("isAdmin")),
        )
        s.add(member)
        s.flush()
        code, invite = auth.create_invite(s, member, me.id, "activar")
        s.commit()
        out = {"member": _account_row(s, member), "code": code, "expiresAt": svc.iso_dt(invite.expires_at)}
    await notify("members")
    return out


@accounts.post("/{member_id}/code")
async def new_code(member_id: str, me: Me = Depends(require_admin)) -> dict:
    """Código para activar la cuenta (si aún no tiene) o para elegir una contraseña nueva."""
    with session_scope() as s:
        member = s.get(Member, member_id)
        if member is None:
            raise HTTPException(404, "Persona no encontrada.")
        code, invite = auth.create_invite(s, member, me.id)
        s.commit()
        return {"code": code, "kind": invite.kind, "expiresAt": svc.iso_dt(invite.expires_at)}


@accounts.patch("/{member_id}")
async def update_access(member_id: str, payload: dict = Body(...), me: Me = Depends(require_admin)) -> dict:
    with session_scope() as s:
        member = s.get(Member, member_id)
        if member is None:
            raise HTTPException(404, "Persona no encontrada.")
        admins = [m for m in svc.members_all(s) if m.is_admin and m.active and m.password_hash]
        if "isAdmin" in payload and not payload["isAdmin"] and member.is_admin and len(admins) <= 1:
            raise HTTPException(400, "Debe quedar al menos una persona que administre.")
        if "active" in payload and not payload["active"] and member.id == me.id:
            raise HTTPException(400, "No puedes desactivar tu propia cuenta.")
        if "isAdmin" in payload:
            member.is_admin = bool(payload["isAdmin"])
        if "active" in payload:
            member.active = bool(payload["active"])
            if not member.active:
                auth.end_sessions(s, member.id)
        s.add(member)
        s.commit()
        out = _account_row(s, member)
    await notify("members")
    return out
