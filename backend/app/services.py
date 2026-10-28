"""Lógica de negocio: tareas, rúbrica, métricas, presencia de los avatares y ajustes."""
from __future__ import annotations

import json
import re
import unicodedata
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlmodel import Session, select

from . import config
from .catalog import (
    CRITERION_STATES,
    DEFAULT_TELEGRAM,
    EFFORT_POINTS,
    PRESENCE_OVERRIDES,
    PRIORITIES,
    STATUS_LABEL,
    STATUSES,
    TYPE_BY_ID,
)
from .models import (
    CheckIn,
    Member,
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
DAYS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]
PRIORITY_RANK = {p: i for i, p in enumerate(PRIORITIES)}


# ---------------------------------------------------------------- tiempo y formato
def utcnow() -> datetime:
    """Hora actual en UTC con zona (SQLModel guarda y devuelve fechas con zona)."""
    return datetime.now(timezone.utc)


def local_now() -> datetime:
    return datetime.now(TZ)


def local_today() -> date:
    return local_now().date()


def iso_dt(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


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


# ---------------------------------------------------------------- consultas base
def members_all(s: Session) -> list[Member]:
    return list(s.exec(select(Member).order_by(Member.order)))


def member_names(s: Session) -> dict[str, str]:
    return {m.id: m.name for m in members_all(s)}


def stages_all(s: Session, project_id: str = config.DEFAULT_PROJECT) -> list[Stage]:
    return list(s.exec(select(Stage).where(Stage.project_id == project_id).order_by(Stage.order)))


def tasks_all(s: Session, project_id: str | None = None, include_archived: bool = False) -> list[Task]:
    """Tareas de un proyecto, o de todos si project_id es None."""
    query = select(Task)
    if project_id:
        query = query.where(Task.project_id == project_id)
    if not include_archived:
        query = query.where(Task.archived == False)  # noqa: E712
    return list(s.exec(query.order_by(Task.sort, Task.id)))


def criteria_all(s: Session, project_id: str = config.DEFAULT_PROJECT) -> list[RubricCriterion]:
    cat_ids = [c.id for c in s.exec(select(RubricCategory).where(RubricCategory.project_id == project_id))]
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


# ---------------------------------------------------------------- serialización
def override_active(m: Member) -> bool:
    return bool(m.presence_override) and (m.override_until is None or m.override_until > utcnow())


def member_out(m: Member) -> dict:
    return {
        "id": m.id,
        "name": m.name,
        "fullName": m.full_name,
        "role": m.role,
        "area": m.area,
        "color": m.color,
        "capacity": m.capacity,
        "avatar": json.loads(m.avatar_json or "{}"),
        "telegramLinked": m.telegram_chat_id is not None,
        "telegramUsername": m.telegram_username,
        "linkCode": m.link_code,
        "workStart": m.work_start,
        "workEnd": m.work_end,
        "presenceOverride": m.presence_override if override_active(m) else None,
        "overrideUntil": iso_dt(m.override_until) if override_active(m) else None,
        "quietUntil": iso_dt(m.quiet_until),
        "order": m.order,
    }


def project_out(p: Project, tasks: list[Task] | None = None) -> dict:
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
        "theme": p.theme,
        "color": p.color,
        "archived": p.archived,
        "vaultDir": p.vault_dir,
        "order": p.order,
    }
    if tasks is not None:
        mine = [t for t in tasks if t.project_id == p.id]
        out["counts"] = {
            "total": len(mine),
            "open": sum(1 for t in mine if t.status != "hecha"),
            "done": sum(1 for t in mine if t.status == "hecha"),
            "blocked": sum(1 for t in mine if t.status == "bloqueada"),
        }
    return out


def stage_out(st: Stage) -> dict:
    return {
        "id": st.id,
        "projectId": st.project_id,
        "order": st.order,
        "name": st.name,
        "start": iso_d(st.start),
        "end": iso_d(st.end),
        "exitCriteria": st.exit_criteria,
    }


