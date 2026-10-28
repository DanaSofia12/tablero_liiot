"""Sincronización en dos vías entre HQ y la bóveda de Obsidian de Liiot.

Estructura del vault (ver su AGENTS.md):
- Proyecto: carpeta 10_Proyectos/<Nombre>/ con la nota <Nombre>.md (frontmatter type: project, id PRJ-…).
- Tarea: nota en 10_Proyectos/<Nombre>/01_Gestion/Tareas/ (frontmatter type: task, id TSK-AAAAMMDD-NN).

Reglas:
- De las notas que ya existen, HQ solo cambia el frontmatter; el cuerpo es de las personas (regla del vault).
  Las notas nuevas sí se crean completas, con las plantillas Entity_Tarea y Entity_Project.
- HQ nunca borra archivos. Si una nota desaparece dos revisiones seguidas, la tarea se archiva en HQ.
- Fusión en tres vías por campo: se guarda lo último sincronizado de cada lado; gana el lado que cambió y,
  si cambiaron los dos, el cambio más reciente (fecha de la nota contra la de la tarea).
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import threading
import unicodedata
from collections import deque
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

import yaml
from sqlmodel import Session, select

from . import config
from . import services as svc
from .db import session_scope
from .models import Member, Project, Setting, Task, VaultLink, VaultProjectLink

log = logging.getLogger("liiot.vault")

PROJECTS_DIR = "10_Proyectos"
TASKS_DIR = ("01_Gestion", "Tareas")
PROJECT_SUBDIRS = ("01_Gestion/Tareas", "02_Negocio", "03_Diseno", "04_Ingenieria", "99_Assets")
INTERVAL = 15  # segundos entre revisiones del vault
SOURCE = "obsidian"
ACTOR = "Obsidian"

STATE: dict = {"lastSync": None, "lastError": None, "busy": False, "stats": {}}
ACTIVITY: deque = deque(maxlen=40)
_lock = threading.Lock()
_cache: dict[str, tuple[float, int, "Note"]] = {}
_wake: asyncio.Event | None = None

# ---------------------------------------------------------------- vocabulario vault ↔ HQ
STATUS_IN = {
    "por_hacer": "por_hacer", "por hacer": "por_hacer", "pendiente": "por_hacer", "todo": "por_hacer",
    "en_progreso": "en_progreso", "en progreso": "en_progreso", "haciendo": "en_progreso", "doing": "en_progreso",
    "en_revision": "en_revision", "en revision": "en_revision", "revision": "en_revision", "review": "en_revision",
    "bloqueada": "bloqueada", "bloqueado": "bloqueada", "blocked": "bloqueada",
    "hecho": "hecha", "hecha": "hecha", "done": "hecha", "completado": "hecha", "completada": "hecha",
    "terminado": "hecha", "terminada": "hecha", "cerrado": "hecha", "cerrada": "hecha",
}
STATUS_OUT = {"hecha": "hecho"}  # el vault escribe «hecho»
PRIORITY_IN = {"p0": "P0", "critica": "P0", "urgente": "P0", "p1": "P1", "alta": "P1", "p2": "P2", "media": "P2",
               "normal": "P2", "p3": "P3", "baja": "P3"}
PRIORITY_OUT = {"P0": "critica", "P1": "alta", "P2": "media", "P3": "baja"}
TYPE_IN = {
    "negocio": "negocio", "ventas": "negocio", "comercial": "negocio", "finanzas": "negocio",
    "desarrollo": "desarrollo", "infraestructura": "desarrollo", "tecnologia": "desarrollo", "ingenieria": "desarrollo",
    "diseno": "diseno", "marca": "diseno", "ux": "diseno",
    "marketing": "marketing", "contenido": "marketing", "redes": "marketing",
    "gestion": "gestion", "planificacion": "gestion", "definicion": "gestion", "documentacion": "gestion", "procesos": "gestion",
    "calidad": "calidad", "pruebas": "calidad", "qa": "calidad",
    "legal": "legal", "contratos": "legal",
    "investigacion": "investigacion", "research": "investigacion", "analisis": "investigacion",
}
TYPE_HINTS = [
    ("calidad", r"\b(tests?|pruebas?|auditoria|qa)\b"),
    ("desarrollo", r"\b(api|frontend|backend|bd|supabase|repo|deploy|migrar|endpoint|motor|configurar|seed|monorepo|logs?|backups?|notificaciones)\b"),
    ("legal", r"\b(contrato|habeas|legal|politicas?|retencion)\b"),
    ("diseno", r"\b(diseno|logo|marca|identidad|bocetos?|ux|ui)\b"),
    ("investigacion", r"\b(analisis|benchmark|investigar|competidores|evaluar)\b"),
    ("negocio", r"\b(precios?|tarifas?|cobro|modelo de negocio|cliente|ventas|contactar)\b"),
    ("marketing", r"\b(marketing|contenido|redes|campana)\b"),
]
EFFORT_IN = {"s": "S", "m": "M", "l": "L", "pequeno": "S", "mediano": "M", "grande": "L"}
TRUE_WORDS = {"true", "si", "yes", "1"}

FIELDS = ("title", "status", "owner", "type", "priority", "due", "start", "effort", "phase", "blocker", "archived", "summary")
VAULT_KEY = {"title": "titulo", "status": "status", "owner": "responsable", "type": "categoria", "priority": "prioridad",
             "due": "vence", "start": "inicio", "effort": "esfuerzo", "phase": "fase", "blocker": "bloqueo", "archived": "archivada"}
PATCH_KEY = {"title": "title", "status": "status", "owner": "ownerId", "type": "type", "priority": "priority", "due": "dueDate",
             "start": "startDate", "effort": "effort", "phase": "phase", "blocker": "blockerReason", "summary": "summary"}
LABEL = {"title": "título", "status": "estado", "owner": "responsable", "type": "tipo", "priority": "prioridad", "due": "fecha",
         "start": "inicio", "effort": "esfuerzo", "phase": "fase", "blocker": "bloqueo", "archived": "archivo", "summary": "resumen"}
QUOTED_KEYS = {"project", "responsable", "categoria", "titulo", "bloqueo", "fase", "lider"}


def fold(text) -> str:
    """Minúsculas, sin tildes ni espacios de más (para comparar nombres y palabras)."""
    plain = unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", plain).strip()


class People:
    """Reconoce a cada persona por como aparece en el vault: «Jean Pierre Ortiz Murcia», «David Ocaño», «Dana»…"""

    EXTRA = {"jd": ["david", "david ocano"], "jp": ["jp"]}

    def __init__(self, members: list[Member]):
        self.names = {m.id: m.name for m in members}
        self.first = members[0].id if members else None
        aliases: list[tuple[str, str]] = []
        for m in members:
            for alias in {fold(m.name), fold(m.full_name), fold(m.id), *self.EXTRA.get(m.id, [])}:
                if alias:
                    aliases.append((alias, m.id))
        self.aliases = sorted(aliases, key=lambda a: -len(a[0]))

    def match(self, raw) -> str | None:
        text = fold(raw)
        link = re.match(r"^\[\[([^\]|]+)", text)
        text = (link.group(1) if link else text).strip(' "[]')
        if not text:
            return None
        for alias, member_id in self.aliases:
            if text == alias or text.startswith(alias + " "):
                return member_id
        return None

    def name(self, member_id: str | None) -> str:
        return self.names.get(member_id or "", member_id or "")


# ---------------------------------------------------------------- notas
FM_RE = re.compile(r"\A---[ \t]*\r?\n(?:(.*?)\r?\n)?---[ \t]*(?:\r?\n|\Z)", re.S)


@dataclass
class Note:
    path: Path
    rel: str
    text: str
    fm: dict
    has_fm: bool
    fm_error: bool
    h1: str | None
    summary: str
    mtime: float

    @property
    def stem(self) -> str:
        return self.path.stem

    @property
    def note_id(self) -> str:
        return str(self.fm.get("id") or "").strip()


def build_note(path: Path, root: Path, text: str, mtime: float) -> Note:
    match = FM_RE.match(text)
    fm, has_fm, fm_error, body = {}, False, False, text
    if match:
        has_fm, body = True, text[match.end():]
        try:
            data = yaml.safe_load(match.group(1) or "") or {}
            fm = data if isinstance(data, dict) else {}
            fm_error = not isinstance(data, dict)
        except yaml.YAMLError:
            fm_error = True
    h1, paragraph = None, []
    for line in body.splitlines():
        stripped = line.strip()
        if h1 is None and stripped.startswith("# "):
            h1 = stripped[2:].strip()
            continue
        if not stripped or stripped.startswith(("#", "%%", "---")):
            if paragraph:
                break
            continue
        paragraph.append(stripped)
    return Note(path=path, rel=path.relative_to(root).as_posix(), text=text, fm=fm, has_fm=has_fm, fm_error=fm_error,
                h1=h1, summary=" ".join(paragraph)[:800], mtime=mtime)


def read_note(path: Path, root: Path) -> Note | None:
    try:
        st = path.stat()
    except OSError:
        return None
    hit = _cache.get(str(path))
    if hit and hit[0] == st.st_mtime and hit[1] == st.st_size:
        return hit[2]
    try:
        with open(path, encoding="utf-8-sig", newline="") as fh:
            text = fh.read()
    except (OSError, UnicodeDecodeError):
        return None
    note = build_note(path, root, text, st.st_mtime)
    _cache[str(path)] = (st.st_mtime, st.st_size, note)
    return note


def fmt_value(value, key: str = "") -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()[:10]
    if isinstance(value, (list, tuple)):
        return "[" + ", ".join(fmt_value(item) for item in value) + "]"
    text = str(value)
    plain = re.fullmatch(r"[A-Za-z_][A-Za-z0-9_.\-]*", text) and text.lower() not in {"true", "false", "null", "yes", "no", "on", "off"}
    if plain and key not in QUOTED_KEYS:
        return text
    return json.dumps(text, ensure_ascii=False)


def set_fields(text: str, updates: dict) -> str:
    """Cambia solo las claves indicadas del frontmatter (None = quitar la clave); el resto de la nota queda igual."""
    nl = "\r\n" if "\r\n" in text else "\n"
    match = FM_RE.match(text)
    if not match:
        lines = [f"{k}: {fmt_value(v, k)}" for k, v in updates.items() if v is not None]
        return "---" + nl + nl.join(lines) + nl + "---" + nl + text
    lines = (match.group(1) or "").splitlines()
    for key, value in updates.items():
        pattern = re.compile(rf"^{re.escape(key)}[ \t]*:")
        idx = next((i for i, line in enumerate(lines) if pattern.match(line)), None)
        if idx is None:
            if value is not None:
                lines.append(f"{key}: {fmt_value(value, key)}")
            continue
        end = idx + 1
        while end < len(lines) and lines[end][:1] in (" ", "\t", "-"):
            end += 1  # líneas de continuación (listas en varias líneas)
        if value is None:
            del lines[idx:end]
        else:
            lines[idx:end] = [f"{key}: {fmt_value(value, key)}"]
    return "---" + nl + nl.join(lines) + nl + "---" + nl + text[match.end():]


def write_note(note: Note, updates: dict, root: Path, today: date) -> Note:
    text = set_fields(note.text, {**updates, "updated": today})
    if text == note.text:
        return note
    with open(note.path, "w", encoding="utf-8", newline="") as fh:
        fh.write(text)
    st = note.path.stat()
    fresh = build_note(note.path, root, text, st.st_mtime)
    _cache[str(note.path)] = (st.st_mtime, st.st_size, fresh)
    return fresh


def safe_filename(title: str) -> str:
    clean = re.sub(r'[\\/:*?"<>|#^\[\]]', " ", str(title or ""))
    clean = re.sub(r"\s+", " ", clean).strip().rstrip(".")
    return clean[:110]


def new_task_id(used: set[str], today: date) -> str:
    prefix = f"TSK-{today:%Y%m%d}-"
    numbers = [int(x[len(prefix):]) for x in used if x.startswith(prefix) and x[len(prefix):].isdigit()]
    note_id = f"{prefix}{max(numbers, default=0) + 1:02d}"
    used.add(note_id)
    return note_id


def section_text(note: Note, heading: str) -> str:
    """Primer párrafo bajo «## heading» (para traer la descripción de un proyecto)."""
    body = FM_RE.sub("", note.text, count=1)
    match = re.search(rf"^##\s+{re.escape(heading)}\s*$(.*?)(?=^##\s|\Z)", body, re.M | re.S)
    if not match:
        return ""
    lines = [line.strip() for line in match.group(1).strip().splitlines() if line.strip() and not line.strip().startswith("%%")]
    return " ".join(lines)[:600]


