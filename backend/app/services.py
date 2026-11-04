"""Lógica de negocio: tareas, checklist, rúbrica, presencia en la oficina, proyectos y ajustes."""
from __future__ import annotations

import json
import re
import secrets
import unicodedata
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlmodel import Session, select

from . import config
from .catalog import (
    CRITERION_STATES,
    DEFAULT_TELEGRAM,
    DONE,
    LEGACY_STATUS,
    PAUSED,
    PRESENCE_LABEL,
    PRESENCE_STATES,
    PRIORITIES,
    PRIORITY_LABEL,
    PRIORITY_WORDS,
    STATUS_LABEL,
    STATUSES,
    TYPE_BY_ID,
)
from .models import (
    CheckIn,
    Member,
    Phase,
    PhaseCheck,
    Project,
    RubricCategory,
    RubricCriterion,
    RubricReview,
    Setting,
    Stage,
    Task,
    TaskEvent,
)

TZ = ZoneInfo(config.TZ_NAME)
MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
MONTHS_LONG = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
DAYS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]
PRIORITY_RANK = {p: i for i, p in enumerate(PRIORITIES)}
CHECKLIST_MAX = 60


# ---------------------------------------------------------------- tiempo y formato
def utcnow() -> datetime:
    """Hora actual en UTC con zona (SQLModel guarda y devuelve fechas con zona)."""
    return datetime.now(timezone.utc)


def aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def local_now() -> datetime:
    return datetime.now(TZ)


def local_today() -> date:
    return local_now().date()


def iso_dt(value: datetime | None) -> str | None:
    if value is None:
        return None
    return aware(value).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def iso_d(value: date | None) -> str | None:
    return value.isoformat() if value else None


def parse_date(value) -> date | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def fmt_date(value: date | None) -> str:
    if not value:
        return "sin fecha"
    return f"{DAYS[value.weekday()]} {value.day} {MONTHS[value.month - 1]}"


def parse_hhmm(value: str | None, fallback: str = "08:00") -> time:
    for candidate in (value, fallback):
        try:
            hh, mm = str(candidate).split(":")
            return time(int(hh), int(mm))
        except (ValueError, AttributeError):
            continue
    return time(8, 0)


def csv_list(value: str | None) -> list[str]:
    return [item for item in (value or "").split(",") if item]


def to_csv(items) -> str:
    seen: list[str] = []
    for item in items or []:
        text = str(item).strip()
        if text and text not in seen:
            seen.append(text)
    return ",".join(seen)


def norm_status(value) -> str | None:
    raw = str(value or "").strip()
    raw = LEGACY_STATUS.get(raw, raw)
    return raw if raw in STATUSES else None


def norm_priority(value) -> str | None:
    raw = str(value or "").strip()
    if raw.upper() in PRIORITIES:
        return raw.upper()
    return PRIORITY_WORDS.get(raw.lower())


# ---------------------------------------------------------------- consultas base
def members_all(s: Session) -> list[Member]:
    return list(s.exec(select(Member).order_by(Member.order)))


def member_names(s: Session) -> dict[str, str]:
    return {m.id: m.name for m in members_all(s)}


def stages_all(s: Session, project_id: str = config.DEFAULT_PROJECT, phase_id: int | None = None) -> list[Stage]:
    query = select(Stage).where(Stage.project_id == project_id)
    if phase_id is not None:
        query = query.where(Stage.phase_id == phase_id)
    return list(s.exec(query.order_by(Stage.order, Stage.start)))


def phases_all(s: Session, project_id: str) -> list[Phase]:
    return list(s.exec(select(Phase).where(Phase.project_id == project_id).order_by(Phase.order, Phase.id)))


def tasks_all(s: Session, project_id: str | None = None, include_archived: bool = False) -> list[Task]:
    """Tareas de un proyecto, o de todos si project_id es None."""
    query = select(Task)
    if project_id:
        query = query.where(Task.project_id == project_id)
    if not include_archived:
        query = query.where(Task.archived == False)  # noqa: E712
    return list(s.exec(query.order_by(Task.sort, Task.id)))


def categories_for(s: Session, phase_id: int) -> list[RubricCategory]:
    return list(s.exec(select(RubricCategory).where(RubricCategory.phase_id == phase_id).order_by(RubricCategory.order, RubricCategory.id)))


def criteria_all(s: Session, phase_id: int) -> list[RubricCriterion]:
    cat_ids = [c.id for c in categories_for(s, phase_id)]
    if not cat_ids:
        return []
    return list(s.exec(select(RubricCriterion).where(RubricCriterion.category_id.in_(cat_ids))))


def projects_all(s: Session, include_archived: bool = False) -> list[Project]:
    query = select(Project)
    if not include_archived:
        query = query.where(Project.archived == False)  # noqa: E712
    return list(s.exec(query.order_by(Project.order, Project.name)))


def default_project_id(s: Session) -> str:
    if s.get(Project, config.DEFAULT_PROJECT):
        return config.DEFAULT_PROJECT
    first = projects_all(s)
    return first[0].id if first else config.DEFAULT_PROJECT


def task_by_key(s: Session, key: str) -> Task | None:
    return s.exec(select(Task).where(Task.key == key.strip().upper())).first()


def member_by_telegram(s: Session, user_id: int) -> Member | None:
    return s.exec(select(Member).where(Member.telegram_chat_id == user_id)).first()


def current_phase(s: Session, project: Project) -> Phase | None:
    phase = s.get(Phase, project.current_phase_id) if project.current_phase_id else None
    if phase and phase.project_id == project.id:
        return phase
    phases = phases_all(s, project.id)
    return next((p for p in phases if p.status == "en_curso"), phases[0] if phases else None)


