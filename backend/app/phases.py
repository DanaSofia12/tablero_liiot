"""Fases de un proyecto: cada una con sus etapas, tareas, mínimos para avanzar y una rúbrica opcional.

Una fase está pendiente, en curso o completada. Pasar a la siguiente pide cumplir los mínimos (y, si la fase usa
rúbrica, que sus criterios indispensables se cumplan). Se puede avanzar sin cumplirlos dejando una nota que lo explique.
"""
from __future__ import annotations

from datetime import date

from sqlmodel import Session, select

from . import services as svc
from .catalog import DONE
from .models import Phase, PhaseCheck, Project, RubricCategory, RubricCriterion, RubricReview, Stage, Task

MAX_CHECKS = 30


def checks_of(s: Session, phase_id: int) -> list[PhaseCheck]:
    return list(s.exec(select(PhaseCheck).where(PhaseCheck.phase_id == phase_id).order_by(PhaseCheck.order, PhaseCheck.id)))


def check_out(c: PhaseCheck) -> dict:
    return {"id": c.id, "phaseId": c.phase_id, "text": c.text, "done": c.done, "doneBy": c.done_by, "doneAt": svc.iso_dt(c.done_at), "order": c.order}


def gate(s: Session, phase: Phase, tasks: list[Task] | None = None) -> dict:
    """Qué falta para pasar de fase, en palabras."""
    checks = checks_of(s, phase.id)
    tasks = tasks if tasks is not None else [t for t in svc.tasks_all(s, phase.project_id) if t.phase_id == phase.id]
    open_tasks = [t for t in tasks if t.status != DONE]
    missing: list[str] = [f"Falta: {c.text}" for c in checks if not c.done]
    rubric = None
    if phase.use_rubric:
        rubric = svc.verdict(svc.criteria_all(s, phase.id), phase.threshold)
        if rubric["total"] and rubric["blockingOk"] < rubric["blockingTotal"]:
            missing.append(f"La rúbrica: {rubric['blockingTotal'] - rubric['blockingOk']} criterios indispensables aún no se cumplen")
    if open_tasks:
        missing.append(f"{len(open_tasks)} tareas de esta fase siguen abiertas")
    must = [m for m in missing if not m.endswith("siguen abiertas")]  # las tareas abiertas avisan, pero no frenan
    return {
        "checksDone": sum(1 for c in checks if c.done),
        "checksTotal": len(checks),
        "tasksOpen": len(open_tasks),
        "tasksTotal": len(tasks),
        "tasksDone": len(tasks) - len(open_tasks),
        "rubric": rubric,
        "missing": missing,
        "ready": not must,
    }


def phase_out(s: Session, phase: Phase, tasks: list[Task] | None = None) -> dict:
    tasks = [t for t in (tasks if tasks is not None else svc.tasks_all(s, phase.project_id)) if t.phase_id == phase.id]
    stages = svc.stages_all(s, phase.project_id, phase.id)
    today = svc.local_today()
    stage_rows = []
    for st in stages:
        mine = [t for t in tasks if t.stage_id == st.id]
        stage_rows.append({
            **svc.stage_out(st),
            "tasksTotal": len(mine),
            "tasksDone": sum(1 for t in mine if t.status == DONE),
            "now": st.start <= today <= st.end,
            "past": st.end < today,
        })
    return {
        "id": phase.id,
        "projectId": phase.project_id,
        "order": phase.order,
        "key": phase.key,
        "name": phase.name,
        "goal": phase.goal,
        "status": phase.status,
        "start": svc.iso_d(phase.start),
        "end": svc.iso_d(phase.end),
        "useRubric": phase.use_rubric,
        "threshold": phase.threshold,
        "validatedAt": svc.iso_dt(phase.validated_at),
        "validatedBy": phase.validated_by,
        "validationNote": phase.validation_note,
        "checks": [check_out(c) for c in checks_of(s, phase.id)],
        "stages": stage_rows,
        "unstagedTasks": sum(1 for t in tasks if t.stage_id is None),
        "gate": gate(s, phase, tasks),
    }


def phases_out(s: Session, project: Project) -> dict:
    tasks = svc.tasks_all(s, project.id)
    current = svc.current_phase(s, project)
    return {
        "projectId": project.id,
        "currentPhaseId": current.id if current else None,
        "phases": [phase_out(s, ph, tasks) for ph in svc.phases_all(s, project.id)],
        "unphasedTasks": sum(1 for t in tasks if t.phase_id is None),
    }


def _dates(data: dict) -> tuple[date | None, date | None]:
    start, end = svc.parse_date(data.get("start")), svc.parse_date(data.get("end"))
    if start and end and end < start:
        raise ValueError("La fecha de fin no puede ser anterior al inicio.")
    return start, end