# ---------------------------------------------------------------- campos de tarea
def _fm_str(fm: dict, *keys: str) -> str:
    for key in keys:
        value = fm.get(key)
        if value is None or value == "" or value == []:
            continue
        if isinstance(value, bool):
            return "true" if value else "false"
        if isinstance(value, (date, datetime)):
            return value.isoformat()[:10]
        if isinstance(value, list):
            return ", ".join(str(item) for item in value)
        return str(value).strip()
    return ""


def raw_fields(note: Note) -> dict[str, str]:
    fm = note.fm
    return {
        "title": _fm_str(fm, "titulo") or (note.h1 or "").strip() or note.stem,
        "status": _fm_str(fm, "status"),
        "owner": _fm_str(fm, "responsable"),
        "type": _fm_str(fm, "categoria"),
        "priority": _fm_str(fm, "prioridad"),
        "due": _fm_str(fm, "vence"),
        "start": _fm_str(fm, "inicio"),
        "effort": _fm_str(fm, "esfuerzo"),
        "phase": _fm_str(fm, "fase"),
        "blocker": _fm_str(fm, "bloqueo"),
        "archived": _fm_str(fm, "archivada"),
        "summary": note.summary,
    }


def hq_fields(task: Task) -> dict[str, str]:
    return {
        "title": task.title,
        "status": task.status,
        "owner": task.owner_id,
        "type": task.type,
        "priority": task.priority,
        "due": svc.iso_d(task.due_date) or "",
        "start": svc.iso_d(task.start_date) or "",
        "effort": task.effort,
        "phase": task.phase or "",
        "blocker": task.blocker_reason or "",
        "archived": "true" if task.archived else "false",
        "summary": task.summary or "",
    }