def task_out(t: Task, vault_path: str | None = None) -> dict:
    return {
        "id": t.id,
        "key": t.key,
        "projectId": t.project_id,
        "phase": t.phase,
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
        "stageId": t.stage_id,
        "rubric": csv_list(t.rubric),
        "effort": t.effort,
        "origin": t.origin,
        "legacyId": t.legacy_id,
        "blockerReason": t.blocker_reason,
        "blockerWaitingOn": t.blocker_waiting_on,
        "blockedSince": iso_dt(t.blocked_since),
        "progress": t.progress,
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
    }


def event_out(e: TaskEvent) -> dict:
    return {"id": e.id, "taskId": e.task_id, "at": iso_dt(e.at), "actor": e.actor, "source": e.source, "kind": e.kind, "text": e.text}


def criterion_out(c: RubricCriterion, links: dict[str, list[str]]) -> dict:
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
        "taskKeys": links.get(c.code, []),
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


def stage_for_date(s: Session, project_id: str, day: date | None) -> int | None:
    if day is None:
        return None
    for st in stages_all(s, project_id):
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


def create_task(s: Session, data: dict, actor: str, source: str = "web") -> Task:
    title = str(data.get("title") or "").strip()
    if not title:
        raise ValueError("La tarea necesita un título.")
    project = s.get(Project, data.get("projectId") or default_project_id(s))
    if project is None:
        raise ValueError("El proyecto no existe.")
    owner = data.get("ownerId") or actor
    _check_member(s, owner, "Responsable")
    task_type = data.get("type") or "gestion"
    if task_type not in TYPE_BY_ID:
        raise ValueError(f"Tipo de tarea desconocido: {task_type}.")
    priority = data.get("priority") or "P2"
    if priority not in PRIORITIES:
        raise ValueError("La prioridad debe ser P0, P1, P2 o P3.")
    due = parse_date(data.get("dueDate"))
    stage_id = data.get("stageId")
    now = utcnow()
    task = Task(
        key=next_key(s, project),
        project_id=project.id,
        title=title,
        summary=str(data.get("summary") or "").strip(),
        type=task_type,
        priority=priority,
        status=data.get("status") if data.get("status") in STATUSES else "por_hacer",
        owner_id=owner,
        collaborators=to_csv(data.get("collaborators") or []),
        start_date=parse_date(data.get("startDate")) or local_today(),
        due_date=due,
        due_original=due,
        stage_id=int(stage_id) if stage_id not in (None, "") else stage_for_date(s, project.id, due),
        rubric=to_csv(data.get("rubric") or []),
        effort=data.get("effort") if data.get("effort") in EFFORT_POINTS else "M",
        origin=data.get("origin") or ("Telegram" if source == "telegram" else "HQ"),
        legacy_id=data.get("legacyId") or None,
        phase=str(data.get("phase") or "").strip(),
        created_at=now,
        updated_at=now,
    )
    if task.status == "hecha":
        task.completed_at = now
        task.progress = 100
    if task.status == "bloqueada":
        task.blocker_reason = str(data.get("blockerReason") or "Sin detalle").strip()
        task.blocker_waiting_on = data.get("blockerWaitingOn") or None
        task.blocked_since = now
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
    "stageId": "stage_id",
    "effort": "effort",
    "progress": "progress",
    "sort": "sort",
    "origin": "origin",
    "phase": "phase",
}


