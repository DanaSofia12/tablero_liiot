"""Entiende lo que se le escribe al bot en lenguaje normal, sin IA de pago: reglas y comparación de textos.

Ejemplos que entiende: «¿qué tengo hoy?», «terminé la tabla de precios», «algo me frena con BLP-5 porque falta el logo»,
«mueve BLP-3 para el viernes», «nueva tarea: llamar a la tercera empresa el jueves», «¿cómo va el equipo?».
Todo son funciones puras (fáciles de probar); bot.py decide qué hacer con el resultado.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import date, timedelta
from difflib import SequenceMatcher

PUNCT = set("¿?¡!.,;:\"'«»()[]")
WEEKDAYS = {"lunes": 0, "martes": 1, "miercoles": 2, "jueves": 3, "viernes": 4, "sabado": 5, "domingo": 6}
MONTHS = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6, "julio": 7, "agosto": 8,
    "septiembre": 9, "setiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}
NUMBER_WORDS = {"un": 1, "una": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5, "seis": 6, "siete": 7, "ocho": 8, "diez": 10, "quince": 15}
STOPWORDS = {
    "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al", "a", "en", "con", "por", "para", "que", "y", "o",
    "mi", "mis", "tu", "su", "lo", "le", "les", "me", "ya", "esta", "este", "eso", "esa", "es", "se", "sobre", "como", "tarea",
    "tareas", "lista", "listo", "hecha", "hecho", "ahora", "todo", "toda", "porfa", "favor", "bueno",
}


def _rx(pattern: str) -> re.Pattern:
    """Los espacios del patrón aceptan uno o varios espacios del mensaje."""
    return re.compile(pattern.replace(" ", r"\s+"))


def fold(text: str) -> str:
    """Minúsculas, sin tildes ni signos (¿?¡!), con espacios simples."""
    plain, _ = fold_map(text)
    return re.sub(r"\s+", " ", plain).strip()


def fold_map(text: str) -> tuple[str, list[int]]:
    """Como fold pero sin juntar espacios, y con el índice del carácter original de cada letra (para recuperar tildes)."""
    out: list[str] = []
    index: list[int] = []
    for i, ch in enumerate(str(text or "")):
        base = " " if ch in PUNCT else unicodedata.normalize("NFKD", ch).encode("ascii", "ignore").decode().lower()
        for b in base:
            out.append(b)
            index.append(i)
    return "".join(out), index


def words(text: str) -> list[str]:
    return [w for w in fold(text).split() if len(w) > 2 and w not in STOPWORDS and not w.isdigit()]


@dataclass
class Intent:
    kind: str  # saludo, gracias, ayuda, hoy, semana, pendientes, equipo, resumen, silencio, nueva,
    #            hecha, empezar, revision, bloqueo, fecha, ver, desconocido
    phrase: str = ""  # palabras que describen la tarea (sin la orden ni la fecha)
    key: str | None = None  # clave explícita, p. ej. BLP-3
    day: date | None = None  # fecha mencionada
    title: str = ""  # título para crear una tarea (con sus tildes)
    reason: str = ""  # qué falta, en un bloqueo (con sus tildes)
    hours: int | None = None  # para silencio
    owner_id: str | None = None  # «para Juan David»
    project_id: str | None = None  # «en SST»


# ---------------------------------------------------------------- fechas
DAY_RULES = [
    (_rx(r"\bpasado manana\b"), lambda m, t: t + timedelta(days=2)),
    (_rx(r"\b(?:para |el |de )?manana\b"), lambda m, t: t + timedelta(days=1)),
    (_rx(r"\b(?:para |de )?hoy\b"), lambda m, t: t),
    (_rx(r"\b(?:en|dentro de) (\d+|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|diez|quince) (dias?|semanas?)\b"),
     lambda m, t: t + timedelta(days=_num(m.group(1)) * (7 if m.group(2).startswith("semana") else 1))),
    (_rx(r"\b(?:para )?(?:la )?(?:proxima semana|semana que viene|otra semana)\b"), lambda m, t: t + timedelta(days=(7 - t.weekday()) or 7)),
    (_rx(r"\b(?:para )?(?:el |este |el proximo |el otro )?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b"),
     lambda m, t: t + timedelta(days=((WEEKDAYS[m.group(1)] - t.weekday()) % 7) or 7)),
    (_rx(r"\b(\d{4})-(\d{2})-(\d{2})\b"), lambda m, t: date(int(m.group(1)), int(m.group(2)), int(m.group(3)))),
    (_rx(r"\b(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b"), lambda m, t: _dmy(int(m.group(1)), int(m.group(2)), m.group(3), t)),
    (_rx(r"\b(?:para )?(?:el )?(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b"),
     lambda m, t: _dmy(int(m.group(1)), MONTHS[m.group(2)], None, t)),
    (_rx(r"\b(?:para el|el) (\d{1,2})\b(?! (?:empresas?|creadores?|personas?|dias?|tareas?|de))"), lambda m, t: _day_of_month(int(m.group(1)), t)),
]


def find_day(folded: str, today: date) -> tuple[date | None, tuple[int, int] | None]:
    """Busca una fecha dicha en palabras dentro de un texto ya plegado. Devuelve (fecha, posición del fragmento)."""
    for pattern, build in DAY_RULES:
        m = pattern.search(folded)
        if not m:
            continue
        try:
            day = build(m, today)
        except (ValueError, KeyError):
            continue
        if day:
            return day, m.span()
    return None, None


def _num(token: str) -> int:
    return int(token) if token.isdigit() else NUMBER_WORDS.get(token, 1)


def _dmy(day: int, month: int, year: str | None, today: date) -> date:
    if year:
        y = int(year)
        return date(y + 2000 if y < 100 else y, month, day)
    candidate = date(today.year, month, day)
    return candidate if candidate >= today else date(today.year + 1, month, day)


def _day_of_month(day: int, today: date) -> date | None:
    if not 1 <= day <= 31:
        return None
    try:
        candidate = date(today.year, today.month, day)
        if candidate >= today:
            return candidate
    except ValueError:
        pass
    month, year = (today.month % 12) + 1, today.year + (1 if today.month == 12 else 0)
    try:
        return date(year, month, day)
    except ValueError:
        return None


# ---------------------------------------------------------------- intenciones
KEY_RE = re.compile(r"\b([a-z]{2,5})\s?-\s?(\d{1,4})\b", re.I)
GREETING = _rx(r"^\s*(?:hola+|holi|buenas|buen dia|buenos dias|buenas tardes|buenas noches|hey|que mas|que tal|como estas|saludos)\b")
THANKS = _rx(r"^\s*(?:mil )?(?:gracias|grax|genial|perfecto|super|listo|dale|chevere|bacano|de una|ok|okay|vale)\b")
# Acciones sobre una tarea (se revisan primero)
ACTIONS = [
    ("nueva", _rx(r"^\s*(?:por favor |porfa )?(?:crea(?:r|me)?|nueva|agrega(?:r|me)?|anota(?:r|me)?|apunta(?:r|me)?|recuerdame|recordarme|anade)\b"
                  r"(?: una| la)?(?: nueva)?(?: tarea)?(?: que| de)?(?P<rest>.*)$")),
    ("nueva", _rx(r"^\s*(?:tengo que|hay que|toca|necesitamos)\b(?P<rest>.+)$")),
    # «quedó lista para revisar» es revisión, no hecha: revisión va primero
    ("revision", _rx(r"\b(?:para revisar|a revision|en revision|revisen|para que la revisen|para que lo revisen)\b(?P<rest>.*)$")),
    ("hecha", _rx(r"\b(?:ya )?(?:termine|terminamos|acabe|acabamos|finalice|complete|entregue|ya hice|ya (?:esta|quedo) (?:lista|listo)|quedo (?:lista|listo))\b(?P<rest>.*)$")),
    ("bloqueo", _rx(r"\b(?:bloquead[oa]s?|trabad[oa]s?|atascad[oa]s?|me frena|algo me frena|me tiene frenad[oa]|no puedo avanzar|no puedo seguir|"
                    r"estoy esperando|necesito ayuda)\b(?P<rest>.*)$")),
    ("empezar", _rx(r"\b(?:ya )?(?:empece|empiezo|empezamos|arranque|arranco|comence|comienzo|estoy con|estoy haciendo|voy con|me pongo con|inicie)\b(?P<rest>.*)$")),
    ("fecha", _rx(r"\b(?:mueve(?:la|lo)?|mover|cambia(?:r)? (?:la )?fecha(?: de)?|aplaza(?:r|la|lo)?|pospon(?:er|la|lo)?|corre(?:r|la|lo)?|"
                  r"pasa(?:la|lo)? para|reprograma(?:r|la|lo)?|necesito mas tiempo(?: para| con)?)\b(?P<rest>.*)$")),
]
# Preguntas generales
INFO = [
    ("ayuda", _rx(r"\b(?:ayuda|que puedes hacer|como funciona|como te uso|comandos|que sabes hacer|como te hablo)\b")),
    ("silencio", _rx(r"\b(?:silencio|no me escribas|pausa|no molestes|callate)\b")),
    ("equipo", _rx(r"\b(?:equipo|los demas|como van todos|que estan haciendo|quien esta|en que anda)\b")),
    ("resumen", _rx(r"\b(?:resumen|como vamos|como va el proyecto|como va el piloto|como va el lanzamiento|avance|indicadores|estado del proyecto)\b")),
    ("semana", _rx(r"\b(?:semana|proximos dias|que viene)\b")),
    ("pendientes", _rx(r"\b(?:pendientes?|mis tareas|todo lo que tengo|que debo|abiertas|que me falta)\b")),
    ("hoy", _rx(r"\b(?:hoy|que tengo|que me toca|que hago|para hoy|mi dia)\b")),
    ("ver", _rx(r"\b(?:como va|como esta|como vamos con|estado de|que pasa con|muestrame|ver)\b(?P<rest>.*)$")),
]
REASON_RE = _rx(r"\b(porque|por que|pues|ya que|falta|necesito|esperando a|espero a)\b")


def understand(text: str, today: date, projects: dict[str, str] | None = None, people: list[tuple[str, str]] | None = None) -> Intent:
    """Traduce un mensaje a una intención.

    projects: {nombre plegado (minúsculas, sin tildes): id del proyecto}; people: [(alias plegado, id de persona)].
    """
    raw = str(text or "")
    f, index = fold_map(raw)
    if not f.strip():
        return Intent("desconocido")
    start = 0
    greeting = GREETING.match(f)
    if greeting:
        start = greeting.end()
        rest_words = f[start:].split()
        if not rest_words or (len(rest_words) <= 2 and not KEY_RE.search(f)):
            return Intent("saludo")
    key_match = KEY_RE.search(f, start)
    key = f"{key_match.group(1).upper()}-{key_match.group(2)}" if key_match else None

    for kind, pattern in ACTIONS:
        m = pattern.search(f, start)
        if not m:
            continue
        rest_from, rest_to = m.span("rest")
        intent = Intent(kind, key=key)
        if kind == "nueva":
            intent.title, intent.day, intent.owner_id, intent.project_id = _new_task(raw, f, index, rest_from, rest_to, today, projects or {}, people or [])
            return intent
        # La tarea puede nombrarse antes o después del verbo: «la tabla ya quedó lista» o «terminé la tabla»
        segment_from, segment_to = start, len(f)
        remove = [m.span(0)[0:1] + (rest_from,)]  # el verbo
        day, span = find_day(f[rest_from:rest_to], today)
        if span:
            intent.day = day
            remove.append((rest_from + span[0], rest_from + span[1]))
        if kind == "bloqueo":
            reason = REASON_RE.search(f, rest_from)
            if reason:
                keep_word = reason.group(1) in ("falta", "necesito", "esperando a", "espero a")
                cut = reason.start() if keep_word else reason.end()
                intent.reason = _original(raw, index, cut, len(f)).strip(" .:,;-")[:300]
                intent.reason = intent.reason[:1].upper() + intent.reason[1:]
                segment_to = reason.start()
        intent.phrase = _phrase(f, segment_from, segment_to, remove, key)
        return intent

    if THANKS.match(f, start) and len(f[start:].split()) <= 4:
        return Intent("gracias")
    if key and len(f[start:].split()) <= 3:
        return Intent("ver", key=key)
    for kind, pattern in INFO:
        m = pattern.search(f, start)
        if not m:
            continue
        if kind == "ver":
            phrase = m.group("rest").strip()
            if not phrase and not key:
                continue
            return Intent("ver", key=key, phrase=_phrase(f, m.start("rest"), len(f), [], key))
        if kind == "silencio":
            hours = re.search(r"(\d+)\s*(?:h|horas?)\b", f)
            return Intent("silencio", hours=int(hours.group(1)) if hours else 2)
        if kind == "resumen" and key:
            return Intent("ver", key=key)
        return Intent(kind)
    if key:
        return Intent("ver", key=key)
    return Intent("desconocido")


def _words_rx(text: str) -> str:
    """Nombre de varias palabras como patrón (cada palabra escapada; _rx vuelve flexibles los espacios)."""
    return " ".join(re.escape(w) for w in text.split())


def _original(raw: str, index: list[int], start: int, end: int) -> str:
    """Texto original (con tildes y mayúsculas) que corresponde a f[start:end]."""
    if start >= end or start >= len(index):
        return ""
    first, last = index[start], index[min(end, len(index)) - 1]
    return raw[first:last + 1]


def _phrase(f: str, start: int, end: int, remove: list[tuple[int, int]], key: str | None) -> str:
    chars = list(f[start:end])
    for a, b in remove:
        for i in range(max(a, start), min(b, end)):
            chars[i - start] = " "
    phrase = "".join(chars)
    if key:
        phrase = KEY_RE.sub(" ", phrase)
    return re.sub(r"\s+", " ", phrase).strip()


def _new_task(raw: str, f: str, index: list[int], start: int, end: int, today: date,
              projects: dict[str, str], people: list[tuple[str, str]]) -> tuple[str, date | None, str | None, str | None]:
    """Título (con tildes), fecha, responsable y proyecto de una tarea nueva dicha en una frase."""
    keep = [True] * len(f)
    segment = f[start:end]
    day, span = find_day(segment, today)
    if span:
        for i in range(start + span[0], start + span[1]):
            keep[i] = False
    owner_id = project_id = None
    for alias, member_id in sorted(people, key=lambda a: -len(a[0])):
        m = _rx(rf"\b(?:para|a|asignad[ao] a|que (?:lo|la) haga) {_words_rx(alias)}\b").search(segment)
        if m:
            owner_id = member_id
            for i in range(start + m.start(), start + m.end()):
                keep[i] = False
            break
    for name, pid in sorted(projects.items(), key=lambda p: -len(p[0])):
        m = _rx(rf"\b(?:en|para|de|del proyecto) {_words_rx(name)}\b").search(segment)
        if m:
            project_id = pid
            for i in range(start + m.start(), start + m.end()):
                keep[i] = False
            break
    kept = sorted({index[i] for i in range(start, end) if keep[i]})
    title = "".join(raw[i] for i in kept)
    title = re.sub(r"^\s*(?:que|de)\b", "", title.strip(), flags=re.I)
    title = re.sub(r"\s+", " ", title).strip(" -:,.;")
    return (title[:1].upper() + title[1:]) if title else "", day, owner_id, project_id


# ---------------------------------------------------------------- encontrar la tarea de la que se habla
def match_task(phrase: str, key: str | None, tasks: list, prefer_owner: str | None = None) -> tuple[object | None, list]:
    """Devuelve (tarea segura, candidatas). Si hay una clave, manda la clave; si no, compara palabras del título."""
    if key:
        exact = next((t for t in tasks if t.key.upper() == key.upper()), None)
        return exact, []
    wanted = words(phrase)
    if not wanted:
        return None, []
    scored = []
    for task in tasks:
        title_words = words(task.title)
        if not title_words:
            continue
        hits = sum(1 for w in wanted if any(t.startswith(w[:5]) or w.startswith(t[:5]) for t in title_words))
        cover = hits / len(wanted)
        ratio = SequenceMatcher(None, " ".join(wanted), " ".join(title_words)).ratio()
        bonus = 0.05 if prefer_owner and getattr(task, "owner_id", None) == prefer_owner else 0
        scored.append((0.75 * cover + 0.25 * ratio + bonus, task))
    if not scored:
        return None, []
    scored.sort(key=lambda s: -s[0])
    best_score, best = scored[0]
    second = scored[1][0] if len(scored) > 1 else 0
    if best_score >= 0.6 and best_score - second >= 0.12:
        return best, []
    return None, [t for s, t in scored[:3] if s >= 0.35]