def _iso(raw: str) -> str | None:
    try:
        return date.fromisoformat(raw[:10]).isoformat() if raw else None
    except ValueError:
        return None


def normalize(field: str, raw: str, people: People) -> str | None:
    """Valor del vault traducido a HQ, o None si está vacío o no se reconoce (entonces no pisa a HQ)."""
    if field in ("title", "phase", "blocker", "summary"):
        return raw or None
    if field == "status":
        return STATUS_IN.get(fold(raw))
    if field == "owner":
        return people.match(raw)
    if field == "type":
        return TYPE_IN.get(fold(raw))
    if field == "priority":
        return PRIORITY_IN.get(fold(raw))
    if field in ("due", "start"):
        return _iso(raw)
    if field == "effort":
        return EFFORT_IN.get(fold(raw))
    if field == "archived":
        return "true" if fold(raw) in TRUE_WORDS else "false"
    return None


def equivalent(field: str, normalized: str | None, hq_value: str) -> bool:
    if normalized == hq_value:
        return True
    return normalized is None and hq_value == "" and field in ("due", "start", "phase", "blocker", "summary")


def to_vault(field: str, hq_value: str, people: People) -> tuple[str, object] | None:
    key = VAULT_KEY.get(field)
    if key is None:
        return None  # el resumen vive en el cuerpo de la nota: HQ no lo reescribe
    if field == "status":
        return key, STATUS_OUT.get(hq_value, hq_value)
    if field == "owner":
        return key, people.name(hq_value)
    if field == "priority":
        return key, PRIORITY_OUT.get(hq_value, hq_value)
    if field in ("due", "start"):
        return key, date.fromisoformat(hq_value) if hq_value else None
    if field == "archived":
        return key, True if hq_value == "true" else None
    if field in ("phase", "blocker"):
        return key, hq_value or None
    return key, hq_value