def apply_patch(s: Session, task: Task, patch: dict, actor: str, source: str = "web") -> dict:
    """Aplica cambios a una tarea, registra la bitácora y devuelve qué pasó."""
    names = member_names(s)
    info = {"done": False, "blocked": False, "unblocked": False, "rescheduled": False, "reassigned": False, "changed": False}

    def who(member_id: str | None) -> str:
        return names.get(member_id or "", member_id or "nadie")

    for key, attr in SIMPLE_FIELDS.items():
        if key not in patch:
            continue
        value = patch[key]
        if attr in ("start_date", "due_date"):
            value = parse_date(value)
        elif attr == "stage_id":
            value = int(value) if value not in (None, "") else None
        elif attr == "progress":
            value = max(0, min(100, int(value or 0)))
        elif attr == "sort":
            value = float(value or 0)
        elif attr in ("title", "summary", "origin", "phase"):
            value = str(value or "").strip()
            if attr == "title" and not value:
                raise ValueError("El título no puede quedar vacío.")
        elif attr == "type" and value not in TYPE_BY_ID:
            raise ValueError(f"Tipo de tarea desconocido: {value}.")
        elif attr == "priority" and value not in PRIORITIES:
            raise ValueError("La prioridad debe ser P0, P1, P2 o P3.")
        elif attr == "effort" and value not in EFFORT_POINTS:
            raise ValueError("El esfuerzo debe ser S, M o L.")
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
            log_event(s, task.id, actor, source, "prioridad", f"Prioridad: {old} → {value}")
        elif attr == "type":
            log_event(s, task.id, actor, source, "tipo", f"Tipo: {TYPE_BY_ID[old]['label'] if old in TYPE_BY_ID else old} → {TYPE_BY_ID[value]['label']}")
        elif attr == "progress":
            log_event(s, task.id, actor, source, "avance", f"Avance: {value} %")
        elif attr == "title":
            log_event(s, task.id, actor, source, "edicion", "Cambió el título")
        elif attr == "summary":
            log_event(s, task.id, actor, source, "edicion", "Editó el resumen")
        elif attr == "stage_id":
            log_event(s, task.id, actor, source, "etapa", "Cambió la etapa")
        elif attr == "start_date":
            log_event(s, task.id, actor, source, "fecha", f"Inicio: {fmt_date(value)}")
        elif attr == "phase":
            log_event(s, task.id, actor, source, "etapa", f"Fase: {value or 'sin fase'}")
        setattr(task, attr, value)

    if "collaborators" in patch:
        value = to_csv(patch["collaborators"])
        if value != task.collaborators:
            task.collaborators = value
            info["changed"] = True
            log_event(s, task.id, actor, source, "asignacion", "Actualizó colaboradores: " + (", ".join(who(m) for m in csv_list(value)) or "ninguno"))
    if "rubric" in patch:
        value = to_csv(code.upper() for code in patch["rubric"])
        if value != task.rubric:
            task.rubric = value
            info["changed"] = True
            log_event(s, task.id, actor, source, "rubrica", "Criterios vinculados: " + (value.replace(",", ", ") or "ninguno"))

    new_status = patch.get("status")
    if new_status is not None and new_status != task.status:
        if new_status not in STATUSES:
            raise ValueError("Estado desconocido.")
        old_status = task.status
        task.status = new_status
        info["changed"] = True
        if new_status == "bloqueada":
            reason = str(patch.get("blockerReason") or task.blocker_reason or "Sin detalle").strip()
            waiting = patch.get("blockerWaitingOn") or task.blocker_waiting_on
            task.blocker_reason = reason
            task.blocker_waiting_on = waiting
            task.blocked_since = utcnow()
            info["blocked"] = True
            extra = f" · espera a {who(waiting)}" if waiting in names else (f" · espera a {waiting}" if waiting else "")
            log_event(s, task.id, actor, source, "bloqueo", f"Bloqueo: {reason}{extra}")
        elif old_status == "bloqueada":
            info["unblocked"] = True
            task.blocker_reason = None
            task.blocker_waiting_on = None
            task.blocked_since = None
            log_event(s, task.id, actor, source, "desbloqueo", "Bloqueo resuelto")
        if new_status == "hecha":
            task.completed_at = utcnow()
            task.progress = 100
            info["done"] = True
        elif old_status == "hecha":
            task.completed_at = None
        log_event(s, task.id, actor, source, "estado", f"Estado: {STATUS_LABEL[old_status]} → {STATUS_LABEL[new_status]}")
    elif task.status == "bloqueada" and ("blockerReason" in patch or "blockerWaitingOn" in patch):
        task.blocker_reason = str(patch.get("blockerReason") or task.blocker_reason or "").strip() or None
        task.blocker_waiting_on = patch.get("blockerWaitingOn", task.blocker_waiting_on)
        info["changed"] = True
        log_event(s, task.id, actor, source, "bloqueo", f"Detalle del bloqueo: {task.blocker_reason or 'sin detalle'}")

    if "archived" in patch and bool(patch["archived"]) != task.archived:
        task.archived = bool(patch["archived"])
        info["changed"] = True
        log_event(s, task.id, actor, source, "archivo", "Archivó la tarea" if task.archived else "Restauró la tarea")

    if info["changed"]:
        task.updated_at = utcnow()
        s.add(task)
    return info