def create_phase(s: Session, project: Project, data: dict, actor: str) -> Phase:
    name = str(data.get("name") or "").strip()
    if not name:
        raise ValueError("La fase necesita un nombre, por ejemplo «Lanzamiento».")
    phases = svc.phases_all(s, project.id)
    if any(p.name.lower() == name.lower() for p in phases):
        raise ValueError(f"Ya hay una fase llamada «{name}».")
    start, end = _dates(data)
    keys = {p.key for p in phases}
    key, n = svc.phase_key(name), 2
    while key in keys:
        key, n = f"{svc.phase_key(name)}_{n}", n + 1
    phase = Phase(
        project_id=project.id,
        order=max((p.order for p in phases), default=-1) + 1,
        key=key,
        name=name,
        goal=str(data.get("goal") or "").strip(),
        status="pendiente" if any(p.status == "en_curso" for p in phases) else "en_curso",
        start=start,
        end=end,
        use_rubric=bool(data.get("useRubric")),
    )
    s.add(phase)
    s.flush()
    for i, text in enumerate(list(data.get("checks") or [])[:MAX_CHECKS]):
        clean = str(text or "").strip()
        if clean:
            s.add(PhaseCheck(phase_id=phase.id, order=i, text=clean[:240]))
    if data.get("useRubric") and data.get("basicRubric"):
        svc.add_basic_rubric(s, phase)
    if phase.status == "en_curso":
        project.current_phase_id = phase.id
        s.add(project)
    return phase


def update_phase(s: Session, phase: Phase, data: dict) -> None:
    if "name" in data:
        name = str(data["name"] or "").strip()
        if not name:
            raise ValueError("La fase necesita un nombre.")
        phase.name = name
    if "goal" in data:
        phase.goal = str(data["goal"] or "").strip()
    if "start" in data or "end" in data:
        start, end = _dates({"start": data.get("start", svc.iso_d(phase.start)), "end": data.get("end", svc.iso_d(phase.end))})
        phase.start, phase.end = start, end
    if "useRubric" in data:
        phase.use_rubric = bool(data["useRubric"])
    if "threshold" in data:
        phase.threshold = max(0, min(100, int(data["threshold"] or 80)))
    s.add(phase)


def delete_phase(s: Session, phase: Phase) -> None:
    if s.exec(select(Task).where(Task.phase_id == phase.id, Task.archived == False)).first():  # noqa: E712
        raise ValueError("Esta fase tiene tareas: muévelas a otra fase o archívalas antes de borrarla.")
    if s.exec(select(Stage).where(Stage.phase_id == phase.id)).first():
        raise ValueError("Esta fase tiene etapas: bórralas primero.")
    for c in checks_of(s, phase.id):
        s.delete(c)
    for cat in svc.categories_for(s, phase.id):
        for crit in s.exec(select(RubricCriterion).where(RubricCriterion.category_id == cat.id)):
            s.delete(crit)
        s.delete(cat)
    for review in s.exec(select(RubricReview).where(RubricReview.phase_id == phase.id)):
        s.delete(review)
    project = s.get(Project, phase.project_id)
    s.delete(phase)
    s.flush()
    if project and project.current_phase_id == phase.id:
        rest = svc.phases_all(s, project.id)
        nxt = next((p for p in rest if p.status != "completada"), None)
        project.current_phase_id = nxt.id if nxt else None
        if nxt and nxt.status == "pendiente":
            nxt.status = "en_curso"
            s.add(nxt)
        s.add(project)


def activate(s: Session, phase: Phase) -> None:
    """Marca esta fase como la actual: las anteriores quedan completadas y las siguientes pendientes."""
    project = s.get(Project, phase.project_id)
    for p in svc.phases_all(s, phase.project_id):
        if p.id == phase.id:
            p.status = "en_curso"
        elif p.order < phase.order:
            p.status = "completada"
        else:
            p.status = "pendiente"
        s.add(p)
    project.current_phase_id = phase.id
    s.add(project)


def advance(s: Session, phase: Phase, actor: str, note: str = "", force: bool = False) -> Phase | None:
    """Cierra la fase y abre la siguiente. Devuelve la nueva fase actual (o None si era la última)."""
    info = gate(s, phase)
    note = str(note or "").strip()
    if not info["ready"] and not force:
        raise ValueError("Todavía falta: " + "; ".join(m for m in info["missing"] if not m.endswith("siguen abiertas")) + ".")
    if not info["ready"] and not note:
        raise ValueError("Para pasar sin cumplir todo, deja una nota que explique por qué.")
    phase.status = "completada"
    phase.validated_at = svc.utcnow()
    phase.validated_by = actor
    phase.validation_note = note
    s.add(phase)
    project = s.get(Project, phase.project_id)
    following = [p for p in svc.phases_all(s, phase.project_id) if p.order > phase.order]
    nxt = following[0] if following else None
    if nxt:
        nxt.status = "en_curso"
        s.add(nxt)
    project.current_phase_id = nxt.id if nxt else phase.id
    s.add(project)
    return nxt