def infer_type(title: str) -> str:
    text = fold(title)
    for type_id, pattern in TYPE_HINTS:
        if re.search(pattern, text):
            return type_id
    return "gestion"


def base_json(note: Note, task: Task) -> str:
    return json.dumps({"v": raw_fields(note), "h": hq_fields(task)}, ensure_ascii=False)


def _ts(moment: datetime | None) -> float:
    return moment.timestamp() if moment else 0.0


def merge(task: Task, note: Note, link: VaultLink, people: People) -> tuple[dict, dict, bool]:
    """Fusión en tres vías: devuelve (cambios para HQ, cambios para la nota, hubo conflicto)."""
    base = json.loads(link.base_json or "{}")
    base_v, base_h = base.get("v", {}), base.get("h", {})
    vault, hq = raw_fields(note), hq_fields(task)
    to_hq: dict[str, str] = {}
    to_note: dict[str, object] = {}
    conflict = False
    vault_newer = note.mtime >= _ts(task.updated_at)
    for field in FIELDS:
        v_changed = field in base_v and vault[field] != base_v[field]
        h_changed = field in base_h and hq[field] != base_h[field]
        if not (v_changed or h_changed):
            continue
        normalized = normalize(field, vault[field], people)
        if equivalent(field, normalized, hq[field]):
            continue
        if v_changed and h_changed:
            conflict = True
            v_changed, h_changed = vault_newer, not vault_newer
        if v_changed and normalized is not None:
            to_hq[field] = normalized
        elif h_changed:
            out = to_vault(field, hq[field], people)
            if out:
                to_note[out[0]] = out[1]
    return to_hq, to_note, conflict


def to_patch(changes: dict[str, str], vault: dict[str, str]) -> dict:
    patch: dict = {}
    for field, value in changes.items():
        if field == "archived":
            patch["archived"] = value == "true"
        else:
            patch[PATCH_KEY[field]] = value
    if patch.get("status") == "bloqueada" and "blockerReason" not in patch:
        patch["blockerReason"] = vault.get("blocker") or "Marcada como bloqueada en Obsidian"
    return patch


# ---------------------------------------------------------------- textos de notas nuevas
def task_note_text(task: Task, note_id: str, project: Project, people: People, today: date) -> str:
    fm = {
        "id": note_id,
        "type": "task",
        "project": project.code,
        "status": STATUS_OUT.get(task.status, task.status),
        "responsable": people.name(task.owner_id),
        "categoria": task.type,
        "prioridad": PRIORITY_OUT.get(task.priority),
        "vence": task.due_date,
        "inicio": task.start_date,
        "esfuerzo": task.effort,
        "fase": task.phase or None,
        "bloqueo": task.blocker_reason if task.status == "bloqueada" else None,
        "archivada": True if task.archived else None,
        "hq": task.key,
        "tags": [],
        "created": today,
        "updated": today,
    }
    lines = ["---", *(f"{k}: {fmt_value(v, k)}" for k, v in fm.items() if v is not None), "---", "", f"# {task.title}", ""]
    if task.summary:
        lines += [task.summary, ""]
    lines.append(f"Creada desde Liiot HQ ({task.key}).")
    return "\n".join(lines) + "\n"


def project_note_text(project: Project, people: People, today: date) -> str:
    lead = people.name(project.lead_id) if project.lead_id else ""
    lines = [
        "---",
        f"id: {project.code}",
        "type: project",
        'project: ""',
        "status: activo",
        "prioridad: media",
        "fase: descubrimiento",
        "cliente:",
        f"lider: {fmt_value(lead, 'lider')}" if lead else "lider:",
        "contribuidores: []",
        f'fecha_inicio: "{today.isoformat()}"',
        f"fecha_entrega: {project.pilot_date.isoformat()}" if project.pilot_date else "fecha_entrega:",
        "repo:",
        "url_deploy:",
        "agent_auto: true",
        "agent_action_required: false",
        "tags: []",
        f"created: {today.isoformat()}",
        f"updated: {today.isoformat()}",
        'links_parent: ""',
        'links_children: ""',
        'links_related: ""',
        "---",
        "",
        f"# {project.name}",
        "",
        "## Descripción",
        "",
        project.summary or "",
        "",
        "## Objetivo",
        "",
        "## Métricas de éxito",
        "",
        "## Próximos hitos",
        "",
        "- [ ] Hito 1 — Fecha: ",
        "",
        "## Archivos",
        "",
        "Creado desde Liiot HQ.",
    ]
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------- ajustes y estado
def settings(s: Session) -> dict:
    row = s.get(Setting, "vault")
    data = {"enabled": True, "path": ""}
    if row:
        data.update(json.loads(row.value_json or "{}"))
    return data


def save_settings(s: Session, patch: dict) -> dict:
    data = settings(s)
    if "enabled" in patch:
        data["enabled"] = bool(patch["enabled"])
    if "path" in patch:
        data["path"] = str(patch["path"] or "").strip().strip('"')
        if data["path"] and not (Path(data["path"]) / PROJECTS_DIR).is_dir():
            raise ValueError(f"En esa carpeta no está {PROJECTS_DIR}. Revisa la ruta de la bóveda.")
    row = s.get(Setting, "vault") or Setting(key="vault")
    row.value_json = json.dumps(data)
    s.add(row)
    return data