def add_comment(s: Session, task: Task, text: str, actor: str, source: str = "web") -> None:
    clean = str(text or "").strip()
    if not clean:
        raise ValueError("El comentario está vacío.")
    log_event(s, task.id, actor, source, "comentario", clean)
    task.updated_at = utcnow()
    s.add(task)


def task_events(s: Session, task_id: int) -> list[TaskEvent]:
    return list(s.exec(select(TaskEvent).where(TaskEvent.task_id == task_id).order_by(TaskEvent.at.desc(), TaskEvent.id.desc())))


def task_sort_key(t: Task) -> tuple:
    return (
        0 if t.status == "bloqueada" else 1,
        t.due_date or date.max,
        PRIORITY_RANK.get(t.priority, 9),
        t.id or 0,
    )


# ---------------------------------------------------------------- rúbrica
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
    }


def rubric_overview(s: Session, project_id: str = config.DEFAULT_PROJECT) -> dict:
    categories = list(s.exec(select(RubricCategory).where(RubricCategory.project_id == project_id).order_by(RubricCategory.order)))
    criteria = criteria_all(s, project_id)
    links: dict[str, list[str]] = {}
    for t in tasks_all(s, project_id):
        for code in csv_list(t.rubric):
            links.setdefault(code, []).append(t.key)
    by_cat: dict[int, list[RubricCriterion]] = {}
    for c in criteria:
        by_cat.setdefault(c.category_id, []).append(c)
    reviews = list(s.exec(select(RubricReview).where(RubricReview.project_id == project_id).order_by(RubricReview.at.desc())))
    return {
        "categories": [
            {
                "id": cat.id,
                "name": cat.name,
                "order": cat.order,
                "criteria": [criterion_out(c, links) for c in sorted(by_cat.get(cat.id, []), key=lambda c: (c.order, c.id))],
            }
            for cat in categories
        ],
        "verdict": verdict(criteria),
        "reviews": [review_out(r) for r in reviews],
    }


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
            setattr(criterion, key, str(patch[key] or "").strip())
    if "blocking" in patch:
        criterion.blocking = bool(patch["blocking"])
    criterion.updated_at = utcnow()
    s.add(criterion)


