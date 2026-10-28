"""Bot de Telegram: seguimiento en privado, resumen en grupo y ritual semanal configurable.

Habla como alguien del equipo: frases cortas, cálidas y sin tecnicismos. Entiende mensajes normales
(«¿qué tengo hoy?», «terminé la tabla de precios», «mueve BLP-3 para el viernes») gracias a chat.py.
Funciona con long polling (no necesita dominio ni webhook). Si no hay token, el resto de HQ funciona igual.
"""
from __future__ import annotations

import html
import logging
from datetime import date, datetime, time, timedelta, timezone

from telegram import BotCommand, InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup, Update
from telegram.constants import ChatType, ParseMode
from telegram.error import TelegramError
from telegram.ext import Application, CallbackQueryHandler, CommandHandler, ContextTypes, MessageHandler, filters

from . import config
from .catalog import WEEKDAYS
from .chat import fold, match_task, understand
from .db import session_scope
from .models import Member, Project, Task
from .services import (
    TZ,
    add_checkin,
    add_comment,
    apply_patch,
    create_task,
    default_project_id,
    fmt_date,
    local_now,
    local_today,
    log_event,
    member_by_telegram,
    members_all,
    parse_hhmm,
    presence,
    project_metrics,
    projects_all,
    save_telegram_settings,
    task_by_key,
    task_sort_key,
    tasks_all,
    team_metrics,
    telegram_settings,
    utcnow,
)
from .vault import People

log = logging.getLogger("liiot.bot")

STATE: dict = {"app": None, "running": False, "username": None, "error": None}

COMMANDS = [
    ("hoy", "¿Qué tengo para hoy?"),
    ("semana", "Lo que vence esta semana"),
    ("pendientes", "Todas mis tareas abiertas"),
    ("estado", "Ver una tarea: /estado BLP-3 o unas palabras del título"),
    ("nueva", "Crear una tarea: /nueva Llamar a la empresa el jueves"),
    ("equipo", "¿En qué está cada quien?"),
    ("resumen", "¿Cómo vamos en los proyectos?"),
    ("silencio", "Pausar mis mensajes unas horas: /silencio 3"),
    ("vincular_grupo", "Usar este grupo para los resúmenes"),
    ("ayuda", "Cómo hablarme"),
]
STATUS_WORD = {"por_hacer": "por hacer", "en_progreso": "en curso", "en_revision": "esperando revisión", "bloqueada": "bloqueada", "hecha": "hecha"}
LOAD_WORD = {"verde": "tiene espacio", "amarillo": "va al límite", "rosa": "tiene más de lo que cabe"}
HEALTH_WORD = {"verde": "va bien 💚", "amarillo": "tiene cosas por mirar 💛", "rojo": "necesita atención ❤️‍🩹"}
PRESENCE_LABEL = {
    "trabajando": "está trabajando",
    "bloqueado": "tiene un bloqueo",
    "revision": "espera una revisión",
    "celebrando": "acaba de terminar algo 🎉",
    "disponible": "está disponible",
    "reunion": "está en reunión",
    "foco": "está en modo foco 🎧",
    "fuera": "está fuera de horario 🌙",
}
DECISION_TEXT = {
    "lanzar": "¡listos para lanzar! 🚀",
    "lanzar_con_riesgo": "se podría lanzar, aunque con algo de riesgo",
    "no_lanzar": "todavía faltan cosas para lanzar",
}
NOT_LINKED = "¡Hola! 👋 Aún no sé quién eres. Abre HQ › Seguimiento y toca tu enlace personal para conectarnos."
MAIN_KEYBOARD = ReplyKeyboardMarkup(
    [["☀️ ¿Qué tengo hoy?", "🗓️ Mi semana"], ["👥 ¿Cómo va el equipo?", "➕ Nueva tarea"]],
    resize_keyboard=True,
    is_persistent=True,
    input_field_placeholder="Escríbeme lo que necesites…",
)


def esc(value) -> str:
    return html.escape(str(value or ""), quote=False)


# ---------------------------------------------------------------- textos (funciones puras)
def due_text(t: Task, today: date) -> str:
    if not t.due_date:
        return "sin fecha"
    if t.status != "hecha" and t.due_date < today:
        days = (today - t.due_date).days
        return "venció ayer" if days == 1 else f"venció hace {days} días"
    if t.due_date == today:
        return "vence hoy"
    if t.due_date == today + timedelta(days=1):
        return "vence mañana"
    return f"vence el {fmt_date(t.due_date)}"


def priority_text(t: Task) -> str:
    return {"P0": " · 🔥 urgente", "P1": " · importante"}.get(t.priority, "")


def task_line(t: Task, names: dict[str, str], today: date, show_owner: bool = False) -> str:
    owner = f" · {esc(names.get(t.owner_id, t.owner_id))}" if show_owner else ""
    flag = "⛔ " if t.status == "bloqueada" else ""
    return f"• {flag}<b>{esc(t.title)}</b> — {due_text(t, today)}{priority_text(t)}{owner} <i>({t.key})</i>"


def task_card_text(t: Task, names: dict[str, str], today: date, intro: str = "") -> str:
    lines = [intro, ""] if intro else []
    lines.append(f"📌 <b>{esc(t.title)}</b> <i>({t.key})</i>")
    if t.status == "hecha":
        lines.append("Ya está hecha ✅")
    else:
        lines.append(f"Está {STATUS_WORD.get(t.status, t.status)} y {due_text(t, today)}{priority_text(t)}.")
    if t.status == "bloqueada" and t.blocker_reason:
        waiting = names.get(t.blocker_waiting_on or "", t.blocker_waiting_on or "")
        lines.append(f"⛔ Lo que falta: {esc(t.blocker_reason)}" + (f" (esperando a {esc(waiting)})" if waiting else ""))
    if t.status != "hecha":
        lines += ["", "¿Cómo vas con esta? 👇"]
    return "\n".join(lines)