def detect_root() -> Path | None:
    for candidate in config.VAULT_CANDIDATES:
        try:
            if (candidate / PROJECTS_DIR).is_dir():
                return candidate
        except OSError:
            continue
    return None


def resolve_root(data: dict) -> Path | None:
    if config.VAULT_PATH.lower() == "off" or not data.get("enabled", True):
        return None
    raw = data.get("path") or config.VAULT_PATH
    root = Path(raw) if raw else detect_root()
    try:
        return root if root and (root / PROJECTS_DIR).is_dir() else None
    except OSError:
        return None


def activity(text: str) -> None:
    ACTIVITY.append({"at": svc.iso_dt(svc.utcnow()), "text": text})


def status_out(s: Session) -> dict:
    data = settings(s)
    root = resolve_root(data)
    detected = detect_root()
    return {
        "enabled": bool(data.get("enabled", True)) and config.VAULT_PATH.lower() != "off",
        "path": data.get("path") or (config.VAULT_PATH if config.VAULT_PATH.lower() != "off" else ""),
        "detected": str(detected) if detected else None,
        "root": str(root) if root else None,
        "vaultName": root.name if root else None,
        "connected": root is not None,
        "lastSync": STATE["lastSync"],
        "lastError": STATE["lastError"],
        "busy": STATE["busy"],
        "stats": STATE["stats"],
        "linkedTasks": len(list(s.exec(select(VaultLink)))),
        "linkedProjects": len(list(s.exec(select(VaultProjectLink)))),
        "activity": list(ACTIVITY)[::-1][:20],
    }


# ---------------------------------------------------------------- sincronización
def sync_once() -> dict:
    with _lock:
        STATE["busy"] = True
        try:
            result = _sync()
            if result.get("ok"):
                STATE["lastSync"] = svc.iso_dt(svc.utcnow())
                STATE["lastError"] = None
            return result
        except Exception as exc:  # noqa: BLE001  (un error del vault no debe tumbar HQ)
            log.exception("Fallo sincronizando con Obsidian")
            STATE["lastError"] = str(exc)
            return {"ok": False, "error": str(exc)}
        finally:
            STATE["busy"] = False


def _sync() -> dict:
    with session_scope() as s:
        root = resolve_root(settings(s))
    if root is None:
        return {"ok": False, "reason": "sin_vault"}
    today = svc.local_today()
    result = {"ok": True, "imported": 0, "exported": 0, "updatedHQ": 0, "updatedVault": 0, "projects": 0, "archived": 0, "changes": []}
    with session_scope() as s:
        people = People(svc.members_all(s))
        dirs = _sync_projects(s, root, people, result, today)
        s.commit()
        _sync_tasks(s, root, dirs, people, result, today)
        s.commit()
        STATE["stats"] = {
            "projects": len(dirs),
            "notes": sum(1 for d in dirs.values() for _ in (root / d / TASKS_DIR[0] / TASKS_DIR[1]).glob("*.md")),
        }
    return result


def _scan_projects(root: Path) -> list[tuple[str, Note]]:
    found = []
    for entry in sorted((root / PROJECTS_DIR).iterdir(), key=lambda p: p.name.lower()):
        if not entry.is_dir() or entry.name.startswith((".", "_")):
            continue
        main = entry / f"{entry.name}.md"
        if not main.is_file():
            continue
        project_note = read_note(main, root)
        if project_note is None or project_note.fm_error:
            continue
        if str(project_note.fm.get("type") or "project").strip() != "project":
            continue
        found.append((entry.relative_to(root).as_posix(), project_note))
    return found


def _sync_projects(s: Session, root: Path, people: People, result: dict, today: date) -> dict[str, str]:
    """Vincula, importa y exporta proyectos. Devuelve {project_id: carpeta relativa}."""
    projects = {p.id: p for p in svc.projects_all(s, include_archived=True)}
    links = {link.project_id: link for link in s.exec(select(VaultProjectLink))}
    by_dir = {link.dir: link for link in links.values()}
    dirs: dict[str, str] = {}
    for rel, pnote in _scan_projects(root):
        code = pnote.note_id
        link = by_dir.get(rel) or next((l for l in links.values() if code and l.note_id == code), None)
        project = projects.get(link.project_id) if link else None
        if link is not None and project is None:
            s.delete(link)  # el proyecto de HQ ya no existe: el vínculo viejo sobra
            links.pop(link.project_id, None)
        if project is None:
            project = next((p for p in projects.values() if (code and p.code == code) or p.vault_dir == rel), None)
            if project is None:
                project = _import_project(s, rel, pnote, people, list(projects.values()))
                projects[project.id] = project
                result["projects"] += 1
                activity(f"Proyecto nuevo desde Obsidian: {project.name}")
            link = VaultProjectLink(project_id=project.id, note_id=code or project.code, dir=rel)
            pnote = _first_project_link(project, pnote, people, root, today)
            link.base_json = _project_base(pnote, project)
            links[project.id] = link
        else:
            link.dir, link.note_id = rel, code or link.note_id
            pnote = _merge_project(s, project, pnote, link, people, root, today, result)
        if project.vault_dir != rel:
            project.vault_dir = rel
            s.add(project)
        link.synced_at = svc.utcnow()
        s.add(link)
        if not project.archived:
            dirs[project.id] = rel
    for project in projects.values():
        if project.archived or project.id in dirs:
            continue
        rel = _export_project(project, people, root, today)
        project.vault_dir = rel
        s.add(project)
        pnote = read_note(root / rel / f"{Path(rel).name}.md", root)
        if pnote:
            s.add(VaultProjectLink(project_id=project.id, note_id=project.code, dir=rel, base_json=_project_base(pnote, project), synced_at=svc.utcnow()))
        dirs[project.id] = rel
        result["projects"] += 1
        activity(f"Se creó la carpeta del proyecto {project.name} en Obsidian")
    return dirs


