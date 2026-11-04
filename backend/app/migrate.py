"""Pone al día los datos cuando cambia la forma de guardarlos. Antes de tocar nada guarda una copia de hq.db.

Versión 2 (Liiot Hub):
- Estados nuevos: Pendiente, En progreso, En pausa, Pruebas y Finalizada.
- Fases por proyecto: las etapas y la rúbrica de Bleepy quedan dentro de su fase «Piloto de validación»;
  las fases que traían las notas de Obsidian (fase_1, pre_inicio…) se vuelven fases del proyecto.
- La oficina usa cuatro estados elegidos por cada persona (los antiguos se descartan).
"""
from __future__ import annotations

import json
import logging
import re
import sqlite3
from datetime import datetime
from pathlib import Path

from sqlmodel import select

from . import config
from . import services as svc
from .catalog import DONE, LEGACY_STATUS
from .db import session_scope
from .models import Member, Phase, Project, RubricCategory, RubricReview, Setting, Stage, Task

log = logging.getLogger("liiot.migrate")
VERSION = 2
BACKUP_DIR = config.DB_PATH.parent / "respaldos"


def _version(s) -> int:
    row = s.get(Setting, "schema")
    return int(json.loads(row.value_json).get("version", 1)) if row else 1


def backup_db(label: str) -> Path | None:
    """Copia consistente de la base (funciona aunque esté en modo WAL)."""
    if not config.DB_PATH.is_file():
        return None
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    target = BACKUP_DIR / f"hq-{datetime.now():%Y%m%d-%H%M%S}-{label}.db"
    src = sqlite3.connect(config.DB_PATH)
    dst = sqlite3.connect(target)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    return target


def upgrade(fresh: bool = False) -> None:
    """fresh = la base se acaba de crear (no hace falta copia de seguridad)."""
    with session_scope() as s:
        version = _version(s)
    if version >= VERSION:
        return
    if not fresh:
        path = backup_db(f"antes-de-v{VERSION}")
        if path:
            log.info("Copia de seguridad antes de actualizar los datos: %s", path)
    with session_scope() as s:
        if version < 2:
            _to_v2(s)
        row = s.get(Setting, "schema") or Setting(key="schema")
        row.value_json = json.dumps({"version": VERSION})
        s.add(row)
        s.commit()


def _phase_sort(value: str) -> tuple:
    m = re.fullmatch(r"(?:fase|f)[ _-]?(\d+)", value.lower())
    if value.lower().startswith("pre"):
        return (0, 0, value)
    if m:
        return (1, int(m.group(1)), value)
    return (2, 0, value)


def humanize_phase(value: str) -> str:
    text = value.strip()
    m = re.fullmatch(r"(?:fase|f)[ _-]?(\d+)", text.lower())
    if m:
        return f"Fase {m.group(1)}"
    if text.lower().startswith("pre_") or text.lower().startswith("pre-"):
        return "Pre" + text[4:].replace("_", " ").lower()
    text = text.replace("_", " ")
    return text[:1].upper() + text[1:]


def _to_v2(s) -> None:
    for t in s.exec(select(Task)):
        new = LEGACY_STATUS.get(t.status)
        if new:
            t.status = new
            s.add(t)
    for m in s.exec(select(Member)):
        m.presence_override = None
        m.override_until = None
        s.add(m)
    s.flush()

    for project in s.exec(select(Project)):
        if s.exec(select(Phase).where(Phase.project_id == project.id)).first():
            continue
        tasks = list(s.exec(select(Task).where(Task.project_id == project.id)))
        stages = list(s.exec(select(Stage).where(Stage.project_id == project.id).order_by(Stage.order)))
        categories = list(s.exec(select(RubricCategory).where(RubricCategory.project_id == project.id)))
        created: list[Phase] = []
        if stages or categories:
            name = project.phase.strip() if project.phase and not re.fullmatch(r"[a-z_]+", project.phase) else "Piloto de validación"
            phase = Phase(project_id=project.id, order=0, key=svc.phase_key(name), name=name,
                          start=min((st.start for st in stages), default=None),
                          end=project.pilot_date or max((st.end for st in stages), default=None),
                          use_rubric=bool(categories))
            s.add(phase)
            s.flush()
            created.append(phase)
            for st in stages:
                st.phase_id = phase.id
                s.add(st)
            for cat in categories:
                cat.phase_id = phase.id
                s.add(cat)
            for review in s.exec(select(RubricReview).where(RubricReview.project_id == project.id)):
                review.phase_id = phase.id
                s.add(review)
            stage_ids = {st.id for st in stages}
            for t in tasks:
                if t.stage_id in stage_ids or not t.phase:
                    t.phase_id = phase.id
                    s.add(t)
        values = sorted({t.phase.strip() for t in tasks if t.phase and t.phase.strip()}, key=_phase_sort)
        by_key: dict[str, Phase] = {}
        for value in values:
            phase = Phase(project_id=project.id, order=len(created), key=value, name=humanize_phase(value))
            s.add(phase)
            s.flush()
            created.append(phase)
            by_key[value] = phase
        for t in tasks:
            if t.phase_id is None and t.phase and t.phase.strip() in by_key:
                t.phase_id = by_key[t.phase.strip()].id
                s.add(t)
        if len(created) == 1:
            for t in tasks:
                if t.phase_id is None:
                    t.phase_id = created[0].id
                    s.add(t)
        # La fase actual es la primera que todavía tiene trabajo abierto; las anteriores ya se completaron
        current = None
        for phase in created:
            mine = [t for t in tasks if t.phase_id == phase.id and not t.archived]
            if current is None and (not mine or any(t.status != DONE for t in mine)):
                current = phase
                phase.status = "en_curso"
            elif current is None:
                phase.status = "completada"
            else:
                phase.status = "pendiente"
            s.add(phase)
        if current is None and created:
            current = created[-1]
            current.status = "en_curso"
            s.add(current)
        project.current_phase_id = current.id if current else None
        s.add(project)
    s.flush()
