"""Rutas HTTP de Liiot Hub (todas bajo /api y solo con sesión iniciada)."""
from __future__ import annotations

import asyncio
import json
import re

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import JSONResponse, Response
from sqlmodel import select

from . import analytics, bot, config, export_xlsx, phases, vault
from . import services as svc
from .auth import Me, current_member, require_admin
from .catalog import (
    APP_NAME,
    CRITERION_STATES,
    PRESENCE_LABEL,
    PRESENCE_STATES,
    PRIORITIES,
    PRIORITY_COLOR,
    PRIORITY_LABEL,
    STATUS_LABEL,
    STATUSES,
    TASK_TYPES,
    WEEKDAYS,
)
from .db import session_scope
from .hooks import task_changed
from .models import Member, Phase, PhaseCheck, Project, RubricCategory, RubricCriterion, Stage, Task
from .realtime import notify

public = APIRouter(prefix="/api")
router = APIRouter(prefix="/api", dependencies=[Depends(current_member)])


def _bad(exc: Exception) -> HTTPException:
    return HTTPException(status_code=400, detail=str(exc))


@public.get("/health")
async def health() -> dict:
    return {"ok": True, "app": APP_NAME}


@router.get("/catalog")
async def catalog() -> dict:
    return {
        "taskTypes": TASK_TYPES,
        "statuses": [{"id": s, "label": STATUS_LABEL[s]} for s in STATUSES],
        "priorities": [{"id": p, "label": PRIORITY_LABEL[p], "color": PRIORITY_COLOR[p]} for p in PRIORITIES],
        "criterionStates": CRITERION_STATES,
        "weekdays": WEEKDAYS,
        "presenceStates": [{"id": p, "label": PRESENCE_LABEL[p]} for p in PRESENCE_STATES],
    }


# ---------------------------------------------------------------- personas
@router.get("/members")
async def list_members(me: Me = Depends(current_member)) -> list[dict]:
    with session_scope() as s:
        return [svc.member_out(m, private=me.is_admin or m.id == me.id) for m in svc.members_all(s)]


@router.patch("/members/{member_id}")
async def update_member(member_id: str, payload: dict = Body(...), me: Me = Depends(current_member)) -> dict:
    """Cada persona edita su perfil (avatar, color, horario); quien administra puede editar el de cualquiera."""
    if member_id != me.id and not me.is_admin:
        raise HTTPException(403, "Solo puedes cambiar tu propio perfil.")
    with session_scope() as s:
        m = s.get(Member, member_id)
        if m is None:
            raise HTTPException(404, "Persona no encontrada.")
        try:
            if "avatar" in payload and isinstance(payload["avatar"], dict):
                m.avatar_json = json.dumps(payload["avatar"])
            if "color" in payload:
                m.color = str(payload["color"])[:9]
            for key, attr, limit in (("name", "name", 40), ("fullName", "full_name", 120), ("role", "role", 40), ("area", "area", 120)):
                if key in payload:
                    value = str(payload[key] or "").strip()[:limit]
                    if value or attr == "area":
                        setattr(m, attr, value)
            if "workStart" in payload:
                m.work_start = svc.parse_hhmm(payload["workStart"]).strftime("%H:%M")
            if "workEnd" in payload:
                m.work_end = svc.parse_hhmm(payload["workEnd"], "19:00").strftime("%H:%M")
            if "workDays" in payload:
                days = sorted({int(d) for d in payload["workDays"] if 0 <= int(d) <= 6})
                if not days:
                    raise ValueError("Elige al menos un día de trabajo.")
                m.work_days = ",".join(str(d) for d in days)
        except (ValueError, TypeError) as exc:
            raise _bad(exc) from exc
        s.add(m)
        s.commit()
        out = svc.member_out(m, private=True)
    await notify("members")
    return out


@router.post("/members/{member_id}/telegram/reset")
async def reset_member_telegram(member_id: str, me: Me = Depends(current_member)) -> dict:
    import secrets

    if member_id != me.id and not me.is_admin:
        raise HTTPException(403, "Solo puedes desvincular tu propio Telegram.")
    with session_scope() as s:
        m = s.get(Member, member_id)
        if m is None:
            raise HTTPException(404, "Persona no encontrada.")
        m.telegram_chat_id = None
        m.telegram_username = None
        m.link_code = secrets.token_hex(4)
        s.add(m)
        s.commit()
        out = svc.member_out(m, private=True)
    await notify("members")
    return out