# ---------------------------------------------------------------- checklist
def checklist_of(t: Task) -> list[dict]:
    try:
        items = json.loads(t.checklist_json or "[]")
    except ValueError:
        return []
    return [i for i in items if isinstance(i, dict) and str(i.get("text") or "").strip()]


def clean_checklist(raw, previous: list[dict] | None = None) -> list[dict]:
    """Normaliza el checklist que llega de la web, Telegram u Obsidian: texto, hecho y un id estable."""
    previous = previous or []
    by_id = {i["id"]: i for i in previous if i.get("id")}
    by_text = {str(i["text"]).strip().lower(): i for i in previous}
    out: list[dict] = []
    used: set[str] = set()
    for item in list(raw or [])[:CHECKLIST_MAX]:
        if isinstance(item, str):
            item = {"text": item, "done": False}
        if not isinstance(item, dict):
            continue
        text = re.sub(r"\s+", " ", str(item.get("text") or "")).strip()[:200]
        if not text:
            continue
        known = by_id.get(str(item.get("id") or "")) or by_text.get(text.lower())
        item_id = str(item.get("id") or (known or {}).get("id") or secrets.token_hex(4))
        while item_id in used:
            item_id = secrets.token_hex(4)
        used.add(item_id)
        out.append({"id": item_id, "text": text, "done": bool(item.get("done"))})
    return out


def checklist_pct(items: list[dict]) -> int:
    return round(sum(1 for i in items if i["done"]) * 100 / len(items)) if items else 0


def task_progress(t: Task, items: list[dict] | None = None) -> int:
    if t.status == DONE:
        return 100
    return checklist_pct(items if items is not None else checklist_of(t))


# ---------------------------------------------------------------- serialización
def work_days(m: Member) -> list[int]:
    return sorted({int(d) for d in (m.work_days or "").split(",") if d.strip().isdigit() and 0 <= int(d) <= 6})


def member_out(m: Member, private: bool = False) -> dict:
    out = {
        "id": m.id,
        "name": m.name,
        "fullName": m.full_name,
        "role": m.role,
        "area": m.area,
        "color": m.color,
        "avatar": json.loads(m.avatar_json or "{}"),
        "telegramLinked": m.telegram_chat_id is not None,
        "workStart": m.work_start,
        "workEnd": m.work_end,
        "workDays": work_days(m),
        "quietUntil": iso_dt(m.quiet_until),
        "order": m.order,
        "hasAccount": bool(m.password_hash),
        "isAdmin": m.is_admin,
    }
    if private:
        out.update({
            "username": m.username,
            "email": m.email,
            "active": m.active,
            "telegramUsername": m.telegram_username,
            "linkCode": m.link_code,
            "lastLoginAt": iso_dt(m.last_login_at),
        })
    return out


def project_out(p: Project, tasks: list[Task] | None = None, phase: Phase | None = None) -> dict:
    out = {
        "id": p.id,
        "code": p.code,
        "name": p.name,
        "summary": p.summary,
        "leadId": p.lead_id,
        "pilotDate": iso_d(p.pilot_date),
        "backupDate": iso_d(p.backup_date),
        "phase": p.phase,
        "keyPrefix": p.key_prefix,
        "theme": p.theme if p.theme in ("bleepy", "liiot") else "liiot",
        "color": p.color,
        "archived": p.archived,
        "vaultDir": p.vault_dir,
        "order": p.order,
        "currentPhaseId": phase.id if phase else p.current_phase_id,
        "currentPhaseName": phase.name if phase else None,
    }
    if tasks is not None:
        today = local_today()
        mine = [t for t in tasks if t.project_id == p.id]
        out["counts"] = {
            "total": len(mine),
            "open": sum(1 for t in mine if t.status != DONE),
            "done": sum(1 for t in mine if t.status == DONE),
            "paused": sum(1 for t in mine if t.status == PAUSED),
            "overdue": sum(1 for t in mine if t.status != DONE and t.due_date and t.due_date < today),
        }
    return out


def stage_out(st: Stage) -> dict:
    return {
        "id": st.id,
        "projectId": st.project_id,
        "phaseId": st.phase_id,
        "order": st.order,
        "name": st.name,
        "start": iso_d(st.start),
        "end": iso_d(st.end),
        "exitCriteria": st.exit_criteria,
    }


def task_out(t: Task, vault_path: str | None = None) -> dict:
    items = checklist_of(t)
    return {
        "id": t.id,
        "key": t.key,
        "projectId": t.project_id,
        "phaseId": t.phase_id,
        "stageId": t.stage_id,
        "vaultPath": vault_path,
        "title": t.title,
        "summary": t.summary,
        "type": t.type,
        "priority": t.priority,
        "status": t.status,
        "ownerId": t.owner_id,
        "collaborators": csv_list(t.collaborators),
        "startDate": iso_d(t.start_date),
        "dueDate": iso_d(t.due_date),
        "dueOriginal": iso_d(t.due_original),
        "reschedules": t.reschedules,
        "origin": t.origin,
        "legacyId": t.legacy_id,
        "blockerReason": t.blocker_reason,
        "blockerWaitingOn": t.blocker_waiting_on,
        "blockedSince": iso_dt(t.blocked_since),
        "checklist": items,
        "progress": task_progress(t, items),
        "archived": t.archived,
        "createdAt": iso_dt(t.created_at),
        "updatedAt": iso_dt(t.updated_at),
        "completedAt": iso_dt(t.completed_at),
        "sort": t.sort,
    }