def move(s: Session, phase: Phase, direction: int) -> None:
    phases = svc.phases_all(s, phase.project_id)
    idx = next(i for i, p in enumerate(phases) if p.id == phase.id)
    other = idx + (1 if direction > 0 else -1)
    if not 0 <= other < len(phases):
        return
    phases[idx], phases[other] = phases[other], phases[idx]
    for order, p in enumerate(phases):
        p.order = order
        s.add(p)


# ---------------------------------------------------------------- mínimos
def add_check(s: Session, phase: Phase, text: str) -> PhaseCheck:
    clean = str(text or "").strip()
    if not clean:
        raise ValueError("Escribe qué se debe cumplir.")
    checks = checks_of(s, phase.id)
    if len(checks) >= MAX_CHECKS:
        raise ValueError(f"Una fase puede tener hasta {MAX_CHECKS} mínimos.")
    check = PhaseCheck(phase_id=phase.id, order=len(checks), text=clean[:240])
    s.add(check)
    return check


def update_check(s: Session, check: PhaseCheck, data: dict, actor: str) -> None:
    if "text" in data:
        clean = str(data["text"] or "").strip()
        if not clean:
            raise ValueError("El mínimo no puede quedar vacío.")
        check.text = clean[:240]
    if "done" in data and bool(data["done"]) != check.done:
        check.done = bool(data["done"])
        check.done_by = actor if check.done else None
        check.done_at = svc.utcnow() if check.done else None
    s.add(check)


# ---------------------------------------------------------------- rúbrica de la fase
def add_category(s: Session, phase: Phase, name: str) -> RubricCategory:
    clean = str(name or "").strip()
    if not clean:
        raise ValueError("El grupo de criterios necesita un nombre.")
    order = len(svc.categories_for(s, phase.id))
    category = RubricCategory(project_id=phase.project_id, phase_id=phase.id, order=order, name=clean[:120])
    s.add(category)
    if not phase.use_rubric:
        phase.use_rubric = True
        s.add(phase)
    return category


def add_criterion(s: Session, category: RubricCategory, data: dict) -> RubricCriterion:
    title = str(data.get("title") or "").strip()
    if not title:
        raise ValueError("El criterio necesita un texto.")
    order = len(list(s.exec(select(RubricCriterion).where(RubricCriterion.category_id == category.id))))
    criterion = RubricCriterion(category_id=category.id, code=svc.next_code(s, category.phase_id), title=title[:240],
                                verify=str(data.get("verify") or "").strip()[:240], blocking=bool(data.get("blocking")), order=order)
    s.add(criterion)
    return criterion


def delete_category(s: Session, category: RubricCategory) -> None:
    for crit in s.exec(select(RubricCriterion).where(RubricCriterion.category_id == category.id)):
        s.delete(crit)
    s.delete(category)


# ---------------------------------------------------------------- etapas
def create_stage(s: Session, project: Project, data: dict) -> Stage:
    name = str(data.get("name") or "").strip()
    start, end = svc.parse_date(data.get("start")), svc.parse_date(data.get("end"))
    if not name or not start or not end:
        raise ValueError("La etapa necesita nombre, inicio y fin.")
    if end < start:
        raise ValueError("La fecha de fin no puede ser anterior al inicio.")
    phase_id = data.get("phaseId")
    if phase_id in (None, ""):
        cur = svc.current_phase(s, project)
        phase_id = cur.id if cur else None
    else:
        phase = s.get(Phase, int(phase_id))
        if phase is None or phase.project_id != project.id:
            raise ValueError("Esa fase no es de este proyecto.")
        phase_id = phase.id
    order = len(svc.stages_all(s, project.id))
    stage = Stage(project_id=project.id, phase_id=phase_id, order=order, name=name[:160], start=start, end=end,
                  exit_criteria=str(data.get("exitCriteria") or "").strip())
    s.add(stage)
    return stage


def update_stage(s: Session, stage: Stage, data: dict) -> None:
    if "name" in data:
        stage.name = str(data["name"] or "").strip() or stage.name
    if "exitCriteria" in data:
        stage.exit_criteria = str(data["exitCriteria"] or "").strip()
    if "start" in data:
        stage.start = svc.parse_date(data["start"]) or stage.start
    if "end" in data:
        stage.end = svc.parse_date(data["end"]) or stage.end
    if stage.end < stage.start:
        raise ValueError("La fecha de fin no puede ser anterior al inicio.")
    if "phaseId" in data and data["phaseId"] not in (None, ""):
        phase = s.get(Phase, int(data["phaseId"]))
        if phase is None or phase.project_id != stage.project_id:
            raise ValueError("Esa fase no es de este proyecto.")
        stage.phase_id = phase.id
        for t in s.exec(select(Task).where(Task.stage_id == stage.id)):
            t.phase_id = phase.id
            s.add(t)
    s.add(stage)


def delete_stage(s: Session, stage: Stage) -> None:
    for t in s.exec(select(Task).where(Task.stage_id == stage.id)):
        t.stage_id = None
        s.add(t)
    s.delete(stage)