def weekly_group_text(project: Project, metrics: dict, team: list[dict], tasks: list[Task], names: dict[str, str], today: date,
                      ritual: bool = False) -> str:
    v = metrics["verdict"]
    week_ahead = today + timedelta(days=7)
    lines = [f"🗓️ <b>Así vamos en {esc(project.name)}</b>", ""]
    days = metrics.get("daysToPilot")
    if days is not None and days >= 0:
        milestone = "el piloto" if project.id == config.DEFAULT_PROJECT else "la entrega"
        when = f"Faltan {days} días para {milestone}" if days > 1 else (f"¡Mañana es {milestone}!" if days == 1 else f"¡Hoy es {milestone}!")
        lines.append(when + (f": {DECISION_TEXT[v['decision']]}" if v["blockingTotal"] else "."))
    lines.append(f"✅ Esta semana se terminaron {metrics['doneThisWeek']} tareas (van {metrics['tasksDone']} de {metrics['tasksTotal']}).")
    if metrics["overdue"]:
        lines.append(f"⏰ {metrics['overdue']} se pasaron de fecha.")
    blocked = [t for t in tasks if t.status == "bloqueada"]
    if blocked:
        lines += ["", "<b>Bloqueos para destrabar</b>"]
        for t in blocked[:5]:
            lines.append(f"• {esc(names.get(t.owner_id))}: <b>{esc(t.title)}</b> — {esc(t.blocker_reason)}")
    lines += ["", "<b>Lo que viene en los próximos 7 días</b>"]
    for w in team:
        mine = sorted(
            [t for t in tasks if t.owner_id == w["memberId"] and t.status != "hecha" and t.due_date and t.due_date <= week_ahead],
            key=task_sort_key,
        )
        who = f"<b>{esc(names.get(w['memberId']))}</b>"
        if mine:
            more = f" y {len(mine) - 3} más" if len(mine) > 3 else ""
            lines.append(f"{who}: " + ", ".join(esc(t.title) for t in mine[:3]) + more)
        else:
            lines.append(f"{who}: nada vence esta semana 🙌")
    if ritual:
        closing = "¡Buen fin de semana, equipo! 💜" if today.weekday() >= 4 else "¡Buena semana, equipo! 💜"
        lines += ["", f"Les escribo por privado para que me cuenten cómo van. {closing}"]
    return "\n".join(lines)


def ceo_text(metrics: dict, tasks: list[Task], names: dict[str, str], today: date, ceo_name: str = "Dana") -> str:
    v = metrics["verdict"]
    overdue = sorted([t for t in tasks if t.status != "hecha" and t.due_date and t.due_date < today], key=task_sort_key)
    review = [t for t in tasks if t.status == "en_revision"]
    lines = [f"🧭 <b>Tu resumen, {esc(ceo_name)}</b>", "", f"El proyecto principal {HEALTH_WORD.get(metrics['health'], metrics['health'])}."]
    lines.extend(f"• {esc(reason)}" for reason in metrics.get("healthReasons", [])[:3])
    if v["blockingTotal"]:
        lines.append(f"Lanzamiento: {v['blockingOk']} de {v['blockingTotal']} criterios bloqueantes listos.")
    if review:
        lines += ["", "<b>Esperan tu visto bueno</b>"]
        lines.extend(task_line(t, names, today, show_owner=True) for t in review[:5])
    if overdue:
        lines += ["", "<b>Se pasaron de fecha</b>"]
        lines.extend(task_line(t, names, today, show_owner=True) for t in overdue[:6])
    if not review and not overdue:
        lines += ["", "Nada urgente por ahora ✨"]
    return "\n".join(lines)


def help_text() -> str:
    return "\n".join([
        "🤖 <b>Puedes escribirme normal</b>, como a alguien del equipo. Por ejemplo:",
        "",
        "• «¿Qué tengo hoy?» o «¿qué tengo esta semana?»",
        "• «Terminé la tabla de precios»",
        "• «Empecé el diagrama de flujo»",
        "• «Algo me frena con BLP-5 porque falta el logo»",
        "• «Mueve BLP-3 para el viernes»",
        "• «Nueva tarea: llamar a la tercera empresa el jueves»",
        "• «¿Cómo va el equipo?» o «¿cómo vamos?»",
        "",
        "Cuando te pregunte por una tarea, también puedes contestar con los botones.",
        "Si prefieres comandos: /hoy /semana /pendientes /equipo /resumen /nueva /silencio",
    ])


def greeting_text(name: str) -> str:
    return (f"¡Hola, {esc(name)}! 👋 ¿En qué te ayudo?\n\n"
            "Escríbeme como a alguien del equipo, por ejemplo «¿qué tengo hoy?» o «terminé la tabla de precios». "
            "Abajo tienes botones para lo más común.")


def fallback_text() -> str:
    return ("Mmm, no estoy seguro de haberte entendido 🤔\n\nPuedes decirme cosas como:\n"
            "• «¿Qué tengo hoy?»\n• «Terminé la tabla de precios»\n• «Mueve BLP-3 para el viernes»\n"
            "• «Nueva tarea: llamar a la tercera empresa»\n\nO escribe /ayuda para ver todo lo que sé hacer.")


# ---------------------------------------------------------------- teclados
def task_keyboard(task_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("✅ Ya la terminé", callback_data=f"t:done:{task_id}"),
         InlineKeyboardButton("▶️ La estoy haciendo", callback_data=f"t:go:{task_id}")],
        [InlineKeyboardButton("👍 Va bien", callback_data=f"t:ok:{task_id}"),
         InlineKeyboardButton("📅 Otra fecha", callback_data=f"t:dt:{task_id}")],
        [InlineKeyboardButton("⛔ Algo me frena", callback_data=f"t:blk:{task_id}"),
         InlineKeyboardButton("💬 Comentar", callback_data=f"t:cm:{task_id}")],
    ])


def undo_keyboard(task_id: int, previous: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[InlineKeyboardButton("↩️ Deshacer", callback_data=f"t:undo:{task_id}:{previous}")]])


def date_options(today: date) -> list[tuple[str, date]]:
    friday = today + timedelta(days=(4 - today.weekday()) % 7 or 7)
    monday = today + timedelta(days=(0 - today.weekday()) % 7 or 7)
    return [
        ("Mañana", today + timedelta(days=1)),
        ("Pasado mañana", today + timedelta(days=2)),
        (f"El viernes {friday.day}", friday),
        (f"El lunes {monday.day}", monday),
        ("En una semana", today + timedelta(days=7)),
    ]