def task_brief(t: Task | None) -> dict | None:
    if t is None:
        return None
    return {
        "id": t.id,
        "key": t.key,
        "title": t.title,
        "status": t.status,
        "priority": t.priority,
        "type": t.type,
        "dueDate": iso_d(t.due_date),
        "projectId": t.project_id,
    }


def event_out(e: TaskEvent) -> dict:
    return {"id": e.id, "taskId": e.task_id, "at": iso_dt(e.at), "actor": e.actor, "source": e.source, "kind": e.kind, "text": e.text}


def criterion_out(c: RubricCriterion) -> dict:
    return {
        "id": c.id,
        "categoryId": c.category_id,
        "code": c.code,
        "title": c.title,
        "verify": c.verify,
        "blocking": c.blocking,
        "state": c.state,
        "ownerId": c.owner_id,
        "notes": c.notes,
        "order": c.order,
        "updatedAt": iso_dt(c.updated_at),
    }


def review_out(r: RubricReview) -> dict:
    return {
        "id": r.id,
        "at": iso_dt(r.at),
        "reviewerId": r.reviewer_id,
        "decision": r.decision,
        "blockingOk": r.blocking_ok,
        "blockingTotal": r.blocking_total,
        "othersOk": r.others_ok,
        "othersTotal": r.others_total,
        "notes": r.notes,
    }


def checkin_out(c: CheckIn) -> dict:
    return {
        "id": c.id,
        "at": iso_dt(c.at),
        "memberId": c.member_id,
        "taskId": c.task_id,
        "kind": c.kind,
        "chat": c.chat,
        "text": c.text,
        "answer": c.answer,
        "answeredAt": iso_dt(c.answered_at),
    }


# ---------------------------------------------------------------- tareas
def log_event(s: Session, task_id: int, actor: str | None, source: str, kind: str, text: str) -> None:
    s.add(TaskEvent(task_id=task_id, at=utcnow(), actor=actor or "sistema", source=source, kind=kind, text=text))


def stage_for_date(s: Session, project_id: str, day: date | None, phase_id: int | None = None) -> int | None:
    if day is None:
        return None
    for st in stages_all(s, project_id, phase_id):
        if st.start <= day <= st.end:
            return st.id
    return None


def next_key(s: Session, project: Project) -> str:
    prefix = f"{project.key_prefix}-"
    numbers = [
        int(t.key.split("-")[-1])
        for t in s.exec(select(Task).where(Task.project_id == project.id))
        if t.key.startswith(prefix) and t.key.split("-")[-1].isdigit()
    ]
    return f"{prefix}{max(numbers, default=0) + 1}"


def _check_member(s: Session, member_id: str | None, field: str) -> None:
    if member_id and s.get(Member, member_id) is None:
        raise ValueError(f"{field}: no existe la persona «{member_id}».")


def _phase_in(s: Session, project_id: str, phase_id) -> int | None:
    if phase_id in (None, ""):
        return None
    phase = s.get(Phase, int(phase_id))
    if phase is None or phase.project_id != project_id:
        raise ValueError("Esa fase no es de este proyecto.")
    return phase.id


def _stage_in(s: Session, project_id: str, stage_id) -> Stage | None:
    if stage_id in (None, ""):
        return None
    stage = s.get(Stage, int(stage_id))
    if stage is None or stage.project_id != project_id:
        raise ValueError("Esa etapa no es de este proyecto.")
    return stage


def create_task(s: Session, data: dict, actor: str, source: str = "web") -> Task:
    title = re.sub(r"\s+", " ", str(data.get("title") or "")).strip()
    if not title:
        raise ValueError("La tarea necesita un título.")
    summary = str(data.get("summary") or "").strip()
    if not summary and source in ("web", "telegram"):
        raise ValueError("Cuéntale al equipo de qué se trata la tarea: la descripción es obligatoria.")
    project = s.get(Project, data.get("projectId") or default_project_id(s))
    if project is None:
        raise ValueError("El proyecto no existe.")
    owner = data.get("ownerId") or actor
    _check_member(s, owner, "Responsable")
    task_type = data.get("type") or "gestion"
    if task_type not in TYPE_BY_ID:
        raise ValueError(f"Tipo de tarea desconocido: {task_type}.")
    priority = norm_priority(data.get("priority") or "P2")
    if priority is None:
        raise ValueError("La prioridad debe ser Baja, Media, Alta o Crítica.")
    status = norm_status(data.get("status")) or "pendiente"
    due = parse_date(data.get("dueDate"))
    stage = _stage_in(s, project.id, data.get("stageId"))
    phase_id = _phase_in(s, project.id, data.get("phaseId"))
    if stage and stage.phase_id:
        phase_id = stage.phase_id
    if phase_id is None and "phaseId" not in data:
        cur = current_phase(s, project)
        phase_id = cur.id if cur else None
    stage_id = stage.id if stage else (stage_for_date(s, project.id, due, phase_id) if "stageId" not in data else None)
    items = clean_checklist(data.get("checklist") or [])
    now = utcnow()
    task = Task(
        key=next_key(s, project),
        project_id=project.id,
        title=title[:300],
        summary=summary,
        type=task_type,
        priority=priority,
        status=status,
        owner_id=owner,
        collaborators=to_csv(data.get("collaborators") or []),
        start_date=parse_date(data.get("startDate")) or local_today(),
        due_date=due,
        due_original=due,
        phase_id=phase_id,
        stage_id=stage_id,
        origin=data.get("origin") or ("Telegram" if source == "telegram" else "Liiot Hub"),
        legacy_id=data.get("legacyId") or None,
        checklist_json=json.dumps(items, ensure_ascii=False),
        created_at=now,
        updated_at=now,
    )
    if task.status == DONE:
        task.completed_at = now
    if task.status == PAUSED:
        task.blocker_reason = str(data.get("blockerReason") or "Sin detalle").strip()
        task.blocker_waiting_on = data.get("blockerWaitingOn") or None
        task.blocked_since = now
    task.progress = task_progress(task, items)
    s.add(task)
    s.flush()
    log_event(s, task.id, actor, source, "creacion", "Creó la tarea")
    return task


