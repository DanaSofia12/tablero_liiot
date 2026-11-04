"""Cronograma en Excel: una tabla con todas las tareas, un diagrama de barras por días o semanas y un resumen."""
from __future__ import annotations

from datetime import date, timedelta
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from sqlmodel import Session

from . import services as svc
from .catalog import DONE, PRIORITY_LABEL, STATUS_LABEL
from .models import Project, Task

STATUS_FILL = {
    "pendiente": "B9B4C9",
    "en_progreso": "8B45CC",
    "en_pausa": "F0A93B",
    "pruebas": "3B82F6",
    "finalizada": "22A06B",
}
STATUS_SOFT = {
    "pendiente": "EFEDF5",
    "en_progreso": "EBDDF8",
    "en_pausa": "FDF0DA",
    "pruebas": "DCE8FD",
    "finalizada": "D9F2E6",
}
THIN = Side(style="thin", color="D9D4E5")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)


def _fill(hex_color: str) -> PatternFill:
    return PatternFill("solid", start_color=hex_color, end_color=hex_color)


def select_tasks(s: Session, project: Project, start: date | None, end: date | None, phase_id: int | None, stage_id: int | None,
                 owner: str | None) -> list[Task]:
    out = []
    for t in svc.tasks_all(s, project.id):
        if phase_id and t.phase_id != phase_id:
            continue
        if stage_id and t.stage_id != stage_id:
            continue
        if owner and t.owner_id != owner:
            continue
        if start or end:
            a = t.start_date or t.due_date
            b = t.due_date or t.start_date
            if not a or not b:
                continue
            if (end and min(a, b) > end) or (start and max(a, b) < start):
                continue
        out.append(t)
    return out