def _short(title: str, limit: int = 48) -> str:
    return title if len(title) <= limit else title[: limit - 1] + "…"


# ---------------------------------------------------------------- envío
async def send(chat_id: int | None, text: str, keyboard: InlineKeyboardMarkup | None = None) -> bool:
    app = STATE["app"]
    if not app or chat_id is None:
        return False
    try:
        await app.bot.send_message(chat_id=chat_id, text=text, parse_mode=ParseMode.HTML, reply_markup=keyboard,
                                   disable_web_page_preview=True)
        return True
    except TelegramError as exc:
        log.warning("No se pudo enviar a %s: %s", chat_id, exc)
        return False


def _quiet(m: Member) -> bool:
    return bool(m.quiet_until and m.quiet_until > utcnow())


async def _notify_changed(scope: str) -> None:
    from .realtime import notify

    await notify(scope)


async def _after_patch(task: Task, info: dict, actor: str) -> None:
    from .hooks import task_changed

    await task_changed(task.id, info, actor, "telegram", owner_id=task.owner_id, task_key=task.key)


async def _reply(update: Update, text: str, keyboard=None) -> None:
    await update.effective_message.reply_text(text, parse_mode=ParseMode.HTML, reply_markup=keyboard, disable_web_page_preview=True)


# ---------------------------------------------------------------- comandos
async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    chat = update.effective_chat
    if chat.type != ChatType.PRIVATE:
        await update.message.reply_text("¡Hola! 😊 Escríbeme por privado para conectar tu cuenta. Aquí en el grupo usa /vincular_grupo.")
        return
    code = (context.args[0] if context.args else "").strip()
    with session_scope() as s:
        current = member_by_telegram(s, user.id)
        if code:
            member = next((m for m in members_all(s) if m.link_code == code), None)
            if member is None:
                await update.message.reply_text("Ese enlace no corresponde a nadie del equipo 🤔 Cópialo de nuevo desde HQ › Seguimiento.")
                return
            if current and current.id != member.id:
                current.telegram_chat_id = None
                s.add(current)
            member.telegram_chat_id = user.id
            member.telegram_username = user.username
            s.add(member)
            s.commit()
            name, first_time = member.name, True
        elif current:
            name, first_time = current.name, False
        else:
            await update.message.reply_text(NOT_LINKED)
            return
    await _notify_changed("members")
    if first_time:
        text = (f"¡Hola, {esc(name)}! 💜 Ya estamos conectados.\n\n"
                "Desde ahora te aviso cuando algo tuyo esté por vencer y puedes escribirme normal, "
                "por ejemplo «¿qué tengo hoy?». Abajo te dejé botones para lo más común.")
    else:
        text = greeting_text(name)
    await _reply(update, text, MAIN_KEYBOARD)


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    private = update.effective_chat.type == ChatType.PRIVATE
    await _reply(update, help_text(), MAIN_KEYBOARD if private else None)