SIMPLE_FIELDS = {
    "title": "title",
    "summary": "summary",
    "type": "type",
    "priority": "priority",
    "ownerId": "owner_id",
    "startDate": "start_date",
    "dueDate": "due_date",
    "sort": "sort",
    "origin": "origin",
}


def _checklist_changes(old: list[dict], new: list[dict]) -> list[str]:
    before = {i["id"]: i for i in old}
    after = {i["id"]: i for i in new}
    notes = []
    for item in new:
        prev = before.get(item["id"])
        if prev is None:
            notes.append(f"Agregó «{item['text']}» al checklist")
        elif prev["done"] != item["done"]:
            notes.append(f"{'Completó' if item['done'] else 'Reabrió'} «{item['text']}»")
        elif prev["text"] != item["text"]:
            notes.append(f"Editó «{item['text']}» en el checklist")
    notes.extend(f"Quitó «{i['text']}» del checklist" for i in old if i["id"] not in after)
    return notes


def apply_patch(s: Session, task: Task, patch: dict, actor: str, source: str = "web") -> dict:
    """Aplica cambios a una tarea, registra la bitácora y devuelve qué pasó."""
    names = member_names(s)
    info = {"done": False, "paused": False, "unpaused": False, "testing": False, "rescheduled": False, "reassigned": False,
            "changed": False, "statusFrom": None, "statusTo": None}

    def who(member_id: str | None) -> str:
        return names.get(member_id or "", member_id or "nadie")

    for key, attr in SIMPLE_FIELDS.items():
        if key not in patch:
            continue
        value = patch[key]
        if attr in ("start_date", "due_date"):
            value = parse_date(value)
        elif attr == "sort":
            value = float(value or 0)
        elif attr in ("title", "summary", "origin"):
            value = str(value or "").strip()
            if attr == "title" and not value:
                raise ValueError("El título no puede quedar vacío.")
            if attr == "summary" and not value and source == "web" and task.summary:
                raise ValueError("La descripción no puede quedar vacía: cuenta de qué se trata la tarea.")
        elif attr == "type" and value not in TYPE_BY_ID:
            raise ValueError(f"Tipo de tarea desconocido: {value}.")
        elif attr == "priority":
            value = norm_priority(value)
            if value is None:
                raise ValueError("La prioridad debe ser Baja, Media, Alta o Crítica.")
        elif attr == "owner_id":
            _check_member(s, value, "Responsable")
        old = getattr(task, attr)
        if old == value:
            continue
        info["changed"] = True
        if attr == "due_date":
            if task.due_original is None:
                task.due_original = old or value
            if old is not None and value is not None and value > old:
                task.reschedules += 1
            info["rescheduled"] = True
            log_event(s, task.id, actor, source, "fecha", f"Fecha de entrega: {fmt_date(old)} → {fmt_date(value)}")
        elif attr == "owner_id":
            info["reassigned"] = True
            log_event(s, task.id, actor, source, "asignacion", f"Responsable: {who(old)} → {who(value)}")
        elif attr == "priority":
            log_event(s, task.id, actor, source, "prioridad", f"Prioridad: {PRIORITY_LABEL.get(old, old)} → {PRIORITY_LABEL[value]}")
        elif attr == "type":
            log_event(s, task.id, actor, source, "tipo", f"Tipo: {TYPE_BY_ID[old]['label'] if old in TYPE_BY_ID else old} → {TYPE_BY_ID[value]['label']}")
        elif attr == "title":
            log_event(s, task.id, actor, source, "edicion", "Cambió el título")
        elif attr == "summary":
            log_event(s, task.id, actor, source, "edicion", "Editó la descripción")
        elif attr == "start_date":
            log_event(s, task.id, actor, source, "fecha", f"Inicio: {fmt_date(value)}")
        setattr(task, attr, value)

    if "phaseId" in patch:
        phase_id = _phase_in(s, task.project_id, patch["phaseId"])
        if phase_id != task.phase_id:
            task.phase_id = phase_id
            phase = s.get(Phase, phase_id) if phase_id else None
            stage = s.get(Stage, task.stage_id) if task.stage_id else None
            if stage and stage.phase_id != phase_id:
                task.stage_id = None
            info["changed"] = True
            log_event(s, task.id, actor, source, "fase", f"Fase: {phase.name if phase else 'sin fase'}")
    if "stageId" in patch:
        stage = _stage_in(s, task.project_id, patch["stageId"])
        new_id = stage.id if stage else None
        if new_id != task.stage_id:
            task.stage_id = new_id
            if stage and stage.phase_id and stage.phase_id != task.phase_id:
                task.phase_id = stage.phase_id
            info["changed"] = True
            log_event(s, task.id, actor, source, "etapa", f"Etapa: {stage.name if stage else 'sin etapa'}")

    if "collaborators" in patch:
        value = to_csv(patch["collaborators"])
        if value != task.collaborators:
            task.collaborators = value
            info["changed"] = True
            log_event(s, task.id, actor, source, "asignacion", "Actualizó colaboradores: " + (", ".join(who(m) for m in csv_list(value)) or "ninguno"))

    if "checklist" in patch:
        old_items = checklist_of(task)
        new_items = clean_checklist(patch["checklist"], old_items)
        if new_items != old_items:
            task.checklist_json = json.dumps(new_items, ensure_ascii=False)
            info["changed"] = True
            notes = _checklist_changes(old_items, new_items)
            if len(notes) > 3:
                log_event(s, task.id, actor, source, "checklist", f"Actualizó el checklist ({sum(1 for i in new_items if i['done'])} de {len(new_items)} listos)")
            else:
                for note in notes:
                    log_event(s, task.id, actor, source, "checklist", note)

    new_status = norm_status(patch.get("status")) if patch.get("status") is not None else None
    if patch.get("status") is not None and new_status is None:
        raise ValueError("Estado desconocido.")
    if new_status is not None and new_status != task.status:
        old_status = task.status
        task.status = new_status
        info.update(changed=True, statusFrom=old_status, statusTo=new_status)
        if new_status == PAUSED:
            reason = str(patch.get("blockerReason") or task.blocker_reason or "Sin detalle").strip()
            waiting = patch.get("blockerWaitingOn") or task.blocker_waiting_on
            task.blocker_reason = reason
            task.blocker_waiting_on = waiting
            task.blocked_since = utcnow()
            info["paused"] = True
            extra = f" · espera a {who(waiting)}" if waiting in names else (f" · espera a {waiting}" if waiting else "")
            log_event(s, task.id, actor, source, "pausa", f"En pausa: {reason}{extra}")
        elif old_status == PAUSED:
            info["unpaused"] = True
            task.blocker_reason = None
            task.blocker_waiting_on = None
            task.blocked_since = None
            log_event(s, task.id, actor, source, "pausa", "Retomó la tarea")
        if new_status == DONE:
            task.completed_at = utcnow()
            info["done"] = True
        elif old_status == DONE:
            task.completed_at = None
        if new_status == "pruebas":
            info["testing"] = True
        log_event(s, task.id, actor, source, "estado", f"Estado: {STATUS_LABEL.get(old_status, old_status)} → {STATUS_LABEL[new_status]}")
    elif task.status == PAUSED and ("blockerReason" in patch or "blockerWaitingOn" in patch):
        task.blocker_reason = str(patch.get("blockerReason") or task.blocker_reason or "").strip() or None
        task.blocker_waiting_on = patch.get("blockerWaitingOn", task.blocker_waiting_on)
        info["changed"] = True
        log_event(s, task.id, actor, source, "pausa", f"Motivo de la pausa: {task.blocker_reason or 'sin detalle'}")

    if "archived" in patch and bool(patch["archived"]) != task.archived:
        task.archived = bool(patch["archived"])
        info["changed"] = True
        log_event(s, task.id, actor, source, "archivo", "Archivó la tarea" if task.archived else "Restauró la tarea")

    if info["changed"]:
        task.progress = task_progress(task)
        task.updated_at = utcnow()
        s.add(task)
    return info