def _project_raw(pnote: Note) -> dict[str, str]:
    return {"lead": _fm_str(pnote.fm, "lider"), "delivery": _fm_str(pnote.fm, "fecha_entrega")}


def _project_hq(project: Project) -> dict[str, str]:
    return {"lead": project.lead_id or "", "delivery": svc.iso_d(project.pilot_date) or ""}


def _project_base(pnote: Note, project: Project) -> str:
    return json.dumps({"v": _project_raw(pnote), "h": _project_hq(project)}, ensure_ascii=False)


def _first_project_link(project: Project, pnote: Note, people: People, root: Path, today: date) -> Note:
    """Al vincular por primera vez solo se completa lo que la nota tiene vacío; nada se pisa."""
    raw, hq = _project_raw(pnote), _project_hq(project)
    updates: dict[str, object] = {}
    if not raw["lead"] and hq["lead"]:
        updates["lider"] = people.name(hq["lead"])
    if not raw["delivery"] and hq["delivery"]:
        updates["fecha_entrega"] = date.fromisoformat(hq["delivery"])
    return write_note(pnote, updates, root, today) if updates else pnote


def _merge_project(s: Session, project: Project, pnote: Note, link: VaultProjectLink, people: People, root: Path, today: date, result: dict) -> Note:
    base = json.loads(link.base_json or "{}")
    base_v, base_h = base.get("v", {}), base.get("h", {})
    raw, hq = _project_raw(pnote), _project_hq(project)
    updates: dict[str, object] = {}
    vault_newer = True  # HQ no guarda cuándo se editó el proyecto: si cambiaron los dos lados, gana la nota
    for field in ("lead", "delivery"):
        v_changed = field in base_v and raw[field] != base_v[field]
        h_changed = field in base_h and hq[field] != base_h[field]
        normalized = people.match(raw[field]) if field == "lead" else _iso(raw[field])
        if not (v_changed or h_changed) or (normalized or "") == hq[field]:
            continue
        if v_changed and (not h_changed or vault_newer) and normalized is not None:
            if field == "lead":
                project.lead_id = normalized
            else:
                project.pilot_date = date.fromisoformat(normalized)
            s.add(project)
            result["updatedHQ"] += 1
        elif h_changed:
            if field == "lead":
                updates["lider"] = people.name(hq["lead"]) if hq["lead"] else ""
            else:
                updates["fecha_entrega"] = date.fromisoformat(hq["delivery"]) if hq["delivery"] else ""
    if updates:
        pnote = write_note(pnote, updates, root, today)
        result["updatedVault"] += 1
    link.base_json = _project_base(pnote, project)
    return pnote


def _import_project(s: Session, rel: str, pnote: Note, people: People, existing: list[Project]) -> Project:
    name = Path(rel).name
    code = pnote.note_id
    prefix = svc.derive_prefix(code, name, {p.key_prefix for p in existing})
    ids, base_id = {p.id for p in existing}, svc.slugify(name) or prefix.lower()
    pid, n = base_id, 2
    while pid in ids:
        pid, n = f"{base_id}-{n}", n + 1
    project = Project(
        id=pid,
        code=code or f"PRJ-{prefix}",
        name=name,
        summary=section_text(pnote, "Descripción"),
        lead_id=people.match(_fm_str(pnote.fm, "lider")),
        pilot_date=date.fromisoformat(_iso(_fm_str(pnote.fm, "fecha_entrega"))) if _iso(_fm_str(pnote.fm, "fecha_entrega")) else None,
        phase=_fm_str(pnote.fm, "fase"),
        key_prefix=prefix,
        theme="liiot",
        color=svc.PROJECT_COLORS[len(existing) % len(svc.PROJECT_COLORS)],
        vault_dir=rel,
        order=max((p.order for p in existing), default=0) + 1,
    )
    s.add(project)
    s.flush()
    return project


def _export_project(project: Project, people: People, root: Path, today: date) -> str:
    name = safe_filename(project.name) or project.key_prefix
    folder = root / PROJECTS_DIR / name
    for sub in PROJECT_SUBDIRS:
        (folder / sub).mkdir(parents=True, exist_ok=True)
    main = folder / f"{name}.md"
    if not main.exists():
        main.write_text(project_note_text(project, people, today), encoding="utf-8")
    return folder.relative_to(root).as_posix()


