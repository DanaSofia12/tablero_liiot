"""Rutas HTTP de Liiot HQ (todas bajo /api)."""
from __future__ import annotations

import json

from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import JSONResponse

from . import bot, config
from . import services as svc
from .catalog import (
    CRITERION_STATES,
    PRESENCE_OVERRIDES,
    PRIORITIES,
    PRIORITY_LABEL,
    STATUS_LABEL,
    STATUSES,
    TASK_TYPES,
    WEEKDAYS,
)
from .db import session_scope
from .hooks import task_changed
from .models import Member, Project, RubricCategory, RubricCriterion, Stage, Task
from .realtime import notify

router = APIRouter(prefix="/api")


def _actor(payload: dict) -> str:
    return str(payload.get("actorId") or "dana")


def _bad(exc: Exception) -> HTTPException:
    return HTTPException(status_code=400, detail=str(exc))


@router.get("/health")
async def health() -> dict:
    return {"ok": True}


@router.get("/catalog")
async def catalog() -> dict:
    return {
        "taskTypes": TASK_TYPES,
        "statuses": [{"id": s, "label": STATUS_LABEL[s]} for s in STATUSES],
        "priorities": [{"id": p, "label": PRIORITY_LABEL[p]} for p in PRIORITIES],
        "criterionStates": CRITERION_STATES,
        "weekdays": WEEKDAYS,
        "presenceOverrides": PRESENCE_OVERRIDES,
    }


# ---------------------------------------------------------------- personas
@router.get("/members")
async def list_members() -> list[dict]:
    with session_scope() as s:
        return [svc.member_out(m) for m in svc.members_all(s)]


@router.patch("/members/{member_id}")
async def update_member(member_id: str, payload: dict = Body(...)) -> dict:
    with session_scope() as s:
        m = s.get(Member, member_id)
        if m is None:
            raise HTTPException(404, "Persona no encontrada.")
        try:
            if "avatar" in payload and isinstance(payload["avatar"], dict):
                m.avatar_json = json.dumps(payload["avatar"])
            if "capacity" in payload:
                m.capacity = max(1, min(40, int(payload["capacity"])))
            if "color" in payload:
                m.color = str(payload["color"])[:9]
            if "area" in payload:
                m.area = str(payload["area"])[:120]
            if "workStart" in payload:
                m.work_start = svc.parse_hhmm(payload["workStart"]).strftime("%H:%M")
            if "workEnd" in payload:
                m.work_end = svc.parse_hhmm(payload["workEnd"], "19:00").strftime("%H:%M")
            if "presence" in payload:
                svc.set_presence_override(s, m, payload["presence"], payload.get("minutes", 120))
        except (ValueError, TypeError) as exc:
            raise _bad(exc) from exc
        s.add(m)
        s.commit()
        out = svc.member_out(m)
    await notify("members")
    return out


@router.post("/members/{member_id}/telegram/reset")
async def reset_member_telegram(member_id: str) -> dict:
    import secrets

    with session_scope() as s:
        m = s.get(Member, member_id)
        if m is None:
            raise HTTPException(404, "Persona no encontrada.")
        m.telegram_chat_id = None
        m.telegram_username = None
        m.link_code = secrets.token_hex(4)
        s.add(m)
        s.commit()
        out = svc.member_out(m)
    await notify("members")
    return out


# ---------------------------------------------------------------- proyecto y etapas
@router.get("/project")
async def get_project() -> dict:
    with session_scope() as s:
        p = s.get(Project, config.DEFAULT_PROJECT)
        return {"project": svc.project_out(p), "stages": [svc.stage_out(st) for st in svc.stages_all(s)]}


@router.patch("/project")
async def update_project(payload: dict = Body(...)) -> dict:
    with session_scope() as s:
        p = s.get(Project, config.DEFAULT_PROJECT)
        try:
            for key, attr in (("summary", "summary"), ("phase", "phase"), ("name", "name")):
                if key in payload:
                    setattr(p, attr, str(payload[key] or "").strip())
            if "pilotDate" in payload:
                p.pilot_date = svc.parse_date(payload["pilotDate"])
            if "backupDate" in payload:
                p.backup_date = svc.parse_date(payload["backupDate"])
            if "leadId" in payload:
                p.lead_id = payload["leadId"] or None
        except ValueError as exc:
            raise _bad(exc) from exc
        s.add(p)
        s.commit()
        out = svc.project_out(p)
    await notify("project")
    return out