def add_comment(s: Session, task: Task, text: str, actor: str, source: str = "web") -> None:
    clean = str(text or "").strip()
    if not clean:
        raise ValueError("El comentario está vacío.")
    log_event(s, task.id, actor, source, "comentario", clean[:2000])
    task.updated_at = utcnow()
    s.add(task)


def task_events(s: Session, task_id: int) -> list[TaskEvent]:
    return list(s.exec(select(TaskEvent).where(TaskEvent.task_id == task_id).order_by(TaskEvent.at.desc(), TaskEvent.id.desc())))


def task_sort_key(t: Task) -> tuple:
    return (
        0 if t.status == PAUSED else 1,
        t.due_date or date.max,
        PRIORITY_RANK.get(t.priority, 9),
        t.id or 0,
    )


# ---------------------------------------------------------------- rúbrica (por fase)
def verdict(criteria: list[RubricCriterion], threshold: int = 80) -> dict:
    blocking = [c for c in criteria if c.blocking]
    others = [c for c in criteria if not c.blocking]
    blocking_ok = sum(1 for c in blocking if c.state == "cumple")
    others_ok = sum(1 for c in others if c.state == "cumple")
    others_pct = round(others_ok * 100 / len(others)) if others else 100
    if blocking_ok == len(blocking):
        decision = "lanzar" if others_pct >= threshold else "lanzar_con_riesgo"
    else:
        decision = "no_lanzar"
    total = len(criteria)
    return {
        "decision": decision,
        "blockingOk": blocking_ok,
        "blockingTotal": len(blocking),
        "othersOk": others_ok,
        "othersTotal": len(others),
        "othersPct": others_pct,
        "threshold": threshold,
        "partial": sum(1 for c in criteria if c.state == "parcial"),
        "failing": sum(1 for c in criteria if c.state == "no_cumple"),
        "readinessPct": round((blocking_ok + others_ok) * 100 / total) if total else 0,
        "total": total,
    }


def rubric_overview(s: Session, phase: Phase) -> dict:
    categories = categories_for(s, phase.id)
    criteria = criteria_all(s, phase.id)
    by_cat: dict[int, list[RubricCriterion]] = {}
    for c in criteria:
        by_cat.setdefault(c.category_id, []).append(c)
    reviews = list(s.exec(select(RubricReview).where(RubricReview.phase_id == phase.id).order_by(RubricReview.at.desc())))
    return {
        "phaseId": phase.id,
        "categories": [
            {
                "id": cat.id,
                "name": cat.name,
                "order": cat.order,
                "criteria": [criterion_out(c) for c in sorted(by_cat.get(cat.id, []), key=lambda c: (c.order, c.id))],
            }
            for cat in categories
        ],
        "verdict": verdict(criteria, phase.threshold),
        "reviews": [review_out(r) for r in reviews],
    }


