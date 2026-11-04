"""Bot de Telegram de Liiot Hub: un chat del equipo con avisos generales y un chat personal con cada persona.

Habla como alguien del equipo: frases cortas, cálidas y sin claves ni tecnicismos. Entiende mensajes normales
(«¿qué tengo hoy?», «terminé la tabla de precios», «estoy en reunión») gracias a chat.py.
- Chat del equipo: tareas nuevas, entregas, lo que pasa a pruebas, cuenta regresiva, atrasadas y cambios de fase.
- Chat personal: «¿en qué vas a trabajar hoy?» cada mañana (actualiza la oficina), recordatorios y seguimiento.
Funciona con long polling (no necesita dominio ni webhook). Sin token, el resto de Liiot Hub funciona igual.
"""
from __future__ import annotations

import html
import logging
import re
from datetime import date, datetime, time, timedelta, timezone

from sqlmodel import select
from telegram import BotCommand, InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup, Update
from telegram.constants import ChatType, ParseMode
from telegram.error import TelegramError
from telegram.ext import Application, CallbackQueryHandler, CommandHandler, ContextTypes, MessageHandler, filters

from . import config
from .catalog import APP_NAME, DONE, PAUSED, PRESENCE_LABEL, WEEKDAYS
from .chat import fold, match_task, understand
from .db import session_scope
from .models import CheckIn, Member, Project, Task
from .services import (
    TZ,
    add_checkin,
    add_comment,
    apply_patch,
    checklist_of,
    create_task,
    current_phase,
    default_project_id,
    fmt_date,
    local_now,
    local_today,
    log_event,
    member_by_telegram,
    members_all,
    parse_hhmm,
    presence,
    presence_of,
    project_metrics,
    projects_all,
    save_telegram_settings,
    set_presence,
    task_by_key,
    task_sort_key,
    tasks_all,
    telegram_settings,
    utcnow,
    within_hours,
)
from .vault import People

log = logging.getLogger("liiot.bot")

STATE: dict = {"app": None, "running": False, "username": None, "error": None}

COMMANDS = [
    ("hoy", "¿Qué tengo para hoy?"),
    ("semana", "Lo que vence esta semana"),
    ("pendientes", "Todas mis tareas abiertas"),
    ("estado", "Mi estado en la oficina"),
    ("tarea", "Ver una tarea: /tarea tabla de precios"),
    ("nueva", "Crear una tarea: /nueva Llamar a la empresa el jueves"),
    ("equipo", "¿En qué está cada quien?"),
    ("resumen", "¿Cómo vamos en los proyectos?"),
    ("silencio", "Pausar mis mensajes unas horas: /silencio 3"),
    ("vincular_grupo", "Usar este grupo para los avisos del equipo"),
    ("ayuda", "Cómo hablarme"),
]
STATUS_WORD = {"pendiente": "pendiente", "en_progreso": "en progreso", "en_pausa": "en pausa", "pruebas": "en pruebas", "finalizada": "finalizada"}
PRIORITY_WORD = {"P0": "crítica", "P1": "alta", "P2": "media", "P3": "baja"}
PRESENCE_TEXT = {"trabajando": "está trabajando", "en_reunion": "está en reunión", "disponible": "está disponible", "descansando": "está descansando"}
PRESENCE_EMOJI = {"trabajando": "🧑‍💻", "en_reunion": "🗓️", "disponible": "☕", "descansando": "🌙"}
HEALTH_WORD = {"verde": "va bien 💚", "amarillo": "tiene cosas por mirar 💛", "rojo": "necesita atención ❤️‍🩹"}
COUNTDOWN_DAYS = {30, 21, 14, 10, 7, 5, 3, 2, 1, 0}
NOT_LINKED = f"¡Hola! 👋 Aún no sé quién eres. Abre {APP_NAME} › Seguimiento y toca tu enlace personal para conectarnos."
MAIN_KEYBOARD = ReplyKeyboardMarkup(
    [["☀️ ¿Qué tengo hoy?", "🗓️ Mi semana"], ["📍 Mi estado", "👥 ¿Cómo va el equipo?"], ["➕ Nueva tarea"]],
    resize_keyboard=True,
    is_persistent=True,
    input_field_placeholder="Escríbeme lo que necesites…",
)


def esc(value) -> str:
    return html.escape(str(value or ""), quote=False)


def plain(text: str) -> str:
    """Texto sin etiquetas HTML (para guardarlo en la actividad de Seguimiento)."""
    return html.unescape(re.sub(r"<[^>]+>", "", text or "")).strip()


# ---------------------------------------------------------------- textos (funciones puras)
def due_text(t: Task, today: date) -> str:
    if not t.due_date:
        return "sin fecha"
    if t.status != DONE and t.due_date < today:
        days = (today - t.due_date).days
        return "venció ayer" if days == 1 else f"venció hace {days} días"
    if t.due_date == today:
        return "vence hoy"
    if t.due_date == today + timedelta(days=1):
        return "vence mañana"
    return f"vence el {fmt_date(t.due_date)}"


def priority_text(t: Task) -> str:
    return {"P0": " · prioridad crítica 🔥", "P1": " · prioridad alta"}.get(t.priority, "")


def task_line(t: Task, names: dict[str, str], today: date, show_owner: bool = False) -> str:
    owner = f" · {esc(names.get(t.owner_id, t.owner_id))}" if show_owner else ""
    flag = "⏸️ " if t.status == PAUSED else ("🧪 " if t.status == "pruebas" else "")
    return f"• {flag}<b>{esc(t.title)}</b> — {due_text(t, today)}{priority_text(t)}{owner}"


def checklist_text(t: Task) -> str:
    items = checklist_of(t)
    if not items:
        return ""
    done = sum(1 for i in items if i["done"])
    return f"✔️ Checklist: {done} de {len(items)} listos."


def task_card_text(t: Task, names: dict[str, str], today: date, intro: str = "") -> str:
    lines = [intro, ""] if intro else []
    lines.append(f"📌 <b>{esc(t.title)}</b>")
    if t.summary:
        lines.append(f"<i>{esc(t.summary[:220])}</i>")
    if t.status == DONE:
        lines.append("Ya está finalizada ✅")
    else:
        lines.append(f"Está {STATUS_WORD.get(t.status, t.status)} y {due_text(t, today)}{priority_text(t)}.")
    check = checklist_text(t)
    if check:
        lines.append(check)
    if t.status == PAUSED and t.blocker_reason:
        waiting = names.get(t.blocker_waiting_on or "", t.blocker_waiting_on or "")
        lines.append(f"⏸️ En pausa porque: {esc(t.blocker_reason)}" + (f" (esperando a {esc(waiting)})" if waiting else ""))
    if t.status != DONE:
        lines += ["", "¿Cómo vas con esta? 👇"]
    return "\n".join(lines)


