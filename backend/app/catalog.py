"""Catálogos fijos: tipos de tarea, estados, prioridades y ajustes por defecto."""

TASK_TYPES = [
    {"id": "negocio", "label": "Negocio", "icon": "handshake", "color": "#E2B31C", "activity": "Habla por teléfono"},
    {"id": "desarrollo", "label": "Desarrollo", "icon": "code", "color": "#A66BF0", "activity": "Teclea en su laptop"},
    {"id": "diseno", "label": "Diseño", "icon": "palette", "color": "#F472B6", "activity": "Dibuja en su tableta"},
    {"id": "marketing", "label": "Marketing", "icon": "megaphone", "color": "#FF7A45", "activity": "Graba con el aro de luz"},
    {"id": "gestion", "label": "Gestión", "icon": "list-checks", "color": "#34D399", "activity": "Organiza notas en el tablero"},
    {"id": "calidad", "label": "Calidad", "icon": "shield-check", "color": "#60A5FA", "activity": "Revisa con lupa"},
    {"id": "legal", "label": "Legal", "icon": "scale", "color": "#B4A9C9", "activity": "Lee contratos"},
    {"id": "investigacion", "label": "Investigación", "icon": "book-open", "color": "#22D3EE", "activity": "Lee y toma notas"},
]
TYPE_BY_ID = {item["id"]: item for item in TASK_TYPES}

STATUSES = ["por_hacer", "en_progreso", "en_revision", "bloqueada", "hecha"]
STATUS_LABEL = {
    "por_hacer": "Por hacer",
    "en_progreso": "En progreso",
    "en_revision": "En revisión",
    "bloqueada": "Bloqueada",
    "hecha": "Hecha",
}
PRIORITIES = ["P0", "P1", "P2", "P3"]
PRIORITY_LABEL = {"P0": "Crítica", "P1": "Alta", "P2": "Media", "P3": "Baja"}
EFFORT_POINTS = {"S": 1, "M": 2, "L": 3}
CRITERION_STATES = ["pendiente", "cumple", "parcial", "no_cumple"]
PRESENCE_OVERRIDES = ["reunion", "foco", "fuera", "disponible"]
WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]

# weeklyDay usa la convención de Python: 0 = lunes … 5 = sábado, 6 = domingo.
DEFAULT_TELEGRAM = {
    "groupChatId": None,
    "groupTitle": None,
    "weeklyEnabled": True,
    "weeklyDay": 5,
    "weeklyTime": "18:00",
    "dueReminders": True,
    "dueTime": "09:00",
    "blockerAlerts": True,
    "groupWeeklySummary": True,
    "groupCelebrations": True,
    "groupBlockers": False,
    "ceoId": "dana",
    "maxDaily": 3,
}