def create_review(s: Session, reviewer_id: str, notes: str, project_id: str = config.DEFAULT_PROJECT) -> RubricReview:
    _check_member(s, reviewer_id, "Revisor")
    criteria = criteria_all(s, project_id)
    v = verdict(criteria)
    review = RubricReview(
        project_id=project_id,
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


# ---------------------------------------------------------------- métricas
def zone_for(pct: int) -> str:
    if pct > 100:
        return "rosa"
    if pct >= 70:
        return "amarillo"
    return "verde"


ACTIVE_STATUSES = ("en_progreso", "en_revision", "bloqueada")


def workload(member: Member, tasks: list[Task], today: date) -> dict:
    mine = [t for t in tasks if t.owner_id == member.id]
    open_tasks = [t for t in mine if t.status != "hecha"]
    horizon = today + timedelta(days=14)
    # Cuenta lo que vence en 14 días (y lo vencido) más lo que ya está en marcha aunque no tenga fecha.
    # Lo que espera sin fecha (backlog, p. ej. lo importado de Obsidian) no infla la carga: se informa aparte.
    window = [t for t in open_tasks if (t.due_date and t.due_date <= horizon) or (t.due_date is None and t.status in ACTIVE_STATUSES)]
    undated = sum(1 for t in open_tasks if t.due_date is None and t.status not in ACTIVE_STATUSES)
    points = sum(EFFORT_POINTS.get(t.effort, 2) for t in window)
    pct = round(points * 100 / member.capacity) if member.capacity else 0
    week_ago = utcnow() - timedelta(days=7)
    in_progress = sorted([t for t in open_tasks if t.status == "en_progreso"], key=lambda t: t.updated_at, reverse=True)
    upcoming = sorted([t for t in open_tasks if t.status in ("por_hacer", "en_progreso")], key=task_sort_key)
    mix: dict[str, int] = {}
    for t in window:
        mix[t.type] = mix.get(t.type, 0) + EFFORT_POINTS.get(t.effort, 2)
    due_by_day = {}
    for offset in range(14):
        day = today + timedelta(days=offset)
        due_by_day[day.isoformat()] = sum(1 for t in open_tasks if t.due_date == day)
    return {
        "memberId": member.id,
        "points": points,
        "capacity": member.capacity,
        "pct": pct,
        "zone": zone_for(pct),
        "open": len(open_tasks),
        "undated": undated,
        "inProgress": len(in_progress),
        "inReview": sum(1 for t in open_tasks if t.status == "en_revision"),
        "blocked": sum(1 for t in open_tasks if t.status == "bloqueada"),
        "overdue": sum(1 for t in open_tasks if t.due_date and t.due_date < today),
        "done7d": sum(1 for t in mine if t.status == "hecha" and t.completed_at and t.completed_at >= week_ago),
        "doneTotal": sum(1 for t in mine if t.status == "hecha"),
        "current": task_brief(in_progress[0] if in_progress else None),
        "next": [task_brief(t) for t in upcoming if not in_progress or t.id != in_progress[0].id][:3],
        "mix": mix,
        "dueByDay": due_by_day,
    }


def current_stage(stages: list[Stage], today: date) -> Stage | None:
    for st in stages:
        if st.start <= today <= st.end:
            return st
    upcoming = [st for st in stages if st.start > today]
    return upcoming[0] if upcoming else (stages[-1] if stages else None)


def project_metrics(s: Session, project_id: str = config.DEFAULT_PROJECT) -> dict:
    project = s.get(Project, project_id)
    tasks = tasks_all(s, project_id)
    criteria = criteria_all(s, project_id)
    stages = stages_all(s, project_id)
    today = local_today()
    v = verdict(criteria)
    open_tasks = [t for t in tasks if t.status != "hecha"]
    overdue = [t for t in open_tasks if t.due_date and t.due_date < today]
    blocked = [t for t in open_tasks if t.status == "bloqueada"]
    days_to_pilot = (project.pilot_date - today).days if project and project.pilot_date else None
    health, reasons = "verde", []
    if any(t.blocked_since and utcnow() - t.blocked_since > timedelta(hours=24) for t in blocked):
        health = "rojo"
        reasons.append("Hay un bloqueo de más de 24 horas.")
    if any(t.priority == "P0" for t in overdue):
        health = "rojo"
        reasons.append("Hay una tarea P0 vencida.")
    if days_to_pilot is not None and days_to_pilot <= 7 and any(c.blocking and c.state == "no_cumple" for c in criteria):
        health = "rojo"
        reasons.append("Un criterio bloqueante no cumple a menos de 7 días del piloto.")
    if health != "rojo":
        if overdue:
            health = "amarillo"
            reasons.append(f"{len(overdue)} tareas vencidas.")
        if blocked:
            health = "amarillo"
            reasons.append(f"{len(blocked)} tareas bloqueadas.")
        if any(t.reschedules >= 2 for t in tasks):
            health = "amarillo"
            reasons.append("Hay fechas que se movieron dos o más veces.")
    stage = current_stage(stages, today)
    week_ago = utcnow() - timedelta(days=7)
    return {
        "projectId": project_id,
        "today": today.isoformat(),
        "health": health,
        "healthReasons": reasons,
        "daysToPilot": days_to_pilot,
        "tasksTotal": len(tasks),
        "tasksDone": sum(1 for t in tasks if t.status == "hecha"),
        "doneThisWeek": sum(1 for t in tasks if t.completed_at and t.completed_at >= week_ago),
        "inProgress": sum(1 for t in tasks if t.status == "en_progreso"),
        "inReview": sum(1 for t in tasks if t.status == "en_revision"),
        "overdue": len(overdue),
        "blocked": len(blocked),
        "rescheduled": sum(1 for t in tasks if t.reschedules >= 2),
        "verdict": v,
        "currentStageId": stage.id if stage else None,
    }


def team_metrics(s: Session, project_id: str | None = None) -> list[dict]:
    """Carga de cada persona; sin project_id cuenta las tareas de todos los proyectos."""
    tasks = tasks_all(s, project_id)
    today = local_today()
    return [workload(m, tasks, today) for m in members_all(s)]


def suggestions(team: list[dict], tasks: list[Task], names: dict[str, str]) -> list[dict]:
    """Propone mover una tarea de quien pasa del 100 % a quien está bajo el 70 %."""
    over = sorted([w for w in team if w["pct"] > 100], key=lambda w: -w["pct"])
    under = sorted([w for w in team if w["pct"] < 70], key=lambda w: w["pct"])
    out = []
    for heavy in over:
        if not under:
            break
        light = under[0]
        candidates = sorted(
            [t for t in tasks if t.owner_id == heavy["memberId"] and t.status == "por_hacer"],
            key=lambda t: (-PRIORITY_RANK.get(t.priority, 9), t.due_date or date.max),
        )
        if candidates:
            t = candidates[0]
            out.append({
                "taskId": t.id,
                "taskKey": t.key,
                "taskTitle": t.title,
                "fromId": heavy["memberId"],
                "toId": light["memberId"],
                "text": f"{names.get(heavy['memberId'])} está al {heavy['pct']} % y {names.get(light['memberId'])} al {light['pct']} %. "
                f"Mover {t.key} ({t.priority}) equilibra la carga.",
            })
    return out


# ---------------------------------------------------------------- presencia (avatares)
def within_hours(m: Member, moment: datetime) -> bool:
    start, end = parse_hhmm(m.work_start, "08:00"), parse_hhmm(m.work_end, "19:00")
    current = moment.time()
    return start <= current < end if start <= end else (current >= start or current < end)


def presence(s: Session, ignore_hours: bool = False, project_id: str | None = None) -> list[dict]:
    tasks = tasks_all(s, project_id)
    now, lnow = utcnow(), local_now()
    out = []
    for m in members_all(s):
        mine = [t for t in tasks if t.owner_id == m.id]
        state, task, detail = None, None, ""
        if override_active(m):
            state = m.presence_override
            if state == "foco":
                active = sorted([t for t in mine if t.status == "en_progreso"], key=lambda t: t.updated_at, reverse=True)
                task = active[0] if active else None
        elif not ignore_hours and not within_hours(m, lnow):
            state = "fuera"
        if state is None:
            blocked = sorted([t for t in mine if t.status == "bloqueada"], key=lambda t: t.updated_at, reverse=True)
            celebrating = [t for t in mine if t.status == "hecha" and t.completed_at and now - t.completed_at < timedelta(minutes=10)]
            working = sorted([t for t in mine if t.status == "en_progreso"], key=lambda t: t.updated_at, reverse=True)
            review = sorted([t for t in mine if t.status == "en_revision"], key=lambda t: t.updated_at, reverse=True)
            if blocked:
                state, task, detail = "bloqueado", blocked[0], blocked[0].blocker_reason or ""
            elif celebrating:
                state, task = "celebrando", max(celebrating, key=lambda t: t.completed_at)
            elif working:
                state, task = "trabajando", working[0]
            elif review:
                state, task = "revision", review[0]
            else:
                state = "disponible"
        activity = TYPE_BY_ID.get(task.type, {}).get("activity", "") if task else ""
        out.append({"memberId": m.id, "state": state, "task": task_brief(task), "detail": detail, "activity": activity})
    return out


def set_presence_override(s: Session, member: Member, state: str | None, minutes: int | None) -> None:
    if state in (None, "", "auto"):
        member.presence_override = None
        member.override_until = None
    else:
        if state not in PRESENCE_OVERRIDES:
            raise ValueError("Estado manual desconocido.")
        member.presence_override = state
        member.override_until = utcnow() + timedelta(minutes=int(minutes or 120)) if minutes != 0 else None
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


def recent_checkins(s: Session, limit: int = 60) -> list[CheckIn]:
    return list(s.exec(select(CheckIn).order_by(CheckIn.at.desc(), CheckIn.id.desc()).limit(limit)))


def export_all(s: Session) -> dict:
    projects = projects_all(s, include_archived=True)
    tasks = tasks_all(s, include_archived=True)
    return {
        "exportedAt": iso_dt(utcnow()),
        "projects": [project_out(p, tasks) for p in projects],
        "members": [member_out(m) for m in members_all(s)],
        "stages": [stage_out(st) for p in projects for st in stages_all(s, p.id)],
        "tasks": [task_out(t) for t in tasks],
        "events": [event_out(e) for e in s.exec(select(TaskEvent).order_by(TaskEvent.at))],
        "rubrics": {p.id: rubric_overview(s, p.id) for p in projects},
        "telegram": telegram_settings(s),
        "checkins": [checkin_out(c) for c in recent_checkins(s, 500)],
    }


# ---------------------------------------------------------------- proyectos
PROJECT_COLORS = ["#8B45CC", "#E04B66", "#FF6A33", "#22A06B", "#2F80ED", "#E8A317", "#7C5CFF", "#0FA3A3"]


def slugify(text: str) -> str:
    folded = unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", folded).strip("-")


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
    project = Project(
        id=pid,
        code=code,
        name=name,
        summary=str(data.get("summary") or "").strip(),
        lead_id=lead,
        pilot_date=parse_date(data.get("pilotDate")),
        phase=str(data.get("phase") or "").strip(),
        key_prefix=prefix,
        theme="liiot",
        color=color[:9],
        order=max((p.order for p in existing), default=0) + 1,
    )
    s.add(project)
    return project


def update_project(s: Session, project: Project, data: dict) -> None:
    for key, attr in (("summary", "summary"), ("phase", "phase"), ("name", "name")):
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
    if "archived" in data:
        project.archived = bool(data["archived"])
    s.add(project)


BASIC_RUBRIC = [
    ("Funciona de punta a punta", [
        ("F1", "El flujo principal funciona de inicio a fin sin ayuda del equipo", "Una persona nueva lo completa sola", True),
        ("F2", "Los errores comunes muestran un mensaje claro", "Probar con datos incompletos", False),
    ]),
    ("Listo para las personas usuarias", [
        ("U1", "Las personas del piloto confirmaron fecha y acceso", "Lista con nombre y fecha", True),
        ("U2", "Hay una forma de recoger comentarios", "Formulario o canal activo", False),
    ]),
    ("Operación", [
        ("O1", "Hay un plan B si algo falla el día del lanzamiento", "Responsable y pasos escritos", True),
        ("O2", "Los datos tienen copia de seguridad", "Última copia de esta semana", False),
    ]),
]


def add_basic_rubric(s: Session, project_id: str) -> None:
    """Rúbrica de lanzamiento mínima para un proyecto nuevo (se puede editar después)."""
    if s.exec(select(RubricCategory).where(RubricCategory.project_id == project_id)).first():
        raise ValueError("Este proyecto ya tiene rúbrica.")
    for order, (name, criteria) in enumerate(BASIC_RUBRIC):
        category = RubricCategory(project_id=project_id, order=order, name=name)
        s.add(category)
        s.flush()
        for c_order, (code, title, verify, blocking) in enumerate(criteria):
            s.add(RubricCriterion(category_id=category.id, code=code, title=title, verify=verify, blocking=blocking, order=c_order))