def milestone_word(project: Project) -> str:
    return "el piloto" if project.id == config.DEFAULT_PROJECT else "la entrega"


def countdown_text(project: Project, days: int) -> str:
    what = milestone_word(project)
    if days == 0:
        return f"🚀 ¡Hoy es {what} de {esc(project.name)}! Mucho éxito, equipo 💜"
    if days == 1:
        return f"⏳ ¡Mañana es {what} de {esc(project.name)}! Último empujón 💪"
    return f"⏳ Faltan <b>{days} días</b> para {what} de {esc(project.name)} ({fmt_date(project.pilot_date)})."


def overdue_text(project: Project, overdue: list[Task], names: dict[str, str]) -> str:
    n = len(overdue)
    lines = [f"⏰ En {esc(project.name)} tenemos <b>{n} {'tarea atrasada' if n == 1 else 'tareas atrasadas'}</b>."]
    by_owner: dict[str, int] = {}
    for t in overdue:
        by_owner[t.owner_id] = by_owner.get(t.owner_id, 0) + 1
    lines.append(" · ".join(f"{esc(names.get(o, o))}: {c}" for o, c in sorted(by_owner.items(), key=lambda x: -x[1])))
    lines.append("¿Las revisamos hoy? Si alguna necesita otra fecha, díganmelo y la muevo 🙌")
    return "\n".join(lines)


def weekly_group_text(project: Project, metrics: dict, members: list[Member], tasks: list[Task], names: dict[str, str], today: date,
                      ritual: bool = False) -> str:
    week_ahead = today + timedelta(days=7)
    lines = [f"🗓️ <b>Así vamos en {esc(project.name)}</b>"]
    if metrics.get("currentPhaseName"):
        lines.append(f"Estamos en la fase <b>{esc(metrics['currentPhaseName'])}</b>.")
    lines.append("")
    days = metrics.get("daysToPilot")
    if days is not None and days >= 0:
        what = milestone_word(project)
        lines.append(f"Faltan {days} días para {what}." if days > 1 else (f"¡Mañana es {what}!" if days == 1 else f"¡Hoy es {what}!"))
    lines.append(f"✅ Esta semana se finalizaron {metrics['doneThisWeek']} tareas (van {metrics['tasksDone']} de {metrics['tasksTotal']}).")
    if metrics["overdue"]:
        lines.append(f"⏰ {metrics['overdue']} están atrasadas.")
    paused = [t for t in tasks if t.status == PAUSED]
    if paused:
        lines += ["", "<b>En pausa, por destrabar</b>"]
        for t in paused[:5]:
            lines.append(f"• {esc(names.get(t.owner_id))}: <b>{esc(t.title)}</b> — {esc(t.blocker_reason)}")
    lines += ["", "<b>Lo que viene en los próximos 7 días</b>"]
    for m in members:
        mine = sorted(
            [t for t in tasks if t.owner_id == m.id and t.status != DONE and t.due_date and t.due_date <= week_ahead],
            key=task_sort_key,
        )
        who = f"<b>{esc(m.name)}</b>"
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
    overdue = sorted([t for t in tasks if t.status != DONE and t.due_date and t.due_date < today], key=task_sort_key)
    testing = [t for t in tasks if t.status == "pruebas"]
    paused = [t for t in tasks if t.status == PAUSED]
    lines = [f"🧭 <b>Tu resumen, {esc(ceo_name)}</b>", "", f"El proyecto principal {HEALTH_WORD.get(metrics['health'], metrics['health'])}."]
    lines.extend(f"• {esc(reason)}" for reason in metrics.get("healthReasons", [])[:3])
    if testing:
        lines += ["", "<b>Listas para pruebas</b>"]
        lines.extend(task_line(t, names, today, show_owner=True) for t in testing[:5])
    if paused:
        lines += ["", "<b>En pausa</b>"]
        lines.extend(task_line(t, names, today, show_owner=True) for t in paused[:5])
    if overdue:
        lines += ["", "<b>Atrasadas</b>"]
        lines.extend(task_line(t, names, today, show_owner=True) for t in overdue[:6])
    if not testing and not overdue and not paused:
        lines += ["", "Nada urgente por ahora ✨"]
    return "\n".join(lines)


def help_text() -> str:
    return "\n".join([
        "🤖 <b>Puedes escribirme normal</b>, como a alguien del equipo. Por ejemplo:",
        "",
        "• «¿Qué tengo hoy?» o «¿qué tengo esta semana?»",
        "• «Terminé la tabla de precios»",
        "• «Empecé el diagrama de flujo»",
        "• «La tabla está lista para pruebas»",
        "• «Pausa el guion porque falta el logo»",
        "• «Mueve la tabla de precios para el viernes»",
        "• «Nueva tarea: llamar a la tercera empresa el jueves»",
        "• «Estoy en reunión», «hoy trabajo en el guion», «terminé por hoy»",
        "• «¿Cómo va el equipo?» o «¿cómo vamos?»",
        "",
        "Cuando te pregunte algo, también puedes contestar con los botones 👇",
    ])


def greeting_text(name: str) -> str:
    return (f"¡Hola, {esc(name)}! 👋 ¿En qué te ayudo?\n\n"
            "Escríbeme como a alguien del equipo, por ejemplo «¿qué tengo hoy?» o «estoy en reunión». "
            "Abajo tienes botones para lo más común.")


def fallback_text() -> str:
    return ("Mmm, no estoy seguro de haberte entendido 🤔\n\nPuedes decirme cosas como:\n"
            "• «¿Qué tengo hoy?»\n• «Terminé la tabla de precios»\n• «Estoy en reunión»\n"
            "• «Nueva tarea: llamar a la tercera empresa»\n\nO escribe /ayuda para ver todo lo que sé hacer.")


