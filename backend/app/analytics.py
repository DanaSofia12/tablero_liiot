"""Análisis del equipo en palabras simples: qué tiene cada quien por mes, qué fechas se cruzan,
qué días se juntan muchas entregas, qué está atrasado y cómo avanzamos semana a semana."""
from __future__ import annotations

from datetime import date, timedelta

from sqlmodel import Session

from . import services as svc
from .catalog import DONE, PAUSED
from .models import Task

HEAVY_DAY = 3  # entregas el mismo día que ya se sienten pesadas
OVERLAP = 3  # tareas abiertas al mismo tiempo que ya se cruzan demasiado
LOOKAHEAD = 45  # días hacia adelante para buscar cruces y días cargados


def _month_key(day: date) -> str:
    return f"{day.year}-{day.month:02d}"


def _months(today: date, back: int = 2, ahead: int = 3) -> list[date]:
    first = today.replace(day=1)
    out = []
    for offset in range(-back, ahead + 1):
        month = first.month - 1 + offset
        out.append(date(first.year + month // 12, month % 12 + 1, 1))
    return out


def _label(day: date) -> str:
    return f"{svc.MONTHS[day.month - 1]} {day.year % 100:02d}" if day.year != svc.local_today().year else svc.MONTHS[day.month - 1]


def _span(t: Task) -> tuple[date, date] | None:
    if not t.due_date:
        return None
    start = t.start_date or t.due_date
    return (min(start, t.due_date), t.due_date)


def _tracked(t: Task) -> bool:
    """¿Se finalizó dentro de Liiot Hub? Las que llegaron ya finalizadas (importadas) no dicen nada de puntualidad."""
    if t.status != DONE or not t.completed_at:
        return False
    return (svc.aware(t.completed_at) - svc.aware(t.created_at)).total_seconds() > 120


def _done_day(t: Task) -> date:
    return svc.aware(t.completed_at).astimezone(svc.TZ).date()


def _brief(t: Task, today: date) -> dict:
    out = svc.task_brief(t)
    if t.due_date and t.status != DONE and t.due_date < today:
        out["daysLate"] = (today - t.due_date).days
    return out


def overlaps(tasks: list[Task], today: date) -> list[dict]:
    """Periodos de los próximos días en que una persona tiene varias tareas abiertas a la vez."""
    spans = [(t, _span(t)) for t in tasks if t.status != DONE and _span(t)]
    periods: list[dict] = []
    current: dict | None = None
    for offset in range(LOOKAHEAD):
        day = today + timedelta(days=offset)
        active = [t for t, (a, b) in spans if a <= day <= b]
        if len(active) >= OVERLAP:
            ids = {t.id for t in active}
            if current and current["end"] == day - timedelta(days=1):
                current["end"] = day
                current["ids"] |= ids
                current["peak"] = max(current["peak"], len(active))
            else:
                current = {"start": day, "end": day, "ids": ids, "peak": len(active)}
                periods.append(current)
        else:
            current = None
    by_id = {t.id: t for t, _ in spans}
    return [
        {
            "start": p["start"].isoformat(),
            "end": p["end"].isoformat(),
            "peak": p["peak"],
            "tasks": [_brief(by_id[i], today) for i in sorted(p["ids"], key=lambda i: by_id[i].due_date or date.max)][:6],
        }
        for p in periods[:4]
    ]


def heavy_days(tasks: list[Task], today: date) -> list[dict]:
    by_day: dict[date, list[Task]] = {}
    for t in tasks:
        if t.status != DONE and t.due_date and today <= t.due_date <= today + timedelta(days=LOOKAHEAD):
            by_day.setdefault(t.due_date, []).append(t)
    return [
        {"day": day.isoformat(), "count": len(items), "tasks": [_brief(t, today) for t in items][:6]}
        for day, items in sorted(by_day.items())
        if len(items) >= HEAVY_DAY
    ][:5]


def person(member_id: str, tasks: list[Task], today: date, months: list[date]) -> dict:
    mine = [t for t in tasks if t.owner_id == member_id]
    open_tasks = [t for t in mine if t.status != DONE]
    month_start = today.replace(day=1)
    done = [t for t in mine if t.status == DONE and t.completed_at]
    recent = [t for t in done if _tracked(t) and t.due_date and _done_day(t) >= today - timedelta(days=60)]
    on_time = sum(1 for t in recent if _done_day(t) <= t.due_date)
    overdue = sorted([t for t in open_tasks if t.due_date and t.due_date < today], key=lambda t: t.due_date)
    by_month = []
    for m in months:
        nxt = date(m.year + (m.month // 12), m.month % 12 + 1, 1)
        due_in = [t for t in mine if t.due_date and m <= t.due_date < nxt]
        by_month.append({
            "month": _month_key(m),
            "label": _label(m),
            "assigned": len(due_in),
            "done": sum(1 for t in due_in if t.status == DONE),
            "late": sum(1 for t in due_in if t.status != DONE and t.due_date < today),
            "current": m == month_start,
        })
    return {
        "memberId": member_id,
        "counts": {
            "pending": sum(1 for t in mine if t.status == "pendiente"),
            "inProgress": sum(1 for t in mine if t.status == "en_progreso"),
            "paused": sum(1 for t in mine if t.status == PAUSED),
            "testing": sum(1 for t in mine if t.status == "pruebas"),
            "open": len(open_tasks),
            "overdue": len(overdue),
            "dueThisWeek": sum(1 for t in open_tasks if t.due_date and today <= t.due_date <= today + timedelta(days=7)),
            "doneThisMonth": sum(1 for t in done if svc.aware(t.completed_at).astimezone(svc.TZ).date() >= month_start),
            "doneTotal": len(done),
            "undated": sum(1 for t in open_tasks if not t.due_date),
        },
        "onTimePct": round(on_time * 100 / len(recent)) if recent else None,
        "onTimeBase": len(recent),
        "byMonth": by_month,
        "overlaps": overlaps(mine, today),
        "heavyDays": heavy_days(mine, today),
        "overdue": [_brief(t, today) for t in overdue[:5]],
        "next": [_brief(t, today) for t in sorted([t for t in open_tasks if t.due_date and t.due_date >= today], key=lambda t: t.due_date)[:3]],
    }


def progress(tasks: list[Task], today: date, members: list[str], weeks_back: int = 8, weeks_ahead: int = 4) -> list[dict]:
    """Semana a semana: lo que debía estar listo (por fecha de entrega) contra lo que de verdad se finalizó."""
    monday = today - timedelta(days=today.weekday())
    out = []
    for offset in range(-weeks_back, weeks_ahead + 1):
        start = monday + timedelta(weeks=offset)
        end = start + timedelta(days=6)
        created = [t for t in tasks if svc.aware(t.created_at).astimezone(svc.TZ).date() <= end]
        done_by = [t for t in tasks if t.status == DONE and t.completed_at and svc.aware(t.completed_at).astimezone(svc.TZ).date() <= end]
        done_week = [t for t in done_by if svc.aware(t.completed_at).astimezone(svc.TZ).date() >= start]
        out.append({
            "weekStart": start.isoformat(),
            "weekEnd": end.isoformat(),
            "label": f"{start.day} {svc.MONTHS[start.month - 1]}",
            "future": start > today,
            "current": start <= today <= end,
            "planned": sum(1 for t in tasks if t.due_date and t.due_date <= end),
            "done": len(done_by) if start <= today else None,
            "scope": len(created),
            "doneWeek": {m: sum(1 for t in done_week if t.owner_id == m) for m in members} if start <= today else None,
        })
    return out


def team_overview(s: Session, project_id: str | None = None) -> dict:
    tasks = svc.tasks_all(s, project_id)
    today = svc.local_today()
    months = _months(today)
    members = svc.members_all(s)
    people = [person(m.id, tasks, today, months) for m in members]
    open_tasks = [t for t in tasks if t.status != DONE]
    dated = [t for t in tasks if t.due_date and t.due_date <= today]
    on_time_due = sum(1 for t in dated if _tracked(t) and _done_day(t) <= t.due_date)
    late_due = sum(1 for t in dated if _tracked(t) and _done_day(t) > t.due_date)
    return {
        "projectId": project_id,
        "today": today.isoformat(),
        "totals": {
            "open": len(open_tasks),
            "overdue": sum(1 for t in open_tasks if t.due_date and t.due_date < today),
            "paused": sum(1 for t in open_tasks if t.status == PAUSED),
            "testing": sum(1 for t in open_tasks if t.status == "pruebas"),
            "doneThisMonth": sum(p["counts"]["doneThisMonth"] for p in people),
            "done": sum(1 for t in tasks if t.status == DONE),
            "total": len(tasks),
            "dueSoFar": len(dated),
            "dueSoFarDone": sum(1 for t in dated if t.status == DONE),
            "onTimeDue": on_time_due,
            "lateDue": late_due,
        },
        "people": people,
        "weeks": progress(tasks, today, [m.id for m in members]),
    }