@router.post("/stages")
async def create_stage(payload: dict = Body(...)) -> dict:
    with session_scope() as s:
        try:
            start, end = svc.parse_date(payload.get("start")), svc.parse_date(payload.get("end"))
            if not payload.get("name") or not start or not end:
                raise ValueError("La etapa necesita nombre, inicio y fin.")
            if end < start:
                raise ValueError("La fecha de fin no puede ser anterior al inicio.")
        except ValueError as exc:
            raise _bad(exc) from exc
        order = len(svc.stages_all(s))
        st = Stage(project_id=config.DEFAULT_PROJECT, order=order, name=str(payload["name"]).strip(), start=start, end=end,
                   exit_criteria=str(payload.get("exitCriteria") or "").strip())
        s.add(st)
        s.commit()
        out = svc.stage_out(st)
    await notify("project")
    return out


@router.patch("/stages/{stage_id}")
async def update_stage(stage_id: int, payload: dict = Body(...)) -> dict:
    with session_scope() as s:
        st = s.get(Stage, stage_id)
        if st is None:
            raise HTTPException(404, "Etapa no encontrada.")
        try:
            if "name" in payload:
                st.name = str(payload["name"]).strip() or st.name
            if "exitCriteria" in payload:
                st.exit_criteria = str(payload["exitCriteria"] or "").strip()
            if "start" in payload:
                st.start = svc.parse_date(payload["start"]) or st.start
            if "end" in payload:
                st.end = svc.parse_date(payload["end"]) or st.end
            if st.end < st.start:
                raise ValueError("La fecha de fin no puede ser anterior al inicio.")
        except ValueError as exc:
            raise _bad(exc) from exc
        s.add(st)
        s.commit()
        out = svc.stage_out(st)
    await notify("project")
    return out


# ---------------------------------------------------------------- tareas
@router.get("/tasks")
async def list_tasks(archived: bool = False) -> list[dict]:
    with session_scope() as s:
        return [svc.task_out(t) for t in svc.tasks_all(s, include_archived=archived)]


@router.post("/tasks")
async def create_task(payload: dict = Body(...)) -> dict:
    actor = _actor(payload)
    with session_scope() as s:
        try:
            task = svc.create_task(s, payload, actor)
        except (ValueError, TypeError) as exc:
            raise _bad(exc) from exc
        s.commit()
        out = svc.task_out(task)
    await task_changed(out["id"], {"reassigned": out["ownerId"] != actor}, actor, "web", owner_id=out["ownerId"], task_key=out["key"])
    return out


@router.patch("/tasks/{task_id}")
async def update_task(task_id: int, payload: dict = Body(...)) -> dict:
    actor = _actor(payload)
    with session_scope() as s:
        task = s.get(Task, task_id)
        if task is None:
            raise HTTPException(404, "Tarea no encontrada.")
        try:
            info = svc.apply_patch(s, task, payload, actor)
        except (ValueError, TypeError) as exc:
            raise _bad(exc) from exc
        s.commit()
        out = svc.task_out(task)
    if info["changed"]:
        await task_changed(task_id, info, actor, "web", owner_id=out["ownerId"], task_key=out["key"])
    return out


@router.post("/tasks/{task_id}/comments")
async def comment_task(task_id: int, payload: dict = Body(...)) -> dict:
    actor = _actor(payload)
    with session_scope() as s:
        task = s.get(Task, task_id)
        if task is None:
            raise HTTPException(404, "Tarea no encontrada.")
        try:
            svc.add_comment(s, task, payload.get("text", ""), actor)
        except ValueError as exc:
            raise _bad(exc) from exc
        s.commit()
    await notify("tasks", taskId=task_id)
    return {"ok": True}


@router.get("/tasks/{task_id}/events")
async def task_events(task_id: int) -> list[dict]:
    with session_scope() as s:
        return [svc.event_out(e) for e in svc.task_events(s, task_id)]