def next_code(s: Session, phase_id: int) -> str:
    """Código interno de un criterio nuevo (no se muestra en pantalla)."""
    numbers = [int(c.code[1:]) for c in criteria_all(s, phase_id) if re.fullmatch(r"C\d+", c.code)]
    return f"C{max(numbers, default=0) + 1}"


def update_criterion(s: Session, criterion: RubricCriterion, patch: dict) -> None:
    if "state" in patch:
        if patch["state"] not in CRITERION_STATES:
            raise ValueError("Estado de criterio desconocido.")
        criterion.state = patch["state"]
    if "ownerId" in patch:
        _check_member(s, patch["ownerId"], "Responsable")
        criterion.owner_id = patch["ownerId"] or None
    for key in ("title", "verify", "notes"):
        if key in patch:
            value = str(patch[key] or "").strip()
            if key == "title" and not value:
                raise ValueError("El criterio necesita un texto.")
            setattr(criterion, key, value)
    if "blocking" in patch:
        criterion.blocking = bool(patch["blocking"])
    criterion.updated_at = utcnow()
    s.add(criterion)


def create_review(s: Session, reviewer_id: str, notes: str, phase: Phase) -> RubricReview:
    _check_member(s, reviewer_id, "Revisor")
    criteria = criteria_all(s, phase.id)
    v = verdict(criteria, phase.threshold)
    review = RubricReview(
        project_id=phase.project_id,
        phase_id=phase.id,
        at=utcnow(),
        reviewer_id=reviewer_id,
        decision=v["decision"],
        blocking_ok=v["blockingOk"],
        blocking_total=v["blockingTotal"],
        others_ok=v["othersOk"],
        others_total=v["othersTotal"],
        notes=str(notes or "").strip(),
        snapshot_json=json.dumps([{"code": c.code, "state": c.state} for c in criteria]),
    )
    s.add(review)
    return review


BASIC_RUBRIC = [
    ("Funciona de punta a punta", [
        ("El flujo principal funciona de inicio a fin sin ayuda del equipo", "Una persona nueva lo completa sola", True),
        ("Los errores comunes muestran un mensaje claro", "Probar con datos incompletos", False),
    ]),
    ("Listo para las personas usuarias", [
        ("Las personas del piloto confirmaron fecha y acceso", "Lista con nombre y fecha", True),
        ("Hay una forma de recoger comentarios", "Formulario o canal activo", False),
    ]),
    ("Operación", [
        ("Hay un plan B si algo falla el día del lanzamiento", "Responsable y pasos escritos", True),
        ("Los datos tienen copia de seguridad", "Última copia de esta semana", False),
    ]),
]


def add_basic_rubric(s: Session, phase: Phase) -> None:
    """Rúbrica mínima para una fase (se puede editar después)."""
    if categories_for(s, phase.id):
        raise ValueError("Esta fase ya tiene rúbrica.")
    n = 0
    for order, (name, criteria) in enumerate(BASIC_RUBRIC):
        category = RubricCategory(project_id=phase.project_id, phase_id=phase.id, order=order, name=name)
        s.add(category)
        s.flush()
        for c_order, (title, verify, blocking) in enumerate(criteria):
            n += 1
            s.add(RubricCriterion(category_id=category.id, code=f"C{n}", title=title, verify=verify, blocking=blocking, order=c_order))
    phase.use_rubric = True
    s.add(phase)


# ---------------------------------------------------------------- indicadores del proyecto
def current_stage(stages: list[Stage], today: date) -> Stage | None:
    for st in stages:
        if st.start <= today <= st.end:
            return st
    upcoming = [st for st in stages if st.start > today]
    return upcoming[0] if upcoming else (stages[-1] if stages else None)


def project_metrics(s: Session, project_id: str = config.DEFAULT_PROJECT) -> dict:
    project = s.get(Project, project_id)
    tasks = tasks_all(s, project_id)
    today = local_today()
    phase = current_phase(s, project) if project else None
    stages = stages_all(s, project_id, phase.id if phase else None)
    criteria = criteria_all(s, phase.id) if phase and phase.use_rubric else []
    open_tasks = [t for t in tasks if t.status != DONE]
    overdue = [t for t in open_tasks if t.due_date and t.due_date < today]
    paused = [t for t in open_tasks if t.status == PAUSED]
    days_to_pilot = (project.pilot_date - today).days if project and project.pilot_date else None
    health, reasons = "verde", []
    if any(t.priority == "P0" for t in overdue):
        health = "rojo"
        reasons.append("Hay una tarea crítica atrasada.")
    if days_to_pilot is not None and days_to_pilot <= 7 and any(c.blocking and c.state == "no_cumple" for c in criteria):
        health = "rojo"
        reasons.append("Un criterio indispensable no se cumple a menos de 7 días de la fecha clave.")
    if health != "rojo":
        if overdue:
            health = "amarillo"
            reasons.append(f"{len(overdue)} tareas atrasadas.")
        if paused:
            health = "amarillo"
            reasons.append(f"{len(paused)} tareas en pausa.")
    stage = current_stage(stages, today)
    week_ago = utcnow() - timedelta(days=7)
    return {
        "projectId": project_id,
        "today": today.isoformat(),
        "health": health,
        "healthReasons": reasons,
        "daysToPilot": days_to_pilot,
        "tasksTotal": len(tasks),
        "tasksDone": sum(1 for t in tasks if t.status == DONE),
        "doneThisWeek": sum(1 for t in tasks if t.completed_at and aware(t.completed_at) >= week_ago),
        "inProgress": sum(1 for t in tasks if t.status == "en_progreso"),
        "testing": sum(1 for t in tasks if t.status == "pruebas"),
        "overdue": len(overdue),
        "paused": len(paused),
        "verdict": verdict(criteria, phase.threshold) if criteria else None,
        "currentPhaseId": phase.id if phase else None,
        "currentPhaseName": phase.name if phase else None,
        "currentStageId": stage.id if stage else None,
        "currentStageName": stage.name if stage else None,
    }


