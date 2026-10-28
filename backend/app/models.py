"""Tablas de Liiot HQ."""
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
    presence_override: Optional[str] = None
    override_until: Optional[datetime] = None
    quiet_until: Optional[datetime] = None
    order: int = 0


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


class Stage(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: str = Field(index=True)
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
    status: str = "por_hacer"
    owner_id: str
    collaborators: str = ""
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    due_original: Optional[date] = None
    reschedules: int = 0
    stage_id: Optional[int] = None
    rubric: str = ""
    effort: str = "M"
    origin: str = ""
    legacy_id: Optional[str] = None
    blocker_reason: Optional[str] = None
    blocker_waiting_on: Optional[str] = None
    blocked_since: Optional[datetime] = None
    progress: int = 0
    archived: bool = False
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None
    sort: float = 0
    phase: str = ""


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