def build(s: Session, project: Project, start: date | None = None, end: date | None = None, phase_id: int | None = None,
          stage_id: int | None = None, owner: str | None = None) -> bytes:
    tasks = select_tasks(s, project, start, end, phase_id, stage_id, owner)
    phases = {p.id: p for p in svc.phases_all(s, project.id)}
    stages = {st.id: st for st in svc.stages_all(s, project.id)}
    names = svc.member_names(s)
    today = svc.local_today()
    brand = (project.color or "#8B45CC").lstrip("#").upper()[:6]
    tasks.sort(key=lambda t: (
        phases[t.phase_id].order if t.phase_id in phases else 999,
        stages[t.stage_id].start if t.stage_id in stages else date.max,
        t.start_date or t.due_date or date.max,
        t.id,
    ))
    dated = [t for t in tasks if t.start_date or t.due_date]
    lo = start or min((min(d for d in (t.start_date, t.due_date) if d) for t in dated), default=today)
    hi = end or max((max(d for d in (t.start_date, t.due_date) if d) for t in dated), default=today)
    if hi < lo:
        lo, hi = hi, lo

    wb = Workbook()
    ws = wb.active
    ws.title = "Cronograma"
    title = f"Cronograma · {project.name}"
    scope = f"Del {svc.fmt_date(lo)} al {svc.fmt_date(hi)}" if (start or end) else "Todo el proyecto"
    if phase_id and phase_id in phases:
        scope += f" · fase {phases[phase_id].name}"
    if stage_id and stage_id in stages:
        scope += f" · etapa {stages[stage_id].name}"
    if owner:
        scope += f" · {names.get(owner, owner)}"
    ws["A1"] = title
    ws["A1"].font = Font(size=16, bold=True, color=brand)
    ws["A2"] = f"{scope} · generado el {svc.fmt_date(today)} desde Liiot Hub"
    ws["A2"].font = Font(size=10, italic=True, color="6B6680")
    headers = ["Fase", "Etapa", "Tarea", "Descripción", "Responsable", "Estado", "Prioridad", "Inicio", "Vence", "Checklist", "Días de atraso"]
    widths = [20, 26, 44, 60, 16, 14, 12, 12, 12, 12, 14]
    for col, (head, width) in enumerate(zip(headers, widths), start=1):
        cell = ws.cell(row=4, column=col, value=head)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = _fill(brand)
        cell.alignment = Alignment(vertical="center")
        cell.border = BORDER
        ws.column_dimensions[get_column_letter(col)].width = width
    ws.row_dimensions[4].height = 22
    for row, t in enumerate(tasks, start=5):
        items = svc.checklist_of(t)
        late = (today - t.due_date).days if t.due_date and t.status != DONE and t.due_date < today else None
        values = [
            phases[t.phase_id].name if t.phase_id in phases else "Sin fase",
            stages[t.stage_id].name if t.stage_id in stages else "",
            t.title,
            t.summary,
            names.get(t.owner_id, t.owner_id),
            STATUS_LABEL.get(t.status, t.status),
            PRIORITY_LABEL.get(t.priority, t.priority),
            t.start_date,
            t.due_date,
            f"{sum(1 for i in items if i['done'])}/{len(items)}" if items else "",
            late,
        ]
        for col, value in enumerate(values, start=1):
            cell = ws.cell(row=row, column=col, value=value)
            cell.border = BORDER
            cell.alignment = Alignment(vertical="top", wrap_text=col in (3, 4))
            if col in (8, 9) and value:
                cell.number_format = "DD/MM/YYYY"
        ws.cell(row=row, column=6).fill = _fill(STATUS_SOFT.get(t.status, "FFFFFF"))
        if late:
            ws.cell(row=row, column=11).font = Font(bold=True, color="D6334F")
    ws.freeze_panes = "D5"
    if tasks:
        ws.auto_filter.ref = f"A4:{get_column_letter(len(headers))}{4 + len(tasks)}"

    _gantt(wb, tasks, lo, hi, today, names, phases, stages, project, brand)
    _summary(wb, tasks, today, names, phases, brand)
    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def _gantt(wb: Workbook, tasks: list[Task], lo: date, hi: date, today: date, names: dict, phases: dict, stages: dict,
           project: Project, brand: str) -> None:
    ws = wb.create_sheet("Diagrama")
    span = (hi - lo).days + 1
    weekly = span > 92
    if weekly:
        lo = lo - timedelta(days=lo.weekday())
        slots = [lo + timedelta(weeks=i) for i in range(((hi - lo).days // 7) + 1)]
    else:
        slots = [lo + timedelta(days=i) for i in range(span)]
    ws["A1"] = f"Diagrama · {project.name} ({'por semanas' if weekly else 'por días'})"
    ws["A1"].font = Font(size=14, bold=True, color=brand)
    ws.column_dimensions["A"].width = 44
    ws.column_dimensions["B"].width = 16
    ws.cell(row=3, column=1, value="Tarea").font = Font(bold=True)
    ws.cell(row=3, column=2, value="Responsable").font = Font(bold=True)
    first_col = 3
    month_start_col, current_month = first_col, None
    for i, day in enumerate(slots):
        col = first_col + i
        ws.column_dimensions[get_column_letter(col)].width = 4.2 if not weekly else 5.5
        label = svc.MONTHS_LONG[day.month - 1].capitalize() + f" {day.year}"
        if label != current_month:
            if current_month is not None and col - 1 > month_start_col:
                ws.merge_cells(start_row=2, start_column=month_start_col, end_row=2, end_column=col - 1)
            ws.cell(row=2, column=col, value=label).font = Font(bold=True, color=brand)
            current_month, month_start_col = label, col
        head = ws.cell(row=3, column=col, value=day.day)
        head.alignment = Alignment(horizontal="center")
        head.font = Font(size=9, bold=day == today or (weekly and day <= today < day + timedelta(days=7)))
        if not weekly and day.weekday() >= 5:
            head.fill = _fill("F1EEF7")
    last_col = first_col + len(slots) - 1
    if current_month is not None and last_col > month_start_col:
        ws.merge_cells(start_row=2, start_column=month_start_col, end_row=2, end_column=last_col)
    row = 4
    marks = []
    if project.pilot_date:
        marks.append((project.pilot_date, "Fecha clave"))
    if project.backup_date:
        marks.append((project.backup_date, "Respaldo"))
    if marks:
        ws.cell(row=row, column=1, value="Hitos").font = Font(bold=True, italic=True)
        for day, label in marks:
            idx = _slot(slots, day, weekly)
            if idx is not None:
                cell = ws.cell(row=row, column=first_col + idx, value="◆")
                cell.font = Font(bold=True, color="E04B66")
                cell.alignment = Alignment(horizontal="center")
                cell.comment = None
        row += 1
    current_group = None
    for t in tasks:
        group = (phases[t.phase_id].name if t.phase_id in phases else "Sin fase") + (f" · {stages[t.stage_id].name}" if t.stage_id in stages else "")
        if group != current_group:
            cell = ws.cell(row=row, column=1, value=group)
            cell.font = Font(bold=True, color="FFFFFF")
            for col in range(1, last_col + 1):
                ws.cell(row=row, column=col).fill = _fill("5A4D73")
            current_group = group
            row += 1
        ws.cell(row=row, column=1, value=t.title).alignment = Alignment(wrap_text=False)
        ws.cell(row=row, column=2, value=names.get(t.owner_id, t.owner_id))
        a = t.start_date or t.due_date
        b = t.due_date or t.start_date
        if a and b:
            a, b = min(a, b), max(a, b)
            for i, day in enumerate(slots):
                slot_end = day + timedelta(days=6) if weekly else day
                if day <= b and slot_end >= a:
                    cell = ws.cell(row=row, column=first_col + i)
                    late = t.status != DONE and t.due_date and t.due_date < today
                    cell.fill = _fill("E8435F" if late and day <= today else STATUS_FILL.get(t.status, "8B45CC"))
        today_idx = _slot(slots, today, weekly)
        if today_idx is not None:
            ws.cell(row=row, column=first_col + today_idx).border = Border(left=Side(style="medium", color="E04B66"))
        row += 1
    ws.freeze_panes = "C4"
    legend_row = row + 1
    ws.cell(row=legend_row, column=1, value="Colores: ").font = Font(bold=True)
    for i, (status, color) in enumerate(STATUS_FILL.items()):
        cell = ws.cell(row=legend_row + 1 + i, column=1, value=STATUS_LABEL[status])
        ws.cell(row=legend_row + 1 + i, column=2).fill = _fill(color)
        cell.font = Font(size=10)
    ws.cell(row=legend_row + 6, column=1, value="Atrasada").font = Font(size=10)
    ws.cell(row=legend_row + 6, column=2).fill = _fill("E8435F")


def _slot(slots: list[date], day: date, weekly: bool) -> int | None:
    for i, start in enumerate(slots):
        end = start + timedelta(days=6) if weekly else start
        if start <= day <= end:
            return i
    return None


def _summary(wb: Workbook, tasks: list[Task], today: date, names: dict, phases: dict, brand: str) -> None:
    ws = wb.create_sheet("Resumen")
    ws.column_dimensions["A"].width = 28
    for col in "BCDEFG":
        ws.column_dimensions[col].width = 14
    ws["A1"] = "Resumen"
    ws["A1"].font = Font(size=14, bold=True, color=brand)
    row = 3
    head = ["", *STATUS_LABEL.values(), "Atrasadas"]
    for title, key in (("Por persona", lambda t: names.get(t.owner_id, t.owner_id)),
                       ("Por fase", lambda t: phases[t.phase_id].name if t.phase_id in phases else "Sin fase")):
        ws.cell(row=row, column=1, value=title).font = Font(bold=True, size=12)
        row += 1
        for col, label in enumerate(head, start=1):
            cell = ws.cell(row=row, column=col, value=label)
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = _fill(brand)
        row += 1
        groups: dict[str, list[Task]] = {}
        for t in tasks:
            groups.setdefault(key(t), []).append(t)
        for name, items in groups.items():
            ws.cell(row=row, column=1, value=name)
            for col, status in enumerate(STATUS_LABEL, start=2):
                ws.cell(row=row, column=col, value=sum(1 for t in items if t.status == status))
            ws.cell(row=row, column=len(head), value=sum(1 for t in items if t.status != DONE and t.due_date and t.due_date < today))
            row += 1
        row += 1