# ---------------------------------------------------------------- presencia en la oficina
def within_hours(m: Member, moment: datetime) -> bool:
    """¿Está dentro de su horario? (días y horas del perfil)."""
    if moment.weekday() not in work_days(m):
        return False
    start, end = parse_hhmm(m.work_start, "08:00"), parse_hhmm(m.work_end, "19:00")
    current = moment.time()
    return start <= current < end if start <= end else (current >= start or current < end)


def presence_of(m: Member, lnow: datetime | None = None) -> tuple[str, bool]:
    """Estado que muestra la oficina y si es automático.

    Dentro del horario manda lo que la persona dijo hoy (en la web o por Telegram); si no ha dicho nada, «Disponible».
    Fuera del horario está «Descansando», salvo que haya elegido otro estado hace menos de 3 horas.
    """
    lnow = lnow or local_now()
    now = lnow.astimezone(timezone.utc)
    set_at = aware(m.presence_at)
    state = m.presence_state if m.presence_state in PRESENCE_STATES else ""
    if not within_hours(m, lnow):
        if state and set_at and now - set_at < timedelta(hours=3):
            return state, False
        return "descansando", True
    if state and set_at and set_at.astimezone(TZ).date() == lnow.date():
        return state, False
    return "disponible", True


def presence(s: Session, project_id: str | None = None) -> list[dict]:
    lnow = local_now()
    out = []
    for m in members_all(s):
        state, auto = presence_of(m, lnow)
        task = s.get(Task, m.presence_task_id) if m.presence_task_id and state == "trabajando" and not auto else None
        if task is not None and (task.archived or task.status == DONE):
            task = None
        note = m.presence_note if state == "trabajando" and not auto else ""
        activity = TYPE_BY_ID.get(task.type, {}).get("activity", "") if task else ""
        out.append({
            "memberId": m.id,
            "state": state,
            "label": PRESENCE_LABEL[state],
            "auto": auto,
            "inSchedule": within_hours(m, lnow),
            "note": note,
            "task": task_brief(task),
            "activity": activity,
            "since": iso_dt(m.presence_at) if not auto else None,
        })
    return out


def set_presence(s: Session, member: Member, state: str, note: str = "", task_id: int | None = None) -> None:
    if state not in PRESENCE_STATES:
        raise ValueError("Estado desconocido: usa Trabajando, En reunión, Disponible o Descansando.")
    if task_id is not None and s.get(Task, int(task_id)) is None:
        raise ValueError("Esa tarea no existe.")
    member.presence_state = state
    member.presence_note = str(note or "").strip()[:160] if state == "trabajando" else ""
    member.presence_task_id = int(task_id) if task_id is not None and state == "trabajando" else None
    member.presence_at = utcnow()
    s.add(member)


# ---------------------------------------------------------------- ajustes
def telegram_settings(s: Session) -> dict:
    row = s.get(Setting, "telegram")
    data = dict(DEFAULT_TELEGRAM)
    if row:
        data.update(json.loads(row.value_json or "{}"))
    return data


def save_telegram_settings(s: Session, patch: dict) -> dict:
    data = telegram_settings(s)
    for key in DEFAULT_TELEGRAM:
        if key in patch:
            data[key] = patch[key]
    data["weeklyDay"] = int(data["weeklyDay"]) % 7
    data["weeklyTime"] = parse_hhmm(data["weeklyTime"], "18:00").strftime("%H:%M")
    data["dueTime"] = parse_hhmm(data["dueTime"], "09:00").strftime("%H:%M")
    data["groupTime"] = parse_hhmm(data["groupTime"], "08:30").strftime("%H:%M")
    data["maxDaily"] = max(1, min(10, int(data["maxDaily"] or 3)))
    if data["ceoId"] and s.get(Member, data["ceoId"]) is None:
        raise ValueError("La persona responsable general no existe.")
    row = s.get(Setting, "telegram") or Setting(key="telegram")
    row.value_json = json.dumps(data)
    s.add(row)
    return data


def add_checkin(s: Session, *, member_id: str | None = None, task_id: int | None = None, kind: str = "manual",
                chat: str = "privado", text: str = "", answer: str | None = None) -> CheckIn:
    entry = CheckIn(at=utcnow(), member_id=member_id, task_id=task_id, kind=kind, chat=chat, text=text[:500], answer=answer,
                    answered_at=utcnow() if answer else None)
    s.add(entry)
    return entry


def recent_checkins(s: Session, limit: int = 80) -> list[CheckIn]:
    return list(s.exec(select(CheckIn).order_by(CheckIn.at.desc(), CheckIn.id.desc()).limit(limit)))