# ---------------------------------------------------------------- estado en la oficina
@router.get("/presence")
async def presence() -> list[dict]:
    with session_scope() as s:
        return svc.presence(s)


@router.patch("/me/presence")
async def set_my_presence(payload: dict = Body(...), me: Me = Depends(current_member)) -> dict:
    with session_scope() as s:
        m = s.get(Member, me.id)
        try:
            svc.set_presence(s, m, str(payload.get("state") or ""), payload.get("note") or "", payload.get("taskId"))
        except ValueError as exc:
            raise _bad(exc) from exc
        s.commit()
        out = next(p for p in svc.presence(s) if p["memberId"] == me.id)
    await notify("members")
    return out


# ---------------------------------------------------------------- proyectos
def _project(s, project_id: str | None) -> Project:
    p = s.get(Project, project_id or svc.default_project_id(s))
    if p is None:
        raise HTTPException(404, "Proyecto no encontrado.")
    return p


@router.get("/projects")
async def list_projects(archived: bool = False) -> list[dict]:
    with session_scope() as s:
        tasks = svc.tasks_all(s)
        return [svc.project_out(p, tasks, svc.current_phase(s, p)) for p in svc.projects_all(s, include_archived=archived)]


@router.post("/projects")
async def create_project(payload: dict = Body(...)) -> dict:
    with session_scope() as s:
        try:
            p = svc.create_project(s, payload)
        except (ValueError, TypeError) as exc:
            raise _bad(exc) from exc
        s.commit()
        out = svc.project_out(p, [], svc.current_phase(s, p))
    await notify("project")
    vault.request_sync()  # crea su carpeta en Obsidian
    return out


@router.get("/projects/{project_id}")
async def get_project(project_id: str) -> dict:
    with session_scope() as s:
        p = _project(s, project_id)
        return {
            "project": svc.project_out(p, svc.tasks_all(s, p.id), svc.current_phase(s, p)),
            "stages": [svc.stage_out(st) for st in svc.stages_all(s, p.id)],
            "phases": [{"id": ph.id, "name": ph.name, "key": ph.key, "status": ph.status, "order": ph.order, "start": svc.iso_d(ph.start),
                        "end": svc.iso_d(ph.end)} for ph in svc.phases_all(s, p.id)],
            "metrics": svc.project_metrics(s, p.id),
        }


@router.patch("/projects/{project_id}")
async def patch_project(project_id: str, payload: dict = Body(...)) -> dict:
    with session_scope() as s:
        p = _project(s, project_id)
        try:
            svc.update_project(s, p, payload)
        except (ValueError, TypeError) as exc:
            raise _bad(exc) from exc
        s.commit()
        out = svc.project_out(p, None, svc.current_phase(s, p))
    await notify("project")
    vault.request_sync()
    return out


# ---------------------------------------------------------------- fases, mínimos y etapas
@router.get("/projects/{project_id}/phases")
async def list_phases(project_id: str) -> dict:
    with session_scope() as s:
        return phases.phases_out(s, _project(s, project_id))


@router.post("/projects/{project_id}/phases")
async def create_phase(project_id: str, payload: dict = Body(...), me: Me = Depends(current_member)) -> dict:
    with session_scope() as s:
        project = _project(s, project_id)
        try:
            phase = phases.create_phase(s, project, payload, me.id)
        except (ValueError, TypeError) as exc:
            raise _bad(exc) from exc
        s.commit()
        out = phases.phase_out(s, phase)
    await notify("project")
    return out


def _phase(s, phase_id: int) -> Phase:
    phase = s.get(Phase, phase_id)
    if phase is None:
        raise HTTPException(404, "Fase no encontrada.")
    return phase


@router.patch("/phases/{phase_id}")
async def update_phase(phase_id: int, payload: dict = Body(...)) -> dict:
    with session_scope() as s:
        phase = _phase(s, phase_id)
        try:
            phases.update_phase(s, phase, payload)
            if payload.get("move") in (-1, 1):
                phases.move(s, phase, int(payload["move"]))
        except (ValueError, TypeError) as exc:
            raise _bad(exc) from exc
        s.commit()
        out = phases.phase_out(s, phase)
    await notify("project")
    vault.request_sync()
    return out


@router.delete("/phases/{phase_id}")
async def delete_phase(phase_id: int) -> dict:
    with session_scope() as s:
        phase = _phase(s, phase_id)
        try:
            phases.delete_phase(s, phase)
        except ValueError as exc:
            raise _bad(exc) from exc
        s.commit()
    await notify("project")
    return {"ok": True}