def _sync_tasks(s: Session, root: Path, dirs: dict[str, str], people: People, result: dict, today: date) -> None:
    projects = {p.id: p for p in svc.projects_all(s, include_archived=True)}
    tasks = {t.id: t for t in s.exec(select(Task))}
    links = {link.task_id: link for link in s.exec(select(VaultLink))}
    links_by_note = {link.note_id: link for link in links.values()}
    by_legacy = {t.legacy_id: t for t in tasks.values() if t.legacy_id}
    index: dict[str, list[Note]] = {}
    available: set[str] = set()
    for pid, rel in dirs.items():
        folder = root / rel / TASKS_DIR[0] / TASKS_DIR[1]
        if (root / rel).is_dir():
            available.add(pid)
        notes = [n for n in (read_note(p, root) for p in sorted(folder.glob("*.md"))) if n] if folder.is_dir() else []
        index[pid] = notes
    used_ids = {n.note_id for notes in index.values() for n in notes if n.note_id}
    seen: set[str] = set()

    for pid, notes in index.items():
        project = projects[pid]
        for tnote in notes:
            if tnote.fm_error:
                continue  # frontmatter roto: no se toca la nota
            if str(tnote.fm.get("type") or "task").strip() != "task":
                continue
            note_id = tnote.note_id
            if not note_id:
                note_id = new_task_id(used_ids, today)
                tnote = write_note(tnote, {"id": note_id, "type": "task", "project": project.code,
                                           "status": _fm_str(tnote.fm, "status") or "por_hacer"}, root, today)
            if note_id in seen:
                continue  # id repetido (nota duplicada): se ignora la segunda
            seen.add(note_id)
            link = links_by_note.get(note_id)
            if link and link.task_id in tasks:
                task = tasks[link.task_id]
                link.missing = 0
                link.path = tnote.rel
                if task.project_id != pid:
                    task.project_id = pid
                    svc.log_event(s, task.id, ACTOR, SOURCE, "obsidian", f"Pasó al proyecto {project.name} (se movió la nota)")
                _merge_linked(s, task, tnote, link, people, result, root, today)
            elif note_id in by_legacy and by_legacy[note_id].id not in links:
                task = by_legacy[note_id]
                links[task.id] = _first_link(s, task, tnote, people, result, root, today)
            else:
                task = _import_task(s, tnote, note_id, project, people)
                links[task.id] = VaultLink(task_id=task.id, note_id=note_id, path=tnote.rel, base_json=base_json(tnote, task),
                                           synced_at=svc.utcnow())
                s.add(links[task.id])
                s.commit()
                result["imported"] += 1
                activity(f"{task.key} llegó desde Obsidian: {task.title}")

    # Tareas de HQ que todavía no tienen nota
    for task in tasks.values():
        if task.id in links or task.archived or task.project_id not in available:
            continue
        project = projects.get(task.project_id)
        if project is None:
            continue
        links[task.id] = _export_task(s, task, project, dirs[task.project_id], people, used_ids, root, today)
        seen.add(links[task.id].note_id)  # recién creada: no cuenta como nota desaparecida
        s.commit()
        result["exported"] += 1
        activity(f"{task.key} se creó en Obsidian: {task.title}")

    # Notas que desaparecieron (se borraron o se movieron fuera de 10_Proyectos)
    missing: dict[str, list[tuple[VaultLink, Task]]] = {}
    for link in links.values():
        task = tasks.get(link.task_id)
        if task is None or link.note_id in seen or task.project_id not in available:
            continue
        missing.setdefault(task.project_id, []).append((link, task))
    for pid, items in missing.items():
        linked = sum(1 for link in links.values() if tasks.get(link.task_id) and tasks[link.task_id].project_id == pid)
        if len(items) > max(3, linked * 0.3):
            activity(f"No aparecen {len(items)} notas de {projects[pid].name}: no se archiva nada (puede ser Google Drive sincronizando).")
            continue
        for link, task in items:
            link.missing += 1
            s.add(link)
            if link.missing >= 2 and not task.archived:
                info = svc.apply_patch(s, task, {"archived": True}, ACTOR, SOURCE)
                svc.log_event(s, task.id, ACTOR, SOURCE, "obsidian", "Se borró su nota en Obsidian")
                result["archived"] += 1
                result["changes"].append({"taskId": task.id, "info": info, "ownerId": task.owner_id, "key": task.key})
                activity(f"{task.key} se archivó porque su nota ya no está en Obsidian")


def _merge_linked(s: Session, task: Task, tnote: Note, link: VaultLink, people: People, result: dict, root: Path, today: date) -> None:
    to_hq, to_note, conflict = merge(task, tnote, link, people)
    if to_hq:
        info = svc.apply_patch(s, task, to_patch(to_hq, raw_fields(tnote)), ACTOR, SOURCE)
        if info["changed"]:
            result["updatedHQ"] += 1
            result["changes"].append({"taskId": task.id, "info": info, "ownerId": task.owner_id, "key": task.key})
            activity(f"{task.key}: {', '.join(LABEL[f] for f in to_hq)} actualizado desde Obsidian")
    if conflict:
        svc.log_event(s, task.id, ACTOR, SOURCE, "obsidian", "Cambió en HQ y en Obsidian a la vez: quedó el cambio más reciente")
    if to_note:
        if "hq" not in tnote.fm:
            to_note["hq"] = task.key
        tnote = write_note(tnote, to_note, root, today)
        result["updatedVault"] += 1
        activity(f"{task.key}: Obsidian actualizado ({', '.join(to_note)})")
    link.base_json = base_json(tnote, task)
    link.synced_at = svc.utcnow()
    s.add(link)