def export_all(s: Session) -> dict:
    projects = projects_all(s, include_archived=True)
    tasks = tasks_all(s, include_archived=True)
    phases = [ph for p in projects for ph in phases_all(s, p.id)]
    return {
        "exportedAt": iso_dt(utcnow()),
        "projects": [project_out(p, tasks) for p in projects],
        "members": [member_out(m) for m in members_all(s)],
        "phases": [{"id": ph.id, "projectId": ph.project_id, "name": ph.name, "key": ph.key, "status": ph.status, "goal": ph.goal,
                    "start": iso_d(ph.start), "end": iso_d(ph.end), "useRubric": ph.use_rubric,
                    "checks": [{"text": c.text, "done": c.done} for c in s.exec(select(PhaseCheck).where(PhaseCheck.phase_id == ph.id))],
                    "rubric": rubric_overview(s, ph) if ph.use_rubric else None} for ph in phases],
        "stages": [stage_out(st) for p in projects for st in stages_all(s, p.id)],
        "tasks": [task_out(t) for t in tasks],
        "events": [event_out(e) for e in s.exec(select(TaskEvent).order_by(TaskEvent.at))],
        "telegram": telegram_settings(s),
        "checkins": [checkin_out(c) for c in recent_checkins(s, 500)],
    }


# ---------------------------------------------------------------- proyectos
PROJECT_COLORS = ["#8B45CC", "#E04B66", "#FF6A33", "#22A06B", "#2F80ED", "#E8A317", "#7C5CFF", "#0FA3A3"]


def slugify(text: str) -> str:
    folded = unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", folded).strip("-")


def phase_key(name: str) -> str:
    """Nombre de fase como se escribe en Obsidian: «Piloto de validación» → piloto_de_validacion."""
    return slugify(name).replace("-", "_") or "fase"


def derive_prefix(code: str, name: str, taken: set[str]) -> str:
    """Prefijo de las claves de tarea (SST-12): del código PRJ-… (PRJ-LANDING → LND) o de las 3 primeras letras del nombre."""
    raw = re.sub(r"[^A-Z0-9]", "", re.sub(r"^PRJ-", "", (code or "").upper()))
    if len(raw) > 4:
        raw = (raw[0] + "".join(c for c in raw[1:] if c not in "AEIOU"))[:3]
    if not raw:
        raw = re.sub(r"[^A-Z0-9]", "", slugify(name).upper())[:3]
    raw = raw or "PRY"
    candidate, n = raw, 2
    while candidate in taken:
        candidate, n = f"{raw}{n}", n + 1
    return candidate


def create_project(s: Session, data: dict) -> Project:
    name = str(data.get("name") or "").strip()
    if not name:
        raise ValueError("El proyecto necesita un nombre.")
    existing = projects_all(s, include_archived=True)
    if any(p.name.lower() == name.lower() for p in existing):
        raise ValueError(f"Ya existe un proyecto llamado «{name}».")
    taken = {p.key_prefix for p in existing}
    prefix = re.sub(r"[^A-Z0-9]", "", str(data.get("keyPrefix") or "").upper())[:5]
    if prefix and prefix in taken:
        raise ValueError(f"El prefijo {prefix} ya lo usa otro proyecto.")
    prefix = prefix or derive_prefix("", name, taken)
    if len(prefix) < 2:
        raise ValueError("El prefijo necesita al menos 2 letras.")
    lead = data.get("leadId") or None
    _check_member(s, lead, "Líder")
    base_id, pid, n = slugify(name) or prefix.lower(), slugify(name) or prefix.lower(), 2
    ids = {p.id for p in existing}
    while pid in ids:
        pid, n = f"{base_id}-{n}", n + 1
    codes = {p.code for p in existing}
    code = f"PRJ-{prefix}"
    if code in codes:
        code = f"PRJ-{prefix}-{len(existing) + 1}"
    color = str(data.get("color") or "") or PROJECT_COLORS[len(existing) % len(PROJECT_COLORS)]
    theme = data.get("theme") if data.get("theme") in ("liiot", "bleepy") else "liiot"
    project = Project(
        id=pid,
        code=code,
        name=name,
        summary=str(data.get("summary") or "").strip(),
        lead_id=lead,
        pilot_date=parse_date(data.get("pilotDate")),
        phase="",
        key_prefix=prefix,
        theme=theme,
        color=color[:9],
        order=max((p.order for p in existing), default=0) + 1,
    )
    s.add(project)
    s.flush()
    first = str(data.get("firstPhase") or "").strip()
    if first:
        phase = Phase(project_id=pid, order=0, key=phase_key(first), name=first, status="en_curso", start=local_today(),
                      end=project.pilot_date)
        s.add(phase)
        s.flush()
        project.current_phase_id = phase.id
        s.add(project)
    return project


def update_project(s: Session, project: Project, data: dict) -> None:
    for key, attr in (("summary", "summary"), ("name", "name")):
        if key in data:
            value = str(data[key] or "").strip()
            if attr == "name" and not value:
                raise ValueError("El nombre no puede quedar vacío.")
            setattr(project, attr, value)
    if "pilotDate" in data:
        project.pilot_date = parse_date(data["pilotDate"])
    if "backupDate" in data:
        project.backup_date = parse_date(data["backupDate"])
    if "leadId" in data:
        _check_member(s, data["leadId"], "Líder")
        project.lead_id = data["leadId"] or None
    if "color" in data and data["color"]:
        project.color = str(data["color"])[:9]
    if "theme" in data and data["theme"] in ("liiot", "bleepy"):
        project.theme = data["theme"]
    if "archived" in data:
        project.archived = bool(data["archived"])
    s.add(project)