@router.post("/phases/{phase_id}/advance")
async def advance_phase(phase_id: int, payload: dict = Body(default={}), me: Me = Depends(current_member)) -> dict:
    with session_scope() as s:
        phase = _phase(s, phase_id)
        try:
            nxt = phases.advance(s, phase, me.id, payload.get("note", ""), bool(payload.get("force")))
        except ValueError as exc:
            raise _bad(exc) from exc
        s.commit()
        project_id, next_name = phase.project_id, nxt.name if nxt else None
        out = phases.phases_out(s, _project(s, project_id))
    await notify("project")
    await bot.on_phase_change(project_id, next_name, me.id)
    return out


@router.post("/phases/{phase_id}/activate")
async def activate_phase(phase_id: int) -> dict:
    with session_scope() as s:
        phase = _phase(s, phase_id)
        phases.activate(s, phase)
        s.commit()
        out = phases.phases_out(s, _project(s, phase.project_id))
    await notify("project")
    return out


@router.post("/phases/{phase_id}/checks")
async def add_check(phase_id: int, payload: dict = Body(...)) -> dict:
    with session_scope() as s:
        phase = _phase(s, phase_id)
        try:
            check = phases.add_check(s, phase, payload.get("text", ""))
        except ValueError as exc:
            raise _bad(exc) from exc
        s.commit()
        out = phases.check_out(check)
    await notify("project")
    return out


@router.patch("/checks/{check_id}")
async def update_check(check_id: int, payload: dict = Body(...), me: Me = Depends(current_member)) -> dict:
    with session_scope() as s:
        check = s.get(PhaseCheck, check_id)
        if check is None:
            raise HTTPException(404, "Mínimo no encontrado.")
        try:
            phases.update_check(s, check, payload, me.id)
        except ValueError as exc:
            raise _bad(exc) from exc
        s.commit()
        out = phases.check_out(check)
    await notify("project")
    return out


@router.delete("/checks/{check_id}")
async def delete_check(check_id: int) -> dict:
    with session_scope() as s:
        check = s.get(PhaseCheck, check_id)
        if check is None:
            raise HTTPException(404, "Mínimo no encontrado.")
        s.delete(check)
        s.commit()
    await notify("project")
    return {"ok": True}


@router.post("/stages")
async def create_stage(payload: dict = Body(...)) -> dict:
    with session_scope() as s:
        project = _project(s, payload.get("projectId"))
        try:
            stage = phases.create_stage(s, project, payload)
        except ValueError as exc:
            raise _bad(exc) from exc
        s.commit()
        out = svc.stage_out(stage)
    await notify("project")
    return out


@router.patch("/stages/{stage_id}")
async def update_stage(stage_id: int, payload: dict = Body(...)) -> dict:
    with session_scope() as s:
        stage = s.get(Stage, stage_id)
        if stage is None:
            raise HTTPException(404, "Etapa no encontrada.")
        try:
            phases.update_stage(s, stage, payload)
        except ValueError as exc:
            raise _bad(exc) from exc
        s.commit()
        out = svc.stage_out(stage)
    await notify("project")
    vault.request_sync()
    return out


@router.delete("/stages/{stage_id}")
async def delete_stage(stage_id: int) -> dict:
    with session_scope() as s:
        stage = s.get(Stage, stage_id)
        if stage is None:
            raise HTTPException(404, "Etapa no encontrada.")
        phases.delete_stage(s, stage)
        s.commit()
    await notify("project")
    vault.request_sync()
    return {"ok": True}


# ---------------------------------------------------------------- rúbrica de una fase
@router.get("/phases/{phase_id}/rubric")
async def phase_rubric(phase_id: int) -> dict:
    with session_scope() as s:
        return svc.rubric_overview(s, _phase(s, phase_id))


@router.post("/phases/{phase_id}/rubric/template")
async def rubric_template(phase_id: int) -> dict:
    with session_scope() as s:
        phase = _phase(s, phase_id)
        try:
            svc.add_basic_rubric(s, phase)
        except ValueError as exc:
            raise _bad(exc) from exc
        s.commit()
    await notify("rubric")
    return {"ok": True}


@router.post("/phases/{phase_id}/rubric/categories")
async def create_category(phase_id: int, payload: dict = Body(...)) -> dict:
    with session_scope() as s:
        phase = _phase(s, phase_id)
        try:
            category = phases.add_category(s, phase, payload.get("name", ""))
        except ValueError as exc:
            raise _bad(exc) from exc
        s.commit()
        out = {"id": category.id, "name": category.name}
    await notify("rubric")
    return out