@router.post("/tasks/{task_id}/followup")
async def followup(task_id: int, payload: dict = Body(default={})) -> dict:
    sent, message = await bot.send_followup(task_id, _actor(payload))
    return {"sent": sent, "message": message}


# ---------------------------------------------------------------- rúbrica
@router.get("/rubric")
async def rubric() -> dict:
    with session_scope() as s:
        return svc.rubric_overview(s)


@router.patch("/rubric/criteria/{criterion_id}")
async def update_criterion(criterion_id: int, payload: dict = Body(...)) -> dict:
    with session_scope() as s:
        c = s.get(RubricCriterion, criterion_id)
        if c is None:
            raise HTTPException(404, "Criterio no encontrado.")
        try:
            svc.update_criterion(s, c, payload)
        except ValueError as exc:
            raise _bad(exc) from exc
        s.commit()
    await notify("rubric")
    return {"ok": True}


@router.post("/rubric/criteria")
async def create_criterion(payload: dict = Body(...)) -> dict:
    with session_scope() as s:
        cat = s.get(RubricCategory, int(payload.get("categoryId") or 0))
        if cat is None:
            raise HTTPException(400, "La categoría no existe.")
        code = str(payload.get("code") or "").strip().upper()
        title = str(payload.get("title") or "").strip()
        if not code or not title:
            raise HTTPException(400, "El criterio necesita código y texto.")
        order = len([c for c in svc.criteria_all(s) if c.category_id == cat.id])
        s.add(RubricCriterion(category_id=cat.id, code=code, title=title, verify=str(payload.get("verify") or "").strip(),
                              blocking=bool(payload.get("blocking")), order=order, state="pendiente"))
        s.commit()
    await notify("rubric")
    return {"ok": True}


@router.post("/rubric/reviews")
async def create_review(payload: dict = Body(...)) -> dict:
    with session_scope() as s:
        try:
            review = svc.create_review(s, str(payload.get("reviewerId") or "dana"), payload.get("notes", ""))
        except ValueError as exc:
            raise _bad(exc) from exc
        s.commit()
        out = svc.review_out(review)
    await notify("rubric")
    return out


# ---------------------------------------------------------------- métricas y presencia
@router.get("/metrics")
async def metrics() -> dict:
    with session_scope() as s:
        team = svc.team_metrics(s)
        return {
            "project": svc.project_metrics(s),
            "team": team,
            "suggestions": svc.suggestions(team, svc.tasks_all(s), svc.member_names(s)),
        }


@router.get("/presence")
async def presence(ignoreHours: bool = False) -> list[dict]:  # noqa: N803  (nombre del parámetro en la URL)
    with session_scope() as s:
        return svc.presence(s, ignore_hours=ignoreHours)


# ---------------------------------------------------------------- telegram
@router.get("/telegram")
async def telegram() -> dict:
    with session_scope() as s:
        return {"settings": svc.telegram_settings(s), "status": bot.status_out(s)}


@router.patch("/telegram/settings")
async def telegram_settings(payload: dict = Body(...)) -> dict:
    with session_scope() as s:
        try:
            data = svc.save_telegram_settings(s, payload)
        except (ValueError, TypeError) as exc:
            raise _bad(exc) from exc
        s.commit()
    bot.schedule_jobs()
    await notify("settings")
    return data


@router.post("/telegram/unlink-group")
async def unlink_group() -> dict:
    with session_scope() as s:
        data = svc.save_telegram_settings(s, {"groupChatId": None, "groupTitle": None})
        s.commit()
    await notify("settings")
    return data


@router.post("/telegram/run-weekly")
async def run_weekly() -> dict:
    return await bot.run_weekly(force=True)


@router.post("/telegram/run-reminders")
async def run_reminders() -> dict:
    return await bot.run_due_reminders()


@router.get("/checkins")
async def checkins() -> list[dict]:
    with session_scope() as s:
        return [svc.checkin_out(c) for c in svc.recent_checkins(s)]


@router.get("/export")
async def export() -> JSONResponse:
    with session_scope() as s:
        data = svc.export_all(s)
    stamp = svc.local_today().isoformat()
    return JSONResponse(data, headers={"Content-Disposition": f'attachment; filename="liiot-hq-{stamp}.json"'})
