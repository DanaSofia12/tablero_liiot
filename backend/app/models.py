"""Tablas de Liiot Hub."""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class Member(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    full_name: str
    role: str
    area: str = ""
    color: str = "#8B45CC"
    capacity: int = 10
    avatar_json: str = "{}"
    telegram_chat_id: Optional[int] = None
    telegram_username: Optional[str] = None
    link_code: str = ""
    work_start: str = "08:00"
    work_end: str = "19:00"
    work_days: str = "0,1,2,3,4"  # 0 = lunes … 6 = domingo
    presence_override: Optional[str] = None  # antiguo, ya no se usa
    override_until: Optional[datetime] = None  # antiguo, ya no se usa
    presence_state: str = ""  # trabajando | en_reunion | disponible | descansando
    presence_note: str = ""  # en qué está, dicho por la persona
    presence_task_id: Optional[int] = None
    presence_at: Optional[datetime] = None
    checkin_day: Optional[date] = None  # último día en que el bot preguntó «¿en qué trabajas hoy?»
    quiet_until: Optional[datetime] = None
    order: int = 0
    # Cuenta para entrar a Liiot Hub (sin contraseña = todavía no se activa)
    username: Optional[str] = Field(default=None, index=True)
    email: Optional[str] = Field(default=None, index=True)
    password_hash: Optional[str] = None
    is_admin: bool = False
    active: bool = True
    last_login_at: Optional[datetime] = None


class AuthSession(SQLModel, table=True):
    token_hash: str = Field(primary_key=True)
    member_id: str = Field(index=True)
    created_at: datetime
    expires_at: datetime
    last_seen_at: datetime
    user_agent: str = ""


class Invite(SQLModel, table=True):
    """Código de un solo uso para activar una cuenta o cambiar una contraseña olvidada."""

    code_hash: str = Field(primary_key=True)
    member_id: str = Field(index=True)
    kind: str = "activar"  # activar | restablecer
    created_by: str = ""
    created_at: datetime
    expires_at: datetime
    used_at: Optional[datetime] = None


class Project(SQLModel, table=True):
    id: str = Field(primary_key=True)
    code: str
    name: str
    summary: str = ""
    lead_id: Optional[str] = None
    pilot_date: Optional[date] = None
    backup_date: Optional[date] = None
    phase: str = ""
    key_prefix: str = "BLP"
    theme: str = "bleepy"
    color: str = "#8B45CC"
    archived: bool = False
    vault_dir: Optional[str] = None
    order: int = 0
    current_phase_id: Optional[int] = None


class Phase(SQLModel, table=True):
    """Fase del proyecto (validación de la idea, piloto, lanzamiento…). Agrupa etapas, tareas, mínimos y una rúbrica opcional."""

    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: str = Field(index=True)
    order: int = 0
    key: str = ""  # como se escribe en Obsidian (campo «fase» de las notas)
    name: str
    goal: str = ""
    status: str = "pendiente"  # pendiente | en_curso | completada
    start: Optional[date] = None
    end: Optional[date] = None
    use_rubric: bool = False
    threshold: int = 80
    validated_at: Optional[datetime] = None
    validated_by: Optional[str] = None
    validation_note: str = ""


class PhaseCheck(SQLModel, table=True):
    """Mínimo que se debe cumplir para pasar a la siguiente fase."""

    id: Optional[int] = Field(default=None, primary_key=True)
    phase_id: int = Field(index=True)
    order: int = 0
    text: str
    done: bool = False
    done_by: Optional[str] = None
    done_at: Optional[datetime] = None


class Stage(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: str = Field(index=True)
    phase_id: Optional[int] = Field(default=None, index=True)
    order: int = 0
    name: str
    start: date
    end: date
    exit_criteria: str = ""


class Task(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    key: str = Field(index=True)
    project_id: str = Field(index=True)
    title: str
    summary: str = ""
    type: str = "gestion"
    priority: str = "P2"
    status: str = "pendiente"
    owner_id: str
    collaborators: str = ""
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    due_original: Optional[date] = None
    reschedules: int = 0
    phase_id: Optional[int] = Field(default=None, index=True)
    stage_id: Optional[int] = None
    rubric: str = ""
    effort: str = "M"  # antiguo, ya no se usa
    origin: str = ""
    legacy_id: Optional[str] = None
    blocker_reason: Optional[str] = None  # motivo de la pausa
    blocker_waiting_on: Optional[str] = None
    blocked_since: Optional[datetime] = None
    progress: int = 0
    checklist_json: str = "[]"
    archived: bool = False
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None
    sort: float = 0
    phase: str = ""  # antiguo: texto libre de Obsidian, ahora es phase_id


class TaskEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    task_id: int = Field(index=True)
    at: datetime
    actor: str = "sistema"
    source: str = "web"
    kind: str = "edicion"
    text: str = ""


class RubricCategory(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: str = Field(index=True)
    phase_id: Optional[int] = Field(default=None, index=True)
    order: int = 0
    name: str


class RubricCriterion(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    category_id: int = Field(index=True)
    code: str
    title: str
    verify: str = ""
    blocking: bool = False
    state: str = "pendiente"
    owner_id: Optional[str] = None
    notes: str = ""
    order: int = 0
    updated_at: Optional[datetime] = None


class RubricReview(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: str = Field(index=True)
    phase_id: Optional[int] = Field(default=None, index=True)
    at: datetime
    reviewer_id: str
    decision: str
    blocking_ok: int
    blocking_total: int
    others_ok: int
    others_total: int
    notes: str = ""
    snapshot_json: str = "[]"


class Setting(SQLModel, table=True):
    key: str = Field(primary_key=True)
    value_json: str = "{}"


class VaultLink(SQLModel, table=True):
    """Tarea ↔ nota de Obsidian, con lo último sincronizado de cada lado (para la fusión en tres vías)."""

    task_id: int = Field(primary_key=True)
    note_id: str = Field(index=True)
    path: str
    base_json: str = "{}"
    missing: int = 0
    synced_at: Optional[datetime] = None


class VaultProjectLink(SQLModel, table=True):
    project_id: str = Field(primary_key=True)
    note_id: str = Field(index=True)
    dir: str
    base_json: str = "{}"
    synced_at: Optional[datetime] = None


class CheckIn(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    at: datetime
    member_id: Optional[str] = None
    task_id: Optional[int] = None
    kind: str = "manual"
    chat: str = "privado"
    text: str = ""
    answer: Optional[str] = None
    answered_at: Optional[datetime] = None