def presence_reply(state: str, note: str = "") -> str:
    if state == "trabajando":
        return f"¡Listo! 🧑‍💻 En la oficina apareces trabajando{f' en «{esc(note)}»' if note else ''}. ¡Éxitos!"
    if state == "en_reunion":
        return "Anotado 🗓️ Apareces en reunión. Cuando salgas, dime «ya estoy libre»."
    if state == "disponible":
        return "¡Perfecto! ☕ Apareces disponible."
    return "¡Que descanses! 🌙 Apareces descansando. Mañana te pregunto en qué vas a trabajar."


# ---------------------------------------------------------------- teclados
def task_keyboard(task_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("✅ Ya la terminé", callback_data=f"t:done:{task_id}"),
         InlineKeyboardButton("💪 Voy bien", callback_data=f"t:ok:{task_id}")],
        [InlineKeyboardButton("▶️ La empiezo", callback_data=f"t:go:{task_id}"),
         InlineKeyboardButton("🧪 Lista para pruebas", callback_data=f"t:rev:{task_id}")],
        [InlineKeyboardButton("📅 Necesito otra fecha", callback_data=f"t:dt:{task_id}"),
         InlineKeyboardButton("⏸️ La pauso", callback_data=f"t:blk:{task_id}")],
        [InlineKeyboardButton("💬 Comentar", callback_data=f"t:cm:{task_id}")],
    ])


def undo_keyboard(task_id: int, previous: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[InlineKeyboardButton("↩️ Deshacer", callback_data=f"t:undo:{task_id}:{previous}")]])


def presence_rows() -> list[list[InlineKeyboardButton]]:
    return [
        [InlineKeyboardButton("🧑‍💻 Trabajando", callback_data="p:trabajando"),
         InlineKeyboardButton("🗓️ En reunión", callback_data="p:en_reunion")],
        [InlineKeyboardButton("☕ Disponible", callback_data="p:disponible"),
         InlineKeyboardButton("🌙 Descansando", callback_data="p:descansando")],
    ]


def checkin_keyboard(tasks: list[Task]) -> InlineKeyboardMarkup:
    """Respuesta a «¿en qué vas a trabajar hoy?»: sus tareas más urgentes, otra cosa o un estado."""
    rows = [[InlineKeyboardButton(f"📌 {_short(t.title, 40)}", callback_data=f"p:t:{t.id}")] for t in tasks[:3]]
    rows.append([InlineKeyboardButton("✍️ En otra cosa", callback_data="p:otra")])
    rows.append([InlineKeyboardButton("🗓️ Estoy en reunión", callback_data="p:en_reunion")])
    rows.append(presence_rows()[1])
    return InlineKeyboardMarkup(rows)


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
    return bool(m.quiet_until and m.quiet_until.replace(tzinfo=m.quiet_until.tzinfo or timezone.utc) > utcnow())


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
                await update.message.reply_text(f"Ese enlace no corresponde a nadie del equipo 🤔 Cópialo de nuevo desde {APP_NAME} › Seguimiento.")
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
                "Cada mañana te pregunto en qué vas a trabajar (así la oficina muestra en qué andas) y te aviso cuando algo tuyo "
                "esté por vencer. Puedes escribirme normal, por ejemplo «¿qué tengo hoy?» o «estoy en reunión».")
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
    await update.message.reply_text(f"¡Listo! 🙌 Aquí les contaré lo importante: tareas nuevas, entregas, cuánto falta para las fechas clave "
                                    f"y el resumen de los {day} a las {cfg['weeklyTime']}.")


async def _member_or_warn(update: Update) -> Member | None:
    with session_scope() as s:
        member = member_by_telegram(s, update.effective_user.id)
    if member is None:
        await update.effective_message.reply_text(NOT_LINKED)
    return member


LISTS = {
    "hoy": ("☀️", "Esto es lo tuyo para hoy", "Hoy no tienes nada pendiente ✨",
            lambda t, d: t.status in ("en_progreso", PAUSED) or (t.due_date is not None and t.due_date <= d)),
    "semana": ("🗓️", "Lo que vence en los próximos 7 días", "Esta semana no vence nada tuyo 🙌",
               lambda t, d: t.due_date is not None and t.due_date <= d + timedelta(days=7)),
    "pendientes": ("📋", "Todas tus tareas abiertas", "No tienes tareas abiertas. ¡Todo al día! ✨", lambda t, d: True),
}


async def _list_for(update: Update, member: Member, kind: str) -> None:
    emoji, title, empty, predicate = LISTS[kind]
    today = local_today()
    with session_scope() as s:
        names = {m.id: m.name for m in members_all(s)}
        mine = sorted([t for t in tasks_all(s) if t.owner_id == member.id and t.status != DONE and predicate(t, today)], key=task_sort_key)
    if not mine:
        await _reply(update, empty)
        return
    lines = [f"{emoji} <b>{title}, {esc(member.name)}</b>", ""]
    lines.extend(task_line(t, names, today) for t in mine[:12])
    if len(mine) > 12:
        lines.append(f"… y {len(mine) - 12} más (las ves todas en {APP_NAME}).")
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