def _first_link(s: Session, task: Task, tnote: Note, people: People, result: dict, root: Path, today: date) -> VaultLink:
    """Tarea de HQ que vino del vault (legacy_id): se reconcilia el estado por fecha y se completa lo que falta en la nota."""
    vault, hq = raw_fields(tnote), hq_fields(task)
    updates: dict[str, object] = {}
    status = normalize("status", vault["status"], people)
    if status and status != task.status:
        if tnote.mtime > _ts(task.updated_at):
            info = svc.apply_patch(s, task, to_patch({"status": status}, vault), ACTOR, SOURCE)
            result["updatedHQ"] += 1
            result["changes"].append({"taskId": task.id, "info": info, "ownerId": task.owner_id, "key": task.key})
        else:
            updates["status"] = STATUS_OUT.get(task.status, task.status)
    for field in ("priority", "due", "start", "effort"):
        if not vault[field] and hq[field]:
            out = to_vault(field, hq[field], people)
            if out:
                updates[out[0]] = out[1]
    if "hq" not in tnote.fm:
        updates["hq"] = task.key
    if updates:
        tnote = write_note(tnote, updates, root, today)
        result["updatedVault"] += 1
    link = VaultLink(task_id=task.id, note_id=tnote.note_id, path=tnote.rel, base_json=base_json(tnote, task), synced_at=svc.utcnow())
    s.add(link)
    activity(f"{task.key} quedó vinculada con su nota de Obsidian")
    return link


def _import_task(s: Session, tnote: Note, note_id: str, project: Project, people: People) -> Task:
    vault = raw_fields(tnote)
    created = _iso(_fm_str(tnote.fm, "created"))
    status = normalize("status", vault["status"], people) or "por_hacer"
    data = {
        "projectId": project.id,
        "title": vault["title"][:300],
        "summary": vault["summary"],
        "type": normalize("type", vault["type"], people) or infer_type(vault["title"]),
        "priority": normalize("priority", vault["priority"], people) or "P2",
        "status": status,
        "ownerId": normalize("owner", vault["owner"], people) or project.lead_id or people.first,
        "dueDate": normalize("due", vault["due"], people),
        "startDate": normalize("start", vault["start"], people) or created,
        "effort": normalize("effort", vault["effort"], people) or "M",
        "phase": vault["phase"],
        "legacyId": note_id,
        "origin": "Obsidian",
        "blockerReason": vault["blocker"] or "Marcada como bloqueada en Obsidian",
    }
    task = svc.create_task(s, data, ACTOR, SOURCE)
    if fold(vault["archived"]) in TRUE_WORDS:
        task.archived = True
        s.add(task)
    s.flush()
    return task


def _export_task(s: Session, task: Task, project: Project, rel: str, people: People, used_ids: set[str], root: Path, today: date) -> VaultLink:
    folder = root / rel / TASKS_DIR[0] / TASKS_DIR[1]
    folder.mkdir(parents=True, exist_ok=True)
    note_id = task.legacy_id if task.legacy_id and task.legacy_id not in used_ids else new_task_id(used_ids, today)
    used_ids.add(note_id)
    name = safe_filename(task.title) or task.key
    path, n = folder / f"{name}.md", 2
    while path.exists():
        path, n = folder / f"{name} ({n}).md", n + 1
    text = task_note_text(task, note_id, project, people, today)
    with open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write(text)
    st = path.stat()
    tnote = build_note(path, root, text, st.st_mtime)
    _cache[str(path)] = (st.st_mtime, st.st_size, tnote)
    if task.legacy_id != note_id:
        task.legacy_id = note_id
        s.add(task)
    link = VaultLink(task_id=task.id, note_id=note_id, path=tnote.rel, base_json=base_json(tnote, task), synced_at=svc.utcnow())
    s.add(link)
    return link


def task_paths(s: Session) -> dict[int, str]:
    return {link.task_id: link.path for link in s.exec(select(VaultLink))}


# ---------------------------------------------------------------- ciclo en segundo plano
def request_sync() -> None:
    """Pide una sincronización pronta (tras un cambio en HQ)."""
    if _wake is not None:
        _wake.set()


async def sync_and_notify() -> dict:
    from .hooks import task_changed
    from .realtime import notify

    previous_error = STATE["lastError"]
    result = await asyncio.to_thread(sync_once)
    touched = any(result.get(k) for k in ("imported", "exported", "updatedHQ", "updatedVault", "projects", "archived"))
    if touched:
        await notify("project")  # refresca proyectos y tareas (incluido el enlace a su nota) en las pantallas abiertas
    for change in result.get("changes", []):
        await task_changed(change["taskId"], change["info"], ACTOR, SOURCE, owner_id=change["ownerId"], task_key=change["key"])
    if touched or STATE["lastError"] != previous_error:
        await notify("vault")
    return result


async def run_loop() -> None:
    global _wake
    _wake = asyncio.Event()
    first = True
    while True:
        if not first:
            try:
                await asyncio.wait_for(_wake.wait(), timeout=INTERVAL)
                await asyncio.sleep(1.2)  # agrupa varios cambios seguidos en una sola pasada
            except asyncio.TimeoutError:
                pass
        first = False
        _wake.clear()
        try:
            await sync_and_notify()
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            log.exception("Error en la sincronización con Obsidian")