@router.patch("/rubric/categories/{category_id}")
async def rename_category(category_id: int, payload: dict = Body(...)) -> dict:
    with session_scope() as s:
        category = s.get(RubricCategory, category_id)
        if category is None:
            raise HTTPException(404, "Grupo no encontrado.")
        name = str(payload.get("name") or "").strip()
        if not name:
            raise HTTPException(400, "El grupo necesita un nombre.")
        category.name = name[:120]
        s.add(category)
        s.commit()
    await notify("rubric")
    return {"ok": True}


@router.delete("/rubric/categories/{category_id}")
async def delete_category(category_id: int) -> dict:
    with session_scope() as s:
        category = s.get(RubricCategory, category_id)
        if category is None:
            raise HTTPException(404, "Grupo no encontrado.")
        phases.delete_category(s, category)
        s.commit()
    await notify("rubric")
    return {"ok": True}


@router.post("/rubric/criteria")
async def create_criterion(payload: dict = Body(...)) -> dict:
    with session_scope() as s:
        category = s.get(RubricCategory, int(payload.get("categoryId") or 0))
        if category is None:
            raise HTTPException(400, "El grupo no existe.")
        try:
            criterion = phases.add_criterion(s, category, payload)
        except ValueError as exc:
            raise _bad(exc) from exc
        s.commit()
        out = svc.criterion_out(criterion)
    await notify("rubric")
    return out


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


@router.delete("/rubric/criteria/{criterion_id}")
async def delete_criterion(criterion_id: int) -> dict:
    with session_scope() as s:
        c = s.get(RubricCriterion, criterion_id)
        if c is None:
            raise HTTPException(404, "Criterio no encontrado.")
        s.delete(c)
        s.commit()
    await notify("rubric")
    return {"ok": True}


@router.post("/phases/{phase_id}/rubric/reviews")
async def create_review(phase_id: int, payload: dict = Body(default={}), me: Me = Depends(current_member)) -> dict:
    with session_scope() as s:
        phase = _phase(s, phase_id)
        review = svc.create_review(s, me.id, payload.get("notes", ""), phase)
        s.commit()
        out = svc.review_out(review)
    await notify("rubric")
    return out


# ---------------------------------------------------------------- tareas
@router.get("/tasks")
async def list_tasks(archived: bool = False, project: str | None = None) -> list[dict]:
    with session_scope() as s:
        paths = vault.task_paths(s)
        return [svc.task_out(t, paths.get(t.id)) for t in svc.tasks_all(s, project, include_archived=archived)]


@router.post("/tasks")
async def create_task(payload: dict = Body(...), me: Me = Depends(current_member)) -> dict:
    with session_scope() as s:
        try:
            task = svc.create_task(s, payload, me.id)
        except (ValueError, TypeError) as exc:
            raise _bad(exc) from exc
        s.commit()
        out = svc.task_out(task)
    await task_changed(out["id"], {"created": True, "reassigned": out["ownerId"] != me.id}, me.id, "web", owner_id=out["ownerId"],
                       task_key=out["key"])
    return out


@router.patch("/tasks/{task_id}")
async def update_task(task_id: int, payload: dict = Body(...), me: Me = Depends(current_member)) -> dict:
    with session_scope() as s:
        task = s.get(Task, task_id)
        if task is None:
            raise HTTPException(404, "Tarea no encontrada.")
        try:
            info = svc.apply_patch(s, task, payload, me.id)
        except (ValueError, TypeError) as exc:
            raise _bad(exc) from exc
        s.commit()
        out = svc.task_out(task)
    if info["changed"]:
        await task_changed(task_id, info, me.id, "web", owner_id=out["ownerId"], task_key=out["key"])
    return out


@router.post("/tasks/{task_id}/comments")
async def comment_task(task_id: int, payload: dict = Body(...), me: Me = Depends(current_member)) -> dict:
    with session_scope() as s:
        task = s.get(Task, task_id)
        if task is None:
            raise HTTPException(404, "Tarea no encontrada.")
        try:
            svc.add_comment(s, task, payload.get("text", ""), me.id)
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
async def followup(task_id: int, me: Me = Depends(current_member)) -> dict:
    sent, message = await bot.send_followup(task_id, me.id)
    return {"sent": sent, "message": message}


# ---------------------------------------------------------------- indicadores, equipo y cronograma
@router.get("/metrics")
async def metrics(project: str | None = None) -> dict:
    with session_scope() as s:
        return svc.project_metrics(s, _project(s, project).id)


