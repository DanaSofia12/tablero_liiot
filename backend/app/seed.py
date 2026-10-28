"""Carga inicial: el equipo, Bleepy y su rúbrica, tomados del vault."""
from __future__ import annotations

import json
import secrets
from datetime import date, datetime
from pathlib import Path

from sqlmodel import select

from .catalog import DEFAULT_TELEGRAM
from .db import session_scope
from .models import Member, Project, RubricCategory, RubricCriterion, Setting, Stage, Task, TaskEvent
from .services import utcnow

SEED_FILE = Path(__file__).parent / "seed_data" / "bleepy.json"


def seed_if_empty() -> bool:
    with session_scope() as s:
        if s.exec(select(Project)).first() is not None:
            return False
        data = json.loads(SEED_FILE.read_text(encoding="utf-8"))

        for order, m in enumerate(data["members"]):
            s.add(Member(
                id=m["id"], name=m["name"], full_name=m["fullName"], role=m["role"], area=m["area"],
                color=m["color"], capacity=m["capacity"], avatar_json=json.dumps(m["avatar"]),
                link_code=secrets.token_hex(4), order=order,
            ))

        p = data["project"]
        s.add(Project(
            id=p["id"], code=p["code"], name=p["name"], summary=p["summary"], lead_id=p["leadId"],
            pilot_date=date.fromisoformat(p["pilotDate"]), backup_date=date.fromisoformat(p["backupDate"]),
            phase=p["phase"], key_prefix=p["keyPrefix"], theme=p["theme"],
        ))

        stage_ids: dict[str, int] = {}
        for order, st in enumerate(data["stages"]):
            stage = Stage(project_id=p["id"], order=order, name=st["name"], start=date.fromisoformat(st["start"]),
                          end=date.fromisoformat(st["end"]), exit_criteria=st["exitCriteria"])
            s.add(stage)
            s.flush()
            stage_ids[st["ref"]] = stage.id

        for number, t in enumerate(data["tasks"], start=1):
            created = datetime.fromisoformat(t["start"] + "T12:00:00+00:00")
            due = date.fromisoformat(t["due"])
            task = Task(
                key=f"{p['keyPrefix']}-{number}", project_id=p["id"], title=t["title"], summary=t["summary"],
                type=t["type"], priority=t["priority"], status=t["status"], owner_id=t["owner"],
                collaborators=",".join(t["collaborators"]), start_date=date.fromisoformat(t["start"]),
                due_date=due, due_original=due, stage_id=stage_ids[t["stage"]], rubric=",".join(t["rubric"]),
                effort=t["effort"], origin=t["origin"], legacy_id=t["legacyId"], created_at=created,
                updated_at=created, sort=float(number),
            )
            s.add(task)
            s.flush()
            origin = f"Importada del vault ({t['legacyId']})" if t["legacyId"] else "Creada desde el «Cronograma piloto» del vault"
            s.add(TaskEvent(task_id=task.id, at=utcnow(), actor="sistema", source="vault", kind="creacion", text=origin))

        for c_order, cat in enumerate(data["rubric"]):
            category = RubricCategory(project_id=p["id"], order=c_order, name=cat["name"])
            s.add(category)
            s.flush()
            for order, c in enumerate(cat["criteria"]):
                s.add(RubricCriterion(category_id=category.id, code=c["code"], title=c["title"], verify=c["verify"],
                                      blocking=c["blocking"], order=order))

        s.add(Setting(key="telegram", value_json=json.dumps(DEFAULT_TELEGRAM)))
        s.commit()
        return True
