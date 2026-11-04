"""Catálogos fijos: tipos de tarea, estados, prioridades, estados de la oficina y ajustes por defecto."""

APP_NAME = "Liiot Hub"

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

STATUSES = ["pendiente", "en_progreso", "en_pausa", "pruebas", "finalizada"]
DONE = "finalizada"
PAUSED = "en_pausa"
STATUS_LABEL = {
    "pendiente": "Pendiente",
    "en_progreso": "En progreso",
    "en_pausa": "En pausa",
    "pruebas": "Pruebas",
    "finalizada": "Finalizada",
}
# Estados de versiones anteriores (y de otras herramientas) → estado actual
LEGACY_STATUS = {"por_hacer": "pendiente", "en_revision": "pruebas", "bloqueada": "en_pausa", "hecha": "finalizada"}

PRIORITIES = ["P0", "P1", "P2", "P3"]
PRIORITY_LABEL = {"P0": "Crítica", "P1": "Alta", "P2": "Media", "P3": "Baja"}
PRIORITY_COLOR = {"P0": "#F0445B", "P1": "#FF7A2F", "P2": "#F5B83D", "P3": "#3FBF8A"}
PRIORITY_WORDS = {"critica": "P0", "crítica": "P0", "alta": "P1", "media": "P2", "baja": "P3"}

CRITERION_STATES = ["pendiente", "cumple", "parcial", "no_cumple"]
PHASE_STATUSES = ["pendiente", "en_curso", "completada"]

# Lo que muestra la oficina: solo estos cuatro
PRESENCE_STATES = ["trabajando", "en_reunion", "disponible", "descansando"]
PRESENCE_LABEL = {"trabajando": "Trabajando", "en_reunion": "En reunión", "disponible": "Disponible", "descansando": "Descansando"}

WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]

# weeklyDay usa la convención de Python: 0 = lunes … 5 = sábado, 6 = domingo.
DEFAULT_TELEGRAM = {
    "groupChatId": None,
    "groupTitle": None,
    # Chat del equipo
    "groupNewTasks": True,
    "groupCelebrations": True,
    "groupTesting": True,
    "groupCountdown": True,
    "groupOverdue": True,
    "groupPhases": True,
    "groupBlockers": False,
    "groupWeeklySummary": True,
    "groupTime": "08:30",
    # Chat personal
    "dailyCheckin": True,
    "dueReminders": True,
    "dueTime": "09:00",
    "blockerAlerts": True,
    "maxDaily": 3,
    # Repaso semanal
    "weeklyEnabled": True,
    "weeklyDay": 5,
    "weeklyTime": "18:00",
    "ceoId": "dana",
}