async def cmd_task(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    member = await _member_or_warn(update)
    if member is None:
        return
    query = " ".join(context.args).strip()
    if not query:
        await _reply(update, "¿Cuál tarea quieres ver? Escríbeme unas palabras del título, por ejemplo /tarea tabla de precios")
        return
    intent = _understand(query)
    intent.kind = "ver"
    if not intent.key and not intent.phrase:
        intent.phrase = query
    await _task_action(update, context, member, intent)


async def cmd_presence(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    member = await _member_or_warn(update)
    if member:
        await _send_presence(update, member)


async def _send_presence(update: Update, member: Member) -> None:
    with session_scope() as s:
        m = s.get(Member, member.id)
        state, auto = presence_of(m)
        note = m.presence_note if state == "trabajando" and not auto else ""
    text = f"📍 Ahora apareces <b>{PRESENCE_LABEL[state].lower()}</b>{f' en «{esc(note)}»' if note else ''}."
    if auto:
        text += " (Es lo automático según tu horario.)"
    await _reply(update, text + "\n¿Quieres cambiarlo? 👇", InlineKeyboardMarkup(presence_rows()))


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
    await _ask_description(update, context, intent.title or text, intent.day, intent.owner_id, intent.project_id)


async def cmd_team(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if await _member_or_warn(update) is None:
        return
    await _send_team(update)


async def _send_team(update: Update) -> None:
    with session_scope() as s:
        names = {m.id: m.name for m in members_all(s)}
        pres = presence(s)
    lines = ["👥 <b>Así está el equipo ahora</b>", ""]
    for p in pres:
        doing = ""
        if p["state"] == "trabajando":
            what = (p["task"] or {}).get("title") or p["note"]
            doing = f" en «{esc(what)}»" if what else ""
        lines.append(f"{PRESENCE_EMOJI[p['state']]} <b>{esc(names[p['memberId']])}</b> {PRESENCE_TEXT[p['state']]}{doing}")
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
    members = members_all(s)
    main = default_project_id(s)
    texts = []
    for project in sorted(projects_all(s), key=lambda p: (p.id != main, p.order)):
        tasks = tasks_all(s, project.id)
        if not any(t.status != DONE for t in tasks):
            continue
        texts.append(weekly_group_text(project, project_metrics(s, project.id), members, tasks, names, today, ritual=ritual))
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


async def _ask_description(update: Update, context: ContextTypes.DEFAULT_TYPE, title: str, day: date | None, owner_id: str | None,
                           project_id: str | None) -> None:
    context.user_data["await"] = {"kind": "new_desc", "title": title, "day": day.isoformat() if day else None,
                                  "owner": owner_id, "project": project_id}
    await _reply(update, f"¡Va! 📝 ¿De qué se trata <b>{esc(title)}</b>? Cuéntamelo en una frase para que el equipo entienda.")


async def _create(update: Update, member: Member, title: str, summary: str, day: date | None, owner_id: str | None,
                  project_id: str | None) -> None:
    with session_scope() as s:
        project = s.get(Project, project_id or default_project_id(s))
        owner = s.get(Member, owner_id) if owner_id else member
        try:
            task = create_task(s, {"title": title, "summary": summary, "ownerId": owner.id, "dueDate": day.isoformat() if day else None,
                                   "projectId": project.id}, member.id, source="telegram")
        except ValueError as exc:
            await _reply(update, f"No pude crearla 😕 {esc(exc)}")
            return
        s.commit()
        snapshot = s.get(Task, task.id)
        owner_name, project_name = owner.name, project.name
    parts = [f"¡Listo! ✨ Creé <b>{esc(title)}</b>"]
    if owner_id and owner_id != member.id:
        parts.append(f" para {esc(owner_name)}")
    parts.append(f" en {esc(project_name)}")
    parts.append(f", vence el {fmt_date(day)}." if day else ". ¿Le ponemos fecha? 👇")
    await _reply(update, "".join(parts), task_keyboard(snapshot.id))
    await _after_patch(snapshot, {"changed": True, "created": True, "reassigned": bool(owner_id and owner_id != member.id)}, member.id)


ACTION_PATCH = {
    "hecha": ({"status": DONE}, "¡Excelente! 🎉 Marqué <b>{title}</b> como finalizada."),
    "empezar": ({"status": "en_progreso"}, "¡Vamos! ▶️ <b>{title}</b> quedó en progreso y en la oficina apareces trabajando en ella."),
    "revision": ({"status": "pruebas"}, "🧪 Listo, <b>{title}</b> quedó lista para pruebas. Le cuento al equipo."),
}


def _callback_for(kind: str, task_id: int, day: date | None) -> str:
    if kind == "fecha":
        return f"t:dts:{task_id}:{day.strftime('%Y%m%d')}" if day else f"t:dt:{task_id}"
    if kind == "presencia":
        return f"p:t:{task_id}"
    return {"hecha": "t:done", "empezar": "t:go", "revision": "t:rev", "bloqueo": "t:blk"}.get(kind, "t:card") + f":{task_id}"


async def _task_action(update: Update, context: ContextTypes.DEFAULT_TYPE, member: Member, intent) -> None:
    today = local_today()
    with session_scope() as s:
        names = {m.id: m.name for m in members_all(s)}
        pool = tasks_all(s) if intent.kind == "ver" else [t for t in tasks_all(s) if t.status != DONE]
        task, candidates = match_task(intent.phrase, intent.key, pool, prefer_owner=member.id)
        if task is None and intent.key:
            task = task_by_key(s, intent.key)
    if task is None and not candidates:
        await _reply(update, "No encontré esa tarea 🤔 ¿Me dices unas palabras más del título? Con /pendientes ves todas las tuyas.")
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
        if intent.kind == "empezar":
            _presence(member.id, "trabajando", snapshot.title, snapshot.id)
        keyboard = undo_keyboard(task.id, previous) if intent.kind == "hecha" else None
        await _reply(update, message.format(title=esc(snapshot.title)), keyboard)
        await _after_patch(snapshot, info, member.id)
        if intent.kind == "empezar":
            await _notify_changed("members")
    elif intent.kind == "bloqueo" and intent.reason:
        context.user_data.pop("reason_hint", None)
        _, snapshot, info = _patch(task.id, {"status": PAUSED, "blockerReason": intent.reason}, member)
        await _reply(update, f"Gracias por contarme 🙏 Dejé <b>{esc(snapshot.title)}</b> en pausa («{esc(intent.reason)}») "
                             "y ya avisé a quien corresponde. Te escribo apenas se pueda retomar.")
        await _after_patch(snapshot, info, member.id)
    elif intent.kind == "bloqueo":
        await _reply(update, *_pause_question(task, member))
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
        add_checkin(s, member_id=member.id, task_id=task.id, kind="respuesta", text=f"«{task.title}»: {STATUS_WORD.get(task.status, task.status)}",
                    answer=STATUS_WORD.get(task.status, task.status))
        s.commit()
        return previous, s.get(Task, task_id), info


def _presence(member_id: str, state: str, note: str = "", task_id: int | None = None) -> None:
    with session_scope() as s:
        m = s.get(Member, member_id)
        set_presence(s, m, state, note, task_id)
        add_checkin(s, member_id=member_id, task_id=task_id, kind="estado", text=f"{m.name}: {PRESENCE_LABEL[state].lower()}"
                    + (f" en «{note}»" if note else ""), answer=PRESENCE_LABEL[state])
        s.commit()


def _pause_question(task: Task, member: Member) -> tuple[str, InlineKeyboardMarkup]:
    with session_scope() as s:
        others = [m for m in members_all(s) if m.id != member.id]
    rows = [[InlineKeyboardButton(m.name, callback_data=f"t:who:{task.id}:{m.id}") for m in others]]
    rows.append([InlineKeyboardButton("Alguien de afuera", callback_data=f"t:who:{task.id}:externo"),
                 InlineKeyboardButton("Nadie, solo la pauso", callback_data=f"t:who:{task.id}:nadie")])
    return f"Entiendo ⏸️ ¿Por qué pausamos <b>{esc(task.title)}</b>? Primero dime si estás esperando a alguien:", InlineKeyboardMarkup(rows)


def _date_question(task: Task, today: date) -> tuple[str, InlineKeyboardMarkup]:
    rows = [[InlineKeyboardButton(label, callback_data=f"t:dts:{task.id}:{day.strftime('%Y%m%d')}")] for label, day in date_options(today)]
    current = f"Hoy {due_text(task, today)}." if task.due_date else "Todavía no tiene fecha."
    return f"📅 ¿Para cuándo dejamos <b>{esc(task.title)}</b>? {current}", InlineKeyboardMarkup(rows)


# ---------------------------------------------------------------- botones y texto libre
async def on_presence_button(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    parts = (query.data or "").split(":")
    with session_scope() as s:
        member = member_by_telegram(s, query.from_user.id)
    if member is None:
        await query.message.reply_text(NOT_LINKED)
        return
    try:
        await query.edit_message_reply_markup(reply_markup=None)
    except TelegramError:
        pass
    if len(parts) >= 3 and parts[1] == "t":
        task_id = int(parts[2])
        info, snapshot = None, None
        with session_scope() as s:
            task = s.get(Task, task_id)
            if task is None:
                await query.message.reply_text("Esa tarea ya no existe 🤔")
                return
            if task.status == "pendiente":
                info = apply_patch(s, task, {"status": "en_progreso"}, member.id, "telegram")
                s.commit()
            snapshot = s.get(Task, task_id)
        _presence(member.id, "trabajando", snapshot.title, snapshot.id)
        await query.message.reply_text(presence_reply("trabajando", snapshot.title), parse_mode=ParseMode.HTML)
        if info is not None:
            await _after_patch(snapshot, info, member.id)
    elif parts[1] == "otra":
        hint = context.user_data.pop("presence_hint", None)
        if hint:
            _presence(member.id, "trabajando", hint)
            await query.message.reply_text(presence_reply("trabajando", hint), parse_mode=ParseMode.HTML)
            await _notify_changed("members")
            return
        context.user_data["await"] = {"kind": "presence_note"}
        await query.message.reply_text("¡Cuéntame! ✍️ ¿En qué vas a trabajar? Una frase corta basta.")
        return
    elif parts[1] in PRESENCE_LABEL:
        _presence(member.id, parts[1])
        await query.message.reply_text(presence_reply(parts[1]), parse_mode=ParseMode.HTML)
    await _notify_changed("members")


async def on_button(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    parts = (query.data or "").split(":")
    if len(parts) < 3:
        return
    action, task_id = parts[1], int(parts[2])
    today = local_today()
    started = False
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
            add_checkin(s, member_id=member.id, task_id=task.id, kind="respuesta", text=f"«{task.title}»: va bien", answer="va bien")
            log_event(s, task.id, member.id, "telegram", "checkin", "Contó que va bien")
            reply = f"¡Genial! Anoté que <b>{title}</b> va bien 💪"
        elif action == "done":
            previous = task.status
            info = apply_patch(s, task, {"status": DONE}, member.id, "telegram")
            add_checkin(s, member_id=member.id, task_id=task.id, kind="respuesta", text=f"«{task.title}»: finalizada", answer="terminé")
            reply, keyboard = f"¡Excelente! 🎉 <b>{title}</b> quedó finalizada.", undo_keyboard(task.id, previous)
        elif action == "go":
            info = apply_patch(s, task, {"status": "en_progreso"}, member.id, "telegram")
            reply, started = f"¡Vamos! ▶️ <b>{title}</b> quedó en progreso.", True
        elif action == "rev":
            info = apply_patch(s, task, {"status": "pruebas"}, member.id, "telegram")
            reply = f"🧪 Listo, <b>{title}</b> quedó lista para pruebas. Le cuento al equipo."
        elif action == "undo" and len(parts) >= 4:
            info = apply_patch(s, task, {"status": parts[3]}, member.id, "telegram")
            reply = f"↩️ Listo, dejé <b>{title}</b> como estaba ({STATUS_WORD.get(parts[3], parts[3])})."
        elif action == "card":
            reply, keyboard = task_card_text(task, names, today), task_keyboard(task.id)
        elif action == "blk":
            reply, keyboard = _pause_question(task, member)
        elif action == "who" and len(parts) >= 4:
            hint = context.user_data.pop("reason_hint", None)
            waiting = parts[3] if parts[3] in names else ("Alguien externo" if parts[3] == "externo" else None)
            if hint:
                info = apply_patch(s, task, {"status": PAUSED, "blockerReason": hint, "blockerWaitingOn": waiting}, member.id, "telegram")
                reply = f"Gracias por contarme 🙏 Dejé <b>{title}</b> en pausa y ya avisé a quien corresponde."
            else:
                context.user_data["await"] = {"kind": "reason", "task": task.id, "who": parts[3]}
                reply = "Gracias. Ahora cuéntame en una frase por qué la pausamos, así el equipo sabe qué falta."
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

    if started:
        _presence(member.id, "trabajando", snapshot.title, snapshot.id)
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
    if started:
        await _notify_changed("members")


QUICK = {
    "que tengo hoy": "hoy",
    "mi semana": "semana",
    "como va el equipo": "equipo",
    "nueva tarea": "nueva",
    "mi estado": "mi_estado",
}


async def on_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = (update.message.text or "").strip()
    pending = context.user_data.pop("await", None)
    with session_scope() as s:
        member = member_by_telegram(s, update.effective_user.id)
    if member is None:
        await update.message.reply_text(NOT_LINKED)
        return
    if pending:
        await _answer_pending(update, context, member, pending, text)
        return

    quick = QUICK.get(fold(re.sub(r"[^\w\s]", " ", text)))
    intent = _understand(text) if quick is None else None
    kind = quick or intent.kind
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
    elif kind == "mi_estado":
        await _send_presence(update, member)
    elif kind == "silencio":
        await _set_quiet(update, member, intent.hours)
    elif kind == "presencia":
        await _presence_from_text(update, context, member, intent)
    elif kind == "nueva":
        if intent and intent.title:
            await _ask_description(update, context, intent.title, intent.day, intent.owner_id, intent.project_id)
        else:
            context.user_data["await"] = {"kind": "new"}
            await _reply(update, "¿Qué tarea creo? Escríbela en una frase, por ejemplo «Llamar a la tercera empresa el jueves» 🙂")
    elif kind in ("hecha", "empezar", "revision", "bloqueo", "fecha", "ver"):
        await _task_action(update, context, member, intent)
    else:
        await _reply(update, fallback_text(), MAIN_KEYBOARD)


async def _presence_from_text(update: Update, context: ContextTypes.DEFAULT_TYPE, member: Member, intent) -> None:
    if intent.state != "trabajando" or not (intent.phrase or intent.key):
        _presence(member.id, intent.state)
        await _reply(update, presence_reply(intent.state))
        await _notify_changed("members")
        return
    with session_scope() as s:
        pool = [t for t in tasks_all(s) if t.status != DONE]
        task, candidates = match_task(intent.phrase, intent.key, pool, prefer_owner=member.id)
    if task is None and candidates:
        rows = [[InlineKeyboardButton(_short(t.title), callback_data=f"p:t:{t.id}")] for t in candidates]
        rows.append([InlineKeyboardButton("✍️ Ninguna, es otra cosa", callback_data="p:otra")])
        context.user_data["presence_hint"] = intent.title
        await _reply(update, "¿Es alguna de estas tareas? 👇", InlineKeyboardMarkup(rows))
        return
    if task is None:
        _presence(member.id, "trabajando", intent.title)
        await _reply(update, presence_reply("trabajando", intent.title))
        await _notify_changed("members")
        return
    info = None
    with session_scope() as s:
        t = s.get(Task, task.id)
        if t.status == "pendiente":
            info = apply_patch(s, t, {"status": "en_progreso"}, member.id, "telegram")
            s.commit()
        snapshot = s.get(Task, task.id)
    _presence(member.id, "trabajando", snapshot.title, snapshot.id)
    await _reply(update, presence_reply("trabajando", snapshot.title))
    if info is not None:
        await _after_patch(snapshot, info, member.id)
    await _notify_changed("members")


async def _answer_pending(update: Update, context: ContextTypes.DEFAULT_TYPE, member: Member, pending: dict, text: str) -> None:
    if pending["kind"] == "new":
        intent = _understand("nueva tarea " + text)
        await _ask_description(update, context, intent.title or text, intent.day, intent.owner_id, intent.project_id)
        return
    if pending["kind"] == "new_desc":
        day = date.fromisoformat(pending["day"]) if pending.get("day") else None
        await _create(update, member, pending["title"], text, day, pending.get("owner"), pending.get("project"))
        return
    if pending["kind"] == "presence_note":
        note = text.strip()[:160]
        _presence(member.id, "trabajando", note)
        await _reply(update, presence_reply("trabajando", note))
        await _notify_changed("members")
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
            waiting = who if who in {m.id for m in members_all(s)} else ("Alguien externo" if who == "externo" else None)
            info = apply_patch(s, task, {"status": PAUSED, "blockerReason": text, "blockerWaitingOn": waiting}, member.id, "telegram")
            add_checkin(s, member_id=member.id, task_id=task.id, kind="respuesta", text=f"«{task.title}»: en pausa", answer=text)
            reply = f"Gracias por contarme 🙏 Dejé <b>{title}</b> en pausa y ya avisé a quien corresponde. Te escribo apenas se pueda retomar."
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
def _log_group(s, kind: str, text: str, task_id: int | None = None, member_id: str | None = None) -> None:
    add_checkin(s, member_id=member_id, task_id=task_id, kind=kind, chat="grupo", text=plain(text))


def _log_private(s, kind: str, member_id: str, text: str, task_id: int | None = None) -> None:
    add_checkin(s, member_id=member_id, task_id=task_id, kind=kind, chat="privado", text=plain(text))


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
        who = esc(names.get(actor, actor))
        title = esc(task.title)
        group = cfg.get("groupChatId")
        if info.get("created") and source != "obsidian" and cfg["groupNewTasks"] and group:
            for_whom = "" if task.owner_id == actor else f" para {owner}"
            when = f" · {due_text(task, today)}" if task.due_date else ""
            text = f"🆕 {who} creó la tarea <b>{title}</b>{for_whom}{when}."
            outgoing.append((group, text))
            _log_group(s, "nueva_tarea", text, task.id, actor)
        if info.get("paused") and cfg["blockerAlerts"]:
            waiting = names.get(task.blocker_waiting_on or "", task.blocker_waiting_on or "")
            general = (f"⏸️ <b>{owner}</b> pausó <b>{title}</b>.\nMotivo: {esc(task.blocker_reason)}"
                       + (f"\nEstá esperando a <b>{esc(waiting)}</b>." if waiting else ""))
            target = members.get(task.blocker_waiting_on or "")
            if target and target.telegram_chat_id and target.id != actor:
                text = f"🙏 {owner} te necesita para seguir con <b>{title}</b>: {esc(task.blocker_reason)}"
                outgoing.append((target.telegram_chat_id, text))
                _log_private(s, "pausa", target.id, text, task.id)
            if ceo and ceo.telegram_chat_id and ceo.id != actor and ceo != target:
                outgoing.append((ceo.telegram_chat_id, general))
                _log_private(s, "pausa", ceo.id, general, task.id)
            if cfg["groupBlockers"] and group:
                outgoing.append((group, general))
                _log_group(s, "pausa", general, task.id, task.owner_id)
        if info.get("unpaused") and members.get(task.owner_id) and members[task.owner_id].telegram_chat_id and actor != task.owner_id:
            text = f"🟢 ¡Ya puedes retomar <b>{title}</b>! Se quitó la pausa."
            outgoing.append((members[task.owner_id].telegram_chat_id, text))
            _log_private(s, "pausa", task.owner_id, text, task.id)
        if info.get("testing") and cfg["groupTesting"] and group:
            text = f"🧪 <b>{title}</b> de {owner} está lista para pruebas. ¿Quién le echa un ojo? 👀"
            outgoing.append((group, text))
            _log_group(s, "pruebas", text, task.id, task.owner_id)
        if info.get("done") and cfg["groupCelebrations"] and group:
            text = f"🎉 ¡{owner} finalizó <b>{title}</b>! Un aplauso 👏"
            outgoing.append((group, text))
            _log_group(s, "entrega", text, task.id, task.owner_id)
        if info.get("rescheduled") and source == "telegram" and ceo and ceo.telegram_chat_id and ceo.id != actor:
            text = f"📅 {who} movió <b>{title}</b>: ahora vence el {fmt_date(task.due_date)}."
            outgoing.append((ceo.telegram_chat_id, text))
            _log_private(s, "fecha", ceo.id, text, task.id)
        if info.get("reassigned") and members.get(task.owner_id) and members[task.owner_id].telegram_chat_id and actor != task.owner_id:
            text = f"📌 ¡Hola, {owner}! {who} te asignó <b>{title}</b> ({due_text(task, today)})."
            outgoing.append((members[task.owner_id].telegram_chat_id, text))
            _log_private(s, "asignacion", task.owner_id, text, task.id)
        s.commit()
    for chat_id, text in outgoing:
        await send(chat_id, text)
    if outgoing:
        await _notify_changed("checkins")


async def on_phase_change(project_id: str, phase_name: str | None, actor: str) -> None:
    if not STATE["running"]:
        return
    with session_scope() as s:
        cfg = telegram_settings(s)
        project = s.get(Project, project_id)
        names = {m.id: m.name for m in members_all(s)}
        group = cfg.get("groupChatId")
        if not (cfg["groupPhases"] and group and project):
            return
        if phase_name:
            text = f"🚀 ¡{esc(project.name)} pasó a la fase <b>{esc(phase_name)}</b>! {esc(names.get(actor, actor))} la validó. ¡Vamos, equipo! 💜"
        else:
            text = f"🏁 ¡{esc(project.name)} completó su última fase! Gracias a todo el equipo 💜"
        _log_group(s, "fase", text, member_id=actor)
        s.commit()
    await send(group, text)
    await _notify_changed("checkins")


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
        _log_private(s, "manual", owner.id, f"{names.get(requested_by, requested_by)} preguntó cómo va «{task.title}»", task.id)
        s.commit()
    ok = await send(chat_id, text, task_keyboard(task_id))
    await _notify_changed("checkins")
    return ok, "Listo, le pregunté por Telegram 👍" if ok else "Telegram no aceptó el mensaje."


async def run_weekly(force: bool = False) -> dict:
    """Repaso semanal: resumen al grupo, repaso privado con cada persona y resumen para quien dirige."""
    if not STATE["running"]:
        return {"ok": False, "reason": "El bot no está activo."}
    today = local_today()
    privates: list[tuple[int, str, list[tuple[str, int]]]] = []
    with session_scope() as s:
        cfg = telegram_settings(s)
        if not force and not cfg["weeklyEnabled"]:
            return {"ok": False, "reason": "El repaso semanal está apagado."}
        tasks = tasks_all(s)
        metrics = project_metrics(s, default_project_id(s))
        members = members_all(s)
        names = {m.id: m.name for m in members}
        group_texts = project_summaries(s, today, ritual=True) if cfg["groupWeeklySummary"] else []
        for m in members:
            if m.telegram_chat_id is None or _quiet(m):
                continue
            mine = sorted([t for t in tasks if t.owner_id == m.id and t.status != DONE], key=task_sort_key)
            if mine:
                intro = (f"🗓️ ¡Hola, {esc(m.name)}! Es hora del repaso de la semana. Tienes {len(mine)} tareas abiertas; "
                         "te muestro las más urgentes para que me cuentes cómo van con un toque 👇")
            else:
                intro = f"🗓️ ¡Hola, {esc(m.name)}! Esta semana no tienes nada pendiente ✨ ¡Que descanses!"
            cards = [(task_card_text(t, names, today), t.id) for t in mine[:4]]
            privates.append((m.telegram_chat_id, intro, cards))
            _log_private(s, "semanal", m.id, f"Repaso semanal con {len(cards)} tareas")
        ceo = next((m for m in members if m.id == cfg["ceoId"]), None)
        ceo_chat = ceo.telegram_chat_id if ceo and not _quiet(ceo) else None
        ceo_message = ceo_text(metrics, tasks, names, today, ceo.name if ceo else "") if ceo_chat else None
        if group_texts and cfg["groupChatId"]:
            _log_group(s, "resumen", f"Resumen semanal ({len(group_texts)} proyectos)")
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


def _today_start_utc(today: date) -> datetime:
    return datetime.combine(today, time(0, 0), tzinfo=TZ).astimezone(timezone.utc)


async def run_due_reminders() -> dict:
    """Recordatorio diario por privado: lo que vence hoy o mañana, y lo que venció ayer."""
    if not STATE["running"]:
        return {"ok": False}
    today = local_today()
    outgoing: list[tuple[int, str, int]] = []
    with session_scope() as s:
        cfg = telegram_settings(s)
        if not cfg["dueReminders"]:
            return {"ok": False, "reason": "Los recordatorios están apagados."}
        already = {(c.member_id, c.task_id) for c in s.exec(select(CheckIn).where(CheckIn.at >= _today_start_utc(today), CheckIn.kind == "vencimiento"))}
        names = {m.id: m.name for m in members_all(s)}
        tasks = tasks_all(s)
        for m in members_all(s):
            if m.telegram_chat_id is None or _quiet(m):
                continue
            budget = cfg["maxDaily"]
            name = esc(m.name)
            for t in sorted([t for t in tasks if t.owner_id == m.id and t.status != DONE and t.due_date], key=task_sort_key):
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
                add_checkin(s, member_id=m.id, task_id=t.id, kind="vencimiento", text=f"{plain(intro)} «{t.title}»")
                budget -= 1
        s.commit()
    for chat_id, text, task_id in outgoing:
        await send(chat_id, text, task_keyboard(task_id))
    if outgoing:
        await _notify_changed("checkins")
    return {"ok": True, "sent": len(outgoing)}


async def run_daily_checkins(force_member: str | None = None) -> dict:
    """«¿En qué vas a trabajar hoy?» a cada persona, al empezar su horario (una vez al día)."""
    if not STATE["running"]:
        return {"ok": False, "reason": "El bot no está activo."}
    lnow = local_now()
    today = lnow.date()
    outgoing: list[tuple[int, str, InlineKeyboardMarkup]] = []
    with session_scope() as s:
        cfg = telegram_settings(s)
        if not cfg["dailyCheckin"] and not force_member:
            return {"ok": False, "reason": "La pregunta diaria está apagada."}
        tasks = tasks_all(s)
        for m in members_all(s):
            if m.telegram_chat_id is None or _quiet(m):
                continue
            if force_member and m.id != force_member:
                continue
            if not force_member:
                start = datetime.combine(today, parse_hhmm(m.work_start, "08:00"), tzinfo=TZ)
                if m.checkin_day == today or not within_hours(m, lnow) or lnow > start + timedelta(hours=3):
                    continue
                said = m.presence_at.replace(tzinfo=m.presence_at.tzinfo or timezone.utc) if m.presence_at else None
                if said and said.astimezone(TZ).date() == today:
                    m.checkin_day = today  # ya contó hoy en qué está: no se le pregunta
                    s.add(m)
                    continue
            mine = sorted([t for t in tasks if t.owner_id == m.id and t.status != DONE], key=task_sort_key)
            focus = [t for t in mine if t.status == "en_progreso"] + [t for t in mine if t.status != "en_progreso"]
            today_due = sum(1 for t in mine if t.due_date and t.due_date <= today)
            hello = "¡Buenos días" if lnow.hour < 12 else "¡Hola"
            text = f"{hello}, {esc(m.name)}! ☀️ ¿En qué vas a trabajar hoy?"
            if today_due:
                text += f"\nTienes {today_due} {'tarea que vence' if today_due == 1 else 'tareas que vencen'} hoy o ya están atrasadas."
            text += "\nTócala abajo y la oficina mostrará que estás en eso 👇"
            outgoing.append((m.telegram_chat_id, text, checkin_keyboard(focus)))
            m.checkin_day = today
            s.add(m)
            _log_private(s, "pregunta_diaria", m.id, f"Le pregunté a {m.name} en qué va a trabajar hoy")
        s.commit()
    for chat_id, text, keyboard in outgoing:
        await send(chat_id, text, keyboard)
    if outgoing:
        await _notify_changed("checkins")
    return {"ok": True, "sent": len(outgoing)}


async def run_group_daily(force: bool = False) -> dict:
    """Avisos del día en el grupo: cuenta regresiva a las fechas clave y tareas atrasadas."""
    if not STATE["running"]:
        return {"ok": False, "reason": "El bot no está activo."}
    today = local_today()
    texts: list[str] = []
    with session_scope() as s:
        cfg = telegram_settings(s)
        group = cfg.get("groupChatId")
        if not group:
            return {"ok": False, "reason": "Todavía no hay un grupo conectado: escribe /vincular_grupo en el grupo del equipo."}
        already = {c.text for c in s.exec(select(CheckIn).where(CheckIn.at >= _today_start_utc(today), CheckIn.chat == "grupo"))}
        names = {m.id: m.name for m in members_all(s)}
        for project in projects_all(s):
            if cfg["groupCountdown"] and project.pilot_date:
                days = (project.pilot_date - today).days
                if days in COUNTDOWN_DAYS or (force and days >= 0):
                    text = countdown_text(project, days)
                    if plain(text) not in already:
                        texts.append(text)
                        _log_group(s, "cuenta_regresiva", text)
            if cfg["groupOverdue"] and (today.weekday() < 5 or force):
                overdue = [t for t in tasks_all(s, project.id) if t.status != DONE and t.due_date and t.due_date < today]
                if overdue:
                    text = overdue_text(project, overdue, names)
                    if plain(text) not in already:
                        texts.append(text)
                        _log_group(s, "atrasadas", text)
        s.commit()
    for text in texts:
        await send(group, text)
    if texts:
        await _notify_changed("checkins")
    return {"ok": True, "sent": len(texts)}


async def _job_weekly(context: ContextTypes.DEFAULT_TYPE) -> None:
    with session_scope() as s:
        cfg = telegram_settings(s)
    if cfg["weeklyEnabled"] and local_now().weekday() == int(cfg["weeklyDay"]):
        await run_weekly()


async def _job_due(context: ContextTypes.DEFAULT_TYPE) -> None:
    await run_due_reminders()


async def _job_group(context: ContextTypes.DEFAULT_TYPE) -> None:
    await run_group_daily()


async def _job_checkins(context: ContextTypes.DEFAULT_TYPE) -> None:
    await run_daily_checkins()


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
    group = parse_hhmm(cfg["groupTime"], "08:30")
    app.job_queue.run_daily(_job_weekly, time=time(weekly.hour, weekly.minute, tzinfo=TZ), name="repaso_semanal")
    app.job_queue.run_daily(_job_due, time=time(due.hour, due.minute, tzinfo=TZ), name="vencimientos")
    app.job_queue.run_daily(_job_group, time=time(group.hour, group.minute, tzinfo=TZ), name="avisos_grupo")
    app.job_queue.run_repeating(_job_checkins, interval=300, first=20, name="pregunta_diaria")


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


def status_out(s, me_id: str | None = None, admin: bool = False) -> dict:
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
                "username": m.telegram_username if (admin or m.id == me_id) else None,
                # El enlace personal solo lo ve su dueño (o quien administra): con él cualquiera se haría pasar por esa persona
                "deepLink": f"https://t.me/{username}?start={m.link_code}" if username and (admin or m.id == me_id) else None,
                "code": m.link_code if (admin or m.id == me_id) else None,
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
    app.add_handler(CommandHandler("tarea", cmd_task))
    app.add_handler(CommandHandler("estado", cmd_presence))
    app.add_handler(CommandHandler("nueva", cmd_new))
    app.add_handler(CommandHandler("equipo", cmd_team))
    app.add_handler(CommandHandler("resumen", cmd_summary))
    app.add_handler(CommandHandler("silencio", cmd_quiet))
    app.add_handler(CallbackQueryHandler(on_button, pattern=r"^t:"))
    app.add_handler(CallbackQueryHandler(on_presence_button, pattern=r"^p:"))
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
    except Exception as exc:  # noqa: BLE001  (Liiot Hub debe arrancar aunque Telegram falle)
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
    """Cambia el token sin reiniciar Liiot Hub (se usa desde Seguimiento)."""
    await stop_bot()
    config.TELEGRAM_TOKEN = token
    STATE.update(username=None, error=None)
    await start_bot()