@router.get("/team")
async def team(project: str | None = None) -> dict:
    """Análisis del equipo: todos los proyectos o solo uno."""
    with session_scope() as s:
        scope = _project(s, project).id if project else None
        return analytics.team_overview(s, scope)


@router.get("/projects/{project_id}/cronograma.xlsx")
async def timeline_excel(project_id: str, desde: str | None = None, hasta: str | None = None, fase: int | None = None,
                         etapa: int | None = None, persona: str | None = None) -> Response:
    with session_scope() as s:
        project = _project(s, project_id)
        try:
            data = export_xlsx.build(s, project, svc.parse_date(desde), svc.parse_date(hasta), fase, etapa, persona or None)
        except ValueError as exc:
            raise _bad(exc) from exc
    name = f"cronograma-{svc.slugify(project.name)}-{svc.local_today().isoformat()}.xlsx"
    return Response(data, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


# ---------------------------------------------------------------- telegram
@router.get("/telegram")
async def telegram(me: Me = Depends(current_member)) -> dict:
    with session_scope() as s:
        return {"settings": svc.telegram_settings(s), "status": bot.status_out(s, me.id, me.is_admin)}


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


TOKEN_RE = re.compile(r"\d{5,12}:[A-Za-z0-9_-]{30,60}")


@router.post("/telegram/token")
async def set_telegram_token(payload: dict = Body(...), me: Me = Depends(require_admin)) -> dict:
    """Guarda el token de BotFather en .env, lo prueba con Telegram y reinicia el bot. El token nunca se devuelve."""
    token = str(payload.get("token") or "").strip()
    if not TOKEN_RE.fullmatch(token):
        raise HTTPException(400, "Eso no parece un token de BotFather. Debe verse como 1234567890:AAH… (números, dos puntos y letras).")
    from telegram import Bot
    from telegram.error import TelegramError

    try:
        async with Bot(token) as probe:
            await asyncio.wait_for(probe.get_me(), timeout=15)
    except (TelegramError, asyncio.TimeoutError, OSError) as exc:
        raise HTTPException(400, f"Telegram no aceptó el token ({exc}). Revisa que lo copiaste completo.") from exc
    config.save_env_value("TELEGRAM_BOT_TOKEN", token)
    await bot.restart_bot(token)
    with session_scope() as s:
        out = {"settings": svc.telegram_settings(s), "status": bot.status_out(s, me.id, me.is_admin)}
    await notify("settings")
    return out


@router.delete("/telegram/token")
async def remove_telegram_token(me: Me = Depends(require_admin)) -> dict:
    config.save_env_value("TELEGRAM_BOT_TOKEN", "")
    await bot.restart_bot("")
    with session_scope() as s:
        out = {"settings": svc.telegram_settings(s), "status": bot.status_out(s, me.id, me.is_admin)}
    await notify("settings")
    return out


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


@router.post("/telegram/run-group")
async def run_group() -> dict:
    return await bot.run_group_daily(force=True)


@router.post("/telegram/run-checkin")
async def run_checkin(me: Me = Depends(current_member)) -> dict:
    """Prueba la pregunta diaria contigo mismo."""
    return await bot.run_daily_checkins(force_member=me.id)


@router.get("/checkins")
async def checkins() -> list[dict]:
    with session_scope() as s:
        return [svc.checkin_out(c) for c in svc.recent_checkins(s)]


# ---------------------------------------------------------------- obsidian y datos
@router.get("/vault")
async def vault_status() -> dict:
    with session_scope() as s:
        return vault.status_out(s)


@router.patch("/vault")
async def vault_settings(payload: dict = Body(...), me: Me = Depends(require_admin)) -> dict:
    with session_scope() as s:
        try:
            vault.save_settings(s, payload)
        except ValueError as exc:
            raise _bad(exc) from exc
        s.commit()
    vault.request_sync()
    with session_scope() as s:
        out = vault.status_out(s)
    await notify("vault")
    return out


@router.post("/vault/sync")
async def vault_sync_now() -> dict:
    result = await vault.sync_and_notify()
    with session_scope() as s:
        return {"result": {k: v for k, v in result.items() if k != "changes"}, "status": vault.status_out(s)}


@router.get("/export")
async def export(me: Me = Depends(require_admin)) -> JSONResponse:
    with session_scope() as s:
        data = svc.export_all(s)
    stamp = svc.local_today().isoformat()
    return JSONResponse(data, headers={"Content-Disposition": f'attachment; filename="liiot-hub-{stamp}.json"'})