async def cmd_link_group(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat = update.effective_chat
    if chat.type not in (ChatType.GROUP, ChatType.SUPERGROUP):
        await update.message.reply_text("Este comando se usa dentro del grupo del equipo 😊")
        return
    with session_scope() as s:
        if member_by_telegram(s, update.effective_user.id) is None:
            await update.message.reply_text("Para conectar el grupo, primero alguien del equipo debe vincular su cuenta conmigo por privado.")
            return
        cfg = save_telegram_settings(s, {"groupChatId": chat.id, "groupTitle": chat.title})
        s.commit()
    await _notify_changed("settings")
    day = WEEKDAYS[cfg["weeklyDay"]].lower()
    await update.message.reply_text(f"¡Listo! 🙌 Aquí les mandaré el resumen los {day} a las {cfg['weeklyTime']}, "
                                    "y también celebraremos lo que se vaya terminando 🎉")


async def _member_or_warn(update: Update) -> Member | None:
    with session_scope() as s:
        member = member_by_telegram(s, update.effective_user.id)
    if member is None:
        await update.effective_message.reply_text(NOT_LINKED)
    return member


LISTS = {
    "hoy": ("☀️", "Esto es lo tuyo para hoy", "Hoy no tienes nada pendiente ✨",
            lambda t, d: t.status in ("en_progreso", "bloqueada") or (t.due_date is not None and t.due_date <= d)),
    "semana": ("🗓️", "Lo que vence en los próximos 7 días", "Esta semana no vence nada tuyo 🙌",
               lambda t, d: t.due_date is not None and t.due_date <= d + timedelta(days=7)),
    "pendientes": ("📋", "Todas tus tareas abiertas", "No tienes tareas abiertas. ¡Todo al día! ✨", lambda t, d: True),
}


async def _list_for(update: Update, member: Member, kind: str) -> None:
    emoji, title, empty, predicate = LISTS[kind]
    today = local_today()
    with session_scope() as s:
        names = {m.id: m.name for m in members_all(s)}
        mine = sorted([t for t in tasks_all(s) if t.owner_id == member.id and t.status != "hecha" and predicate(t, today)], key=task_sort_key)
    if not mine:
        await _reply(update, empty)
        return
    lines = [f"{emoji} <b>{title}, {esc(member.name)}</b>", ""]
    lines.extend(task_line(t, names, today) for t in mine[:12])
    if len(mine) > 12:
        lines.append(f"… y {len(mine) - 12} más (las ves todas en HQ).")
    lines += ["", "Si ya terminaste alguna, dime «terminé …» 😉"]
    await _reply(update, "\n".join(lines))


async def cmd_today(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    member = await _member_or_warn(update)
    if member:
        await _list_for(update, member, "hoy")


async def cmd_week(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    member = await _member_or_warn(update)
    if member:
        await _list_for(update, member, "semana")


async def cmd_pending(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    member = await _member_or_warn(update)
    if member:
        await _list_for(update, member, "pendientes")


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    member = await _member_or_warn(update)
    if member is None:
        return
    query = " ".join(context.args).strip()
    if not query:
        await _reply(update, "¿Cuál tarea quieres ver? Escríbeme su clave o unas palabras del título, por ejemplo /estado BLP-3")
        return
    intent = _understand(query)
    intent.kind = "ver"
    if not intent.key and not intent.phrase:
        intent.phrase = query
    await _task_action(update, context, member, intent)


async def cmd_new(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    member = await _member_or_warn(update)
    if member is None:
        return
    text = " ".join(context.args).strip()
    if not text:
        context.user_data["await"] = {"kind": "new"}
        await _reply(update, "¿Qué tarea creo? Escríbela en una frase, por ejemplo «Llamar a la tercera empresa el jueves» 🙂")
        return
    intent = _understand("nueva tarea " + text)
    await _create(update, member, intent.title or text, intent.day, intent.owner_id, intent.project_id)


async def cmd_team(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if await _member_or_warn(update) is None:
        return
    await _send_team(update)


async def _send_team(update: Update) -> None:
    with session_scope() as s:
        names = {m.id: m.name for m in members_all(s)}
        pres = presence(s)
        load = {w["memberId"]: w for w in team_metrics(s)}
    lines = ["👥 <b>Así está el equipo ahora</b>", ""]
    for p in pres:
        task = p["task"]
        doing = f" en «{esc(task['title'])}»" if task and p["state"] in ("trabajando", "foco", "bloqueado", "revision") else ""
        zone = load.get(p["memberId"], {}).get("zone", "verde")
        lines.append(f"• <b>{esc(names[p['memberId']])}</b> {PRESENCE_LABEL.get(p['state'], p['state'])}{doing} · {LOAD_WORD[zone]}")
    await _reply(update, "\n".join(lines))


async def cmd_summary(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if await _member_or_warn(update) is None:
        return
    await _send_summary(update)


async def _send_summary(update: Update) -> None:
    with session_scope() as s:
        texts = project_summaries(s, local_today())
    for text in texts or ["Por ahora no hay proyectos con tareas abiertas ✨"]:
        await _reply(update, text)


def project_summaries(s, today: date, ritual: bool = False) -> list[str]:
    """Un resumen por proyecto con tareas abiertas (el principal primero)."""
    names = {m.id: m.name for m in members_all(s)}
    team = team_metrics(s)
    main = default_project_id(s)
    texts = []
    for project in sorted(projects_all(s), key=lambda p: (p.id != main, p.order)):
        tasks = tasks_all(s, project.id)
        if not any(t.status != "hecha" for t in tasks):
            continue
        texts.append(weekly_group_text(project, project_metrics(s, project.id), team, tasks, names, today, ritual=ritual))
    return texts


async def cmd_quiet(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    member = await _member_or_warn(update)
    if member is None:
        return
    try:
        hours = max(0, min(72, int(context.args[0]))) if context.args else 2
    except ValueError:
        hours = 2
    await _set_quiet(update, member, hours)


async def _set_quiet(update: Update, member: Member, hours: int | None) -> None:
    hours = max(0, min(72, hours if hours is not None else 2))
    with session_scope() as s:
        m = s.get(Member, member.id)
        m.quiet_until = utcnow() + timedelta(hours=hours) if hours else None
        s.add(m)
        s.commit()
    if hours:
        await _reply(update, f"Listo 🤫 No te escribo durante {hours} horas. Si me necesitas, aquí estoy.")
    else:
        await _reply(update, "¡De vuelta! Ya puedo escribirte otra vez 😊")


# ---------------------------------------------------------------- entender mensajes normales
def _understand(text: str):
    with session_scope() as s:
        projects = {fold(p.name): p.id for p in projects_all(s)}
        people = People(members_all(s)).aliases
    return understand(text, local_today(), projects, people)


async def _create(update: Update, member: Member, title: str, day: date | None, owner_id: str | None, project_id: str | None) -> None:
    with session_scope() as s:
        project = s.get(Project, project_id or default_project_id(s))
        owner = s.get(Member, owner_id) if owner_id else member
        task = create_task(s, {"title": title, "ownerId": owner.id, "dueDate": day.isoformat() if day else None, "projectId": project.id},
                           member.id, source="telegram")
        s.commit()
        snapshot = s.get(Task, task.id)
        owner_name, project_name = owner.name, project.name
    parts = [f"¡Listo! ✨ Creé <b>{esc(title)}</b>"]
    if owner_id and owner_id != member.id:
        parts.append(f" para {esc(owner_name)}")
    parts.append(f" en {esc(project_name)}")
    parts.append(f", vence el {fmt_date(day)}." if day else ". ¿Le ponemos fecha? 👇")
    await _reply(update, "".join(parts), task_keyboard(snapshot.id))
    await _after_patch(snapshot, {"changed": True, "reassigned": bool(owner_id and owner_id != member.id)}, member.id)


ACTION_PATCH = {
    "hecha": ({"status": "hecha"}, "¡Excelente! 🎉 Marqué <b>{title}</b> como hecha."),
    "empezar": ({"status": "en_progreso"}, "¡Vamos! ▶️ <b>{title}</b> quedó en curso."),
    "revision": ({"status": "en_revision"}, "👀 Listo, <b>{title}</b> quedó esperando revisión."),
}


def _callback_for(kind: str, task_id: int, day: date | None) -> str:
    if kind == "fecha":
        return f"t:dts:{task_id}:{day.strftime('%Y%m%d')}" if day else f"t:dt:{task_id}"
    return {"hecha": "t:done", "empezar": "t:go", "revision": "t:rev", "bloqueo": "t:blk"}.get(kind, "t:card") + f":{task_id}"


async def _task_action(update: Update, context: ContextTypes.DEFAULT_TYPE, member: Member, intent) -> None:
    today = local_today()
    with session_scope() as s:
        names = {m.id: m.name for m in members_all(s)}
        pool = tasks_all(s) if intent.kind == "ver" else [t for t in tasks_all(s) if t.status != "hecha"]
        task, candidates = match_task(intent.phrase, intent.key, pool, prefer_owner=member.id)
        if task is None and intent.key:
            task = task_by_key(s, intent.key)
    if task is None and not candidates:
        await _reply(update, "No encontré esa tarea 🤔 ¿Me dices unas palabras del título o su clave (como BLP-3)? "
                             "Con /pendientes ves todas las tuyas.")
        return
    if intent.kind == "bloqueo" and intent.reason:
        context.user_data["reason_hint"] = intent.reason
    if task is None:
        rows = [[InlineKeyboardButton(_short(t.title), callback_data=_callback_for(intent.kind, t.id, intent.day))] for t in candidates]
        await _reply(update, "Encontré varias parecidas, ¿cuál es? 👇", InlineKeyboardMarkup(rows))
        return

    if intent.kind == "ver":
        await _reply(update, task_card_text(task, names, today), task_keyboard(task.id))
    elif intent.kind in ACTION_PATCH:
        patch, message = ACTION_PATCH[intent.kind]
        previous, snapshot, info = _patch(task.id, patch, member)
        keyboard = undo_keyboard(task.id, previous) if intent.kind == "hecha" else None
        await _reply(update, message.format(title=esc(snapshot.title)), keyboard)
        await _after_patch(snapshot, info, member.id)
    elif intent.kind == "bloqueo" and intent.reason:
        context.user_data.pop("reason_hint", None)
        _, snapshot, info = _patch(task.id, {"status": "bloqueada", "blockerReason": intent.reason}, member)
        await _reply(update, f"Gracias por contarme 🙏 Dejé <b>{esc(snapshot.title)}</b> como bloqueada («{esc(intent.reason)}») "
                             "y ya avisé a quien corresponde. Te escribo apenas se destrabe.")
        await _after_patch(snapshot, info, member.id)
    elif intent.kind == "bloqueo":
        await _reply(update, *_blocker_question(task, member))
    elif intent.kind == "fecha" and intent.day:
        _, snapshot, info = _patch(task.id, {"dueDate": intent.day}, member)
        await _reply(update, f"Listo 📅 <b>{esc(snapshot.title)}</b> ahora vence el {fmt_date(intent.day)}.")
        await _after_patch(snapshot, info, member.id)
    else:
        await _reply(update, *_date_question(task, today))


def _patch(task_id: int, patch: dict, member: Member) -> tuple[str, Task, dict]:
    with session_scope() as s:
        task = s.get(Task, task_id)
        previous = task.status
        info = apply_patch(s, task, patch, member.id, "telegram")
        add_checkin(s, member_id=member.id, task_id=task.id, kind="respuesta", text=f"{task.key}: {STATUS_WORD.get(task.status, task.status)}",
                    answer=STATUS_WORD.get(task.status, task.status))
        s.commit()
        return previous, s.get(Task, task_id), info


def _blocker_question(task: Task, member: Member) -> tuple[str, InlineKeyboardMarkup]:
    with session_scope() as s:
        others = [m for m in members_all(s) if m.id != member.id]
    rows = [[InlineKeyboardButton(m.name, callback_data=f"t:who:{task.id}:{m.id}") for m in others]]
    rows.append([InlineKeyboardButton("Alguien de afuera", callback_data=f"t:who:{task.id}:externo"),
                 InlineKeyboardButton("Un tema técnico", callback_data=f"t:who:{task.id}:tecnico")])
    return f"Uy 😕 ¿qué te frena con <b>{esc(task.title)}</b>? Primero dime a quién o qué estás esperando:", InlineKeyboardMarkup(rows)


def _date_question(task: Task, today: date) -> tuple[str, InlineKeyboardMarkup]:
    rows = [[InlineKeyboardButton(label, callback_data=f"t:dts:{task.id}:{day.strftime('%Y%m%d')}")] for label, day in date_options(today)]
    current = f"Hoy {due_text(task, today)}." if task.due_date else "Todavía no tiene fecha."
    return f"📅 ¿Para cuándo dejamos <b>{esc(task.title)}</b>? {current}", InlineKeyboardMarkup(rows)


# ---------------------------------------------------------------- botones y texto libre
async def on_button(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    parts = (query.data or "").split(":")
    if len(parts) < 3:
        return
    action, task_id = parts[1], int(parts[2])
    today = local_today()
    with session_scope() as s:
        member = member_by_telegram(s, query.from_user.id)
        if member is None:
            await query.message.reply_text(NOT_LINKED)
            return
        task = s.get(Task, task_id)
        if task is None:
            await query.message.reply_text("Esa tarea ya no existe 🤔")
            return
        names = {m.id: m.name for m in members_all(s)}
        title = esc(task.title)
        reply, keyboard, info = "", None, None

        if action == "ok":
            add_checkin(s, member_id=member.id, task_id=task.id, kind="respuesta", text=f"{task.key}: va bien", answer="va bien")
            log_event(s, task.id, member.id, "telegram", "checkin", "Contó que va bien")
            reply = f"¡Genial! Anoté que <b>{title}</b> va bien 👍"
        elif action == "done":
            previous = task.status
            info = apply_patch(s, task, {"status": "hecha"}, member.id, "telegram")
            add_checkin(s, member_id=member.id, task_id=task.id, kind="respuesta", text=f"{task.key}: terminada", answer="terminé")
            reply, keyboard = f"¡Excelente! 🎉 <b>{title}</b> quedó hecha.", undo_keyboard(task.id, previous)
        elif action == "go":
            info = apply_patch(s, task, {"status": "en_progreso"}, member.id, "telegram")
            reply = f"¡Vamos! ▶️ <b>{title}</b> quedó en curso."
        elif action == "rev":
            info = apply_patch(s, task, {"status": "en_revision"}, member.id, "telegram")
            reply = f"👀 Listo, <b>{title}</b> quedó esperando revisión."
        elif action == "undo" and len(parts) >= 4:
            info = apply_patch(s, task, {"status": parts[3]}, member.id, "telegram")
            reply = f"↩️ Listo, dejé <b>{title}</b> como estaba ({STATUS_WORD.get(parts[3], parts[3])})."
        elif action == "card":
            reply, keyboard = task_card_text(task, names, today), task_keyboard(task.id)
        elif action == "blk":
            reply, keyboard = _blocker_question(task, member)
        elif action == "who" and len(parts) >= 4:
            hint = context.user_data.pop("reason_hint", None)
            waiting = parts[3] if parts[3] in names else ("Alguien externo" if parts[3] == "externo" else "Tema técnico")
            if hint:
                info = apply_patch(s, task, {"status": "bloqueada", "blockerReason": hint, "blockerWaitingOn": waiting}, member.id, "telegram")
                reply = f"Gracias por contarme 🙏 Dejé <b>{title}</b> como bloqueada y ya avisé a quien corresponde."
            else:
                context.user_data["await"] = {"kind": "reason", "task": task.id, "who": parts[3]}
                reply = "Gracias. Ahora cuéntame en una frase qué falta para seguir, así le aviso a quien corresponde."
        elif action == "dt":
            reply, keyboard = _date_question(task, today)
        elif action == "dts" and len(parts) >= 4:
            new_due = datetime.strptime(parts[3], "%Y%m%d").date()
            info = apply_patch(s, task, {"dueDate": new_due}, member.id, "telegram")
            reply = f"Listo 📅 <b>{title}</b> ahora vence el {fmt_date(new_due)}."
        elif action == "cm":
            context.user_data["await"] = {"kind": "comment", "task": task.id}
            reply = f"💬 Escribe tu comentario y lo guardo en <b>{title}</b>."
        s.commit()
        snapshot = s.get(Task, task_id)

    if action in ("ok", "done", "go", "rev", "dts", "who", "undo"):
        try:
            await query.edit_message_reply_markup(reply_markup=None)
        except TelegramError:
            pass
    if reply:
        await query.message.reply_text(reply, parse_mode=ParseMode.HTML, reply_markup=keyboard)
    if info is not None:
        await _after_patch(snapshot, info, member.id)
    elif action == "ok":
        await _notify_changed("checkins")


async def on_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = (update.message.text or "").strip()
    pending = context.user_data.pop("await", None)
    with session_scope() as s:
        member = member_by_telegram(s, update.effective_user.id)
    if member is None:
        await update.message.reply_text(NOT_LINKED)
        return
    if pending:
        await _answer_pending(update, member, pending, text)
        return

    intent = _understand(text)
    kind = intent.kind
    if kind == "saludo":
        await _reply(update, greeting_text(member.name), MAIN_KEYBOARD)
    elif kind == "gracias":
        await _reply(update, "¡Con gusto! 💜 Aquí estoy si necesitas algo más.")
    elif kind == "ayuda":
        await _reply(update, help_text(), MAIN_KEYBOARD)
    elif kind in LISTS:
        await _list_for(update, member, kind)
    elif kind == "equipo":
        await _send_team(update)
    elif kind == "resumen":
        await _send_summary(update)
    elif kind == "silencio":
        await _set_quiet(update, member, intent.hours)
    elif kind == "nueva":
        if intent.title:
            await _create(update, member, intent.title, intent.day, intent.owner_id, intent.project_id)
        else:
            context.user_data["await"] = {"kind": "new"}
            await _reply(update, "¿Qué tarea creo? Escríbela en una frase, por ejemplo «Llamar a la tercera empresa el jueves» 🙂")
    elif kind in ("hecha", "empezar", "revision", "bloqueo", "fecha", "ver"):
        await _task_action(update, context, member, intent)
    else:
        await _reply(update, fallback_text(), MAIN_KEYBOARD)


async def _answer_pending(update: Update, member: Member, pending: dict, text: str) -> None:
    if pending["kind"] == "new":
        intent = _understand("nueva tarea " + text)
        await _create(update, member, intent.title or text, intent.day, intent.owner_id, intent.project_id)
        return
    with session_scope() as s:
        task = s.get(Task, pending["task"])
        if task is None:
            await update.message.reply_text("Esa tarea ya no existe 🤔")
            return
        info = None
        title = esc(task.title)
        if pending["kind"] == "reason":
            who = pending.get("who")
            waiting = who if who in {m.id for m in members_all(s)} else ("Alguien externo" if who == "externo" else "Tema técnico")
            info = apply_patch(s, task, {"status": "bloqueada", "blockerReason": text, "blockerWaitingOn": waiting}, member.id, "telegram")
            add_checkin(s, member_id=member.id, task_id=task.id, kind="respuesta", text=f"{task.key}: bloqueo", answer=text)
            reply = f"Gracias por contarme 🙏 Dejé <b>{title}</b> como bloqueada y ya avisé a quien corresponde. Te escribo apenas se destrabe."
        else:
            add_comment(s, task, text, member.id, "telegram")
            reply = f"Guardado 💬 Quedó en la bitácora de <b>{title}</b>."
        s.commit()
        snapshot = s.get(Task, task.id)
    await _reply(update, reply)
    if info is not None:
        await _after_patch(snapshot, info, member.id)
    else:
        await _notify_changed("tasks")


# ---------------------------------------------------------------- avisos automáticos
async def on_task_change(task_id: int, info: dict, actor: str, source: str) -> None:
    """Llamado tras cualquier cambio de tarea (web, Telegram u Obsidian)."""
    if not STATE["running"]:
        return
    outgoing: list[tuple[int | None, str]] = []
    today = local_today()
    with session_scope() as s:
        task = s.get(Task, task_id)
        if task is None:
            return
        cfg = telegram_settings(s)
        members = {m.id: m for m in members_all(s)}
        names = {k: m.name for k, m in members.items()}
        ceo = members.get(cfg.get("ceoId") or "")
        owner = esc(names.get(task.owner_id, task.owner_id))
        title = esc(task.title)
        if info.get("blocked") and cfg["blockerAlerts"]:
            waiting = names.get(task.blocker_waiting_on or "", task.blocker_waiting_on or "")
            general = (f"⛔ <b>{owner}</b> tiene un bloqueo en <b>{title}</b>.\nLo que falta: {esc(task.blocker_reason)}"
                       + (f"\nEstá esperando a <b>{esc(waiting)}</b>." if waiting else ""))
            target = members.get(task.blocker_waiting_on or "")
            if target and target.telegram_chat_id and target.id != actor:
                outgoing.append((target.telegram_chat_id, f"🙏 {owner} te necesita para seguir con <b>{title}</b>: {esc(task.blocker_reason)}"))
            if ceo and ceo.telegram_chat_id and ceo.id != actor and ceo != target:
                outgoing.append((ceo.telegram_chat_id, general))
            if cfg["groupBlockers"] and cfg["groupChatId"]:
                outgoing.append((cfg["groupChatId"], general))
            add_checkin(s, member_id=task.owner_id, task_id=task.id, kind="bloqueo", chat="privado", text=f"Alerta de bloqueo {task.key}")
        if info.get("unblocked") and members.get(task.owner_id) and members[task.owner_id].telegram_chat_id and actor != task.owner_id:
            outgoing.append((members[task.owner_id].telegram_chat_id, f"🟢 ¡Se destrabó <b>{title}</b>! Ya puedes seguir con ella."))
        if info.get("done") and cfg["groupCelebrations"] and cfg["groupChatId"]:
            outgoing.append((cfg["groupChatId"], f"🎉 ¡{owner} terminó <b>{title}</b>! Un aplauso 👏"))
        if info.get("rescheduled") and source == "telegram" and ceo and ceo.telegram_chat_id and ceo.id != actor:
            outgoing.append((ceo.telegram_chat_id, f"📅 {esc(names.get(actor, actor))} movió <b>{title}</b>: ahora vence el {fmt_date(task.due_date)}."))
        if info.get("reassigned") and members.get(task.owner_id) and members[task.owner_id].telegram_chat_id and actor != task.owner_id:
            outgoing.append((members[task.owner_id].telegram_chat_id,
                             f"📌 ¡Hola, {owner}! Te asignaron <b>{title}</b> ({due_text(task, today)})."))
        s.commit()
    for chat_id, text in outgoing:
        await send(chat_id, text)


async def send_followup(task_id: int, requested_by: str) -> tuple[bool, str]:
    """Pregunta por una tarea al responsable, a pedido desde la web."""
    if not STATE["running"]:
        return False, "El bot todavía no está conectado: actívalo en Seguimiento."
    with session_scope() as s:
        task = s.get(Task, task_id)
        if task is None:
            return False, "La tarea no existe."
        owner = s.get(Member, task.owner_id)
        names = {m.id: m.name for m in members_all(s)}
        if owner is None or owner.telegram_chat_id is None:
            return False, f"{owner.name if owner else 'Esa persona'} todavía no conecta su Telegram."
        intro = f"👋 {esc(names.get(requested_by, requested_by))} te pregunta cómo vas con esta:"
        text = task_card_text(task, names, local_today(), intro)
        chat_id = owner.telegram_chat_id
        add_checkin(s, member_id=owner.id, task_id=task.id, kind="manual", text=f"Seguimiento a pedido de {names.get(requested_by, requested_by)}")
        s.commit()
    ok = await send(chat_id, text, task_keyboard(task_id))
    await _notify_changed("checkins")
    return ok, "Listo, le pregunté por Telegram 👍" if ok else "Telegram no aceptó el mensaje."


async def run_weekly(force: bool = False) -> dict:
    """Ritual semanal: resumen al grupo, repaso privado con cada persona y resumen para quien dirige."""
    if not STATE["running"]:
        return {"ok": False, "reason": "El bot no está activo."}
    today = local_today()
    privates: list[tuple[int, str, list[tuple[str, int]]]] = []
    with session_scope() as s:
        cfg = telegram_settings(s)
        if not force and not cfg["weeklyEnabled"]:
            return {"ok": False, "reason": "El ritual semanal está apagado."}
        tasks = tasks_all(s)
        metrics = project_metrics(s, default_project_id(s))
        members = members_all(s)
        names = {m.id: m.name for m in members}
        group_texts = project_summaries(s, today, ritual=True) if cfg["groupWeeklySummary"] else []
        for m in members:
            if m.telegram_chat_id is None or _quiet(m):
                continue
            mine = sorted([t for t in tasks if t.owner_id == m.id and t.status != "hecha"], key=task_sort_key)
            if mine:
                intro = (f"🗓️ ¡Hola, {esc(m.name)}! Es hora del repaso de la semana. Tienes {len(mine)} tareas abiertas; "
                         "te muestro las más urgentes para que me cuentes cómo van con un toque 👇")
            else:
                intro = f"🗓️ ¡Hola, {esc(m.name)}! Esta semana no tienes nada pendiente ✨ ¡Que descanses!"
            cards = [(task_card_text(t, names, today), t.id) for t in mine[:4]]
            privates.append((m.telegram_chat_id, intro, cards))
            add_checkin(s, member_id=m.id, kind="semanal", text=f"Repaso semanal con {len(cards)} tareas")
        ceo = next((m for m in members if m.id == cfg["ceoId"]), None)
        ceo_chat = ceo.telegram_chat_id if ceo and not _quiet(ceo) else None
        ceo_message = ceo_text(metrics, tasks, names, today, ceo.name if ceo else "") if ceo_chat else None
        if group_texts and cfg["groupChatId"]:
            add_checkin(s, kind="resumen", chat="grupo", text=f"Resumen semanal al grupo ({len(group_texts)} proyectos)")
        s.commit()
    sent_group = False
    if cfg["groupChatId"]:
        for text in group_texts:
            sent_group = await send(cfg["groupChatId"], text) or sent_group
    for chat_id, intro, cards in privates:
        await send(chat_id, intro)
        for text, task_id in cards:
            await send(chat_id, text, task_keyboard(task_id))
    if ceo_message:
        await send(ceo_chat, ceo_message)
    await _notify_changed("checkins")
    return {"ok": True, "group": sent_group, "members": len(privates), "ceo": bool(ceo_message)}


async def run_due_reminders() -> dict:
    """Recordatorio diario: lo que vence hoy o mañana, y lo que venció ayer."""
    if not STATE["running"]:
        return {"ok": False}
    today = local_today()
    outgoing: list[tuple[int, str, int]] = []
    with session_scope() as s:
        cfg = telegram_settings(s)
        if not cfg["dueReminders"]:
            return {"ok": False, "reason": "Los recordatorios están apagados."}
        from sqlmodel import select
        from .models import CheckIn

        start_utc = datetime.combine(today, time(0, 0), tzinfo=TZ).astimezone(timezone.utc)
        already = {(c.member_id, c.task_id) for c in s.exec(select(CheckIn).where(CheckIn.at >= start_utc, CheckIn.kind == "vencimiento"))}
        names = {m.id: m.name for m in members_all(s)}
        tasks = tasks_all(s)
        for m in members_all(s):
            if m.telegram_chat_id is None or _quiet(m):
                continue
            budget = cfg["maxDaily"]
            name = esc(m.name)
            for t in sorted([t for t in tasks if t.owner_id == m.id and t.status != "hecha" and t.due_date], key=task_sort_key):
                if budget <= 0 or (m.id, t.id) in already:
                    continue
                if t.due_date == today:
                    intro = f"⏰ ¡Hola, {name}! Esta vence hoy:"
                elif t.due_date == today + timedelta(days=1):
                    intro = f"🔔 {name}, mañana vence esta:"
                elif t.due_date == today - timedelta(days=1):
                    intro = f"⚠️ {name}, esta se pasó de fecha ayer. ¿Cómo vas? Si necesitas más tiempo, elige otra fecha 👇"
                else:
                    continue
                outgoing.append((m.telegram_chat_id, task_card_text(t, names, today, intro), t.id))
                add_checkin(s, member_id=m.id, task_id=t.id, kind="vencimiento", text=f"Recordatorio {t.key}")
                budget -= 1
        s.commit()
    for chat_id, text, task_id in outgoing:
        await send(chat_id, text, task_keyboard(task_id))
    if outgoing:
        await _notify_changed("checkins")
    return {"ok": True, "sent": len(outgoing)}


async def _job_weekly(context: ContextTypes.DEFAULT_TYPE) -> None:
    with session_scope() as s:
        cfg = telegram_settings(s)
    if cfg["weeklyEnabled"] and local_now().weekday() == int(cfg["weeklyDay"]):
        await run_weekly()


async def _job_due(context: ContextTypes.DEFAULT_TYPE) -> None:
    await run_due_reminders()


def schedule_jobs() -> None:
    app = STATE["app"]
    if not app or app.job_queue is None:
        return
    for job in app.job_queue.jobs():
        job.schedule_removal()
    with session_scope() as s:
        cfg = telegram_settings(s)
    weekly = parse_hhmm(cfg["weeklyTime"], "18:00")
    due = parse_hhmm(cfg["dueTime"], "09:00")
    app.job_queue.run_daily(_job_weekly, time=time(weekly.hour, weekly.minute, tzinfo=TZ), name="ritual_semanal")
    app.job_queue.run_daily(_job_due, time=time(due.hour, due.minute, tzinfo=TZ), name="vencimientos")


def next_weekly(cfg: dict) -> str | None:
    if not cfg.get("weeklyEnabled"):
        return None
    now = local_now()
    at = parse_hhmm(cfg["weeklyTime"], "18:00")
    days_ahead = (int(cfg["weeklyDay"]) - now.weekday()) % 7
    candidate = datetime.combine(now.date() + timedelta(days=days_ahead), at, tzinfo=TZ)
    if candidate <= now:
        candidate += timedelta(days=7)
    return candidate.isoformat(timespec="minutes")


def status_out(s) -> dict:
    cfg = telegram_settings(s)
    username = STATE["username"]
    return {
        "tokenConfigured": bool(config.TELEGRAM_TOKEN),
        "running": STATE["running"],
        "botUsername": username,
        "error": STATE["error"],
        "nextWeekly": next_weekly(cfg),
        "group": {"linked": cfg.get("groupChatId") is not None, "title": cfg.get("groupTitle")},
        "members": [
            {
                "id": m.id,
                "linked": m.telegram_chat_id is not None,
                "username": m.telegram_username,
                "deepLink": f"https://t.me/{username}?start={m.link_code}" if username else None,
                "code": m.link_code,
            }
            for m in members_all(s)
        ],
    }


# ---------------------------------------------------------------- ciclo de vida
def build_application(token: str) -> Application:
    app = Application.builder().token(token).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler(["ayuda", "help"], cmd_help))
    app.add_handler(CommandHandler("vincular_grupo", cmd_link_group))
    app.add_handler(CommandHandler("hoy", cmd_today))
    app.add_handler(CommandHandler("semana", cmd_week))
    app.add_handler(CommandHandler("pendientes", cmd_pending))
    app.add_handler(CommandHandler("estado", cmd_status))
    app.add_handler(CommandHandler("nueva", cmd_new))
    app.add_handler(CommandHandler("equipo", cmd_team))
    app.add_handler(CommandHandler("resumen", cmd_summary))
    app.add_handler(CommandHandler("silencio", cmd_quiet))
    app.add_handler(CallbackQueryHandler(on_button, pattern=r"^t:"))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND & filters.ChatType.PRIVATE, on_text))
    return app


async def start_bot() -> None:
    if not config.TELEGRAM_TOKEN:
        STATE.update(running=False, error=None)
        return
    try:
        app = build_application(config.TELEGRAM_TOKEN)
        await app.initialize()
        me = await app.bot.get_me()
        await app.bot.set_my_commands([BotCommand(name, desc) for name, desc in COMMANDS])
        await app.start()
        await app.updater.start_polling(drop_pending_updates=True)
        STATE.update(app=app, running=True, username=me.username, error=None)
        schedule_jobs()
        log.info("Bot de Telegram activo como @%s", me.username)
    except Exception as exc:  # noqa: BLE001  (HQ debe arrancar aunque Telegram falle)
        STATE.update(app=None, running=False, error=str(exc))
        log.error("No se pudo iniciar el bot de Telegram: %s", exc)


async def stop_bot() -> None:
    app = STATE["app"]
    if app is None:
        return
    try:
        if app.updater and app.updater.running:
            await app.updater.stop()
        await app.stop()
        await app.shutdown()
    finally:
        STATE.update(app=None, running=False)


async def restart_bot(token: str) -> None:
    """Cambia el token sin reiniciar HQ (se usa desde Seguimiento)."""
    await stop_bot()
    config.TELEGRAM_TOKEN = token
    STATE.update(username=None, error=None)
    await start_bot()
