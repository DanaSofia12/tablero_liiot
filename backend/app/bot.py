"""Bot de Telegram: seguimiento en privado, resumen en grupo y ritual semanal configurable.

Funciona con long polling (no necesita dominio ni webhook). Si no hay TELEGRAM_BOT_TOKEN,
el resto de HQ funciona igual y este módulo queda inactivo.
"""
from __future__ import annotations

import html
import logging
from datetime import date, datetime, time, timedelta, timezone

from telegram import BotCommand, InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.constants import ChatType, ParseMode
from telegram.error import TelegramError
from telegram.ext import Application, CallbackQueryHandler, CommandHandler, ContextTypes, MessageHandler, filters

from . import config
from .catalog import STATUS_LABEL, TYPE_BY_ID, WEEKDAYS
from .db import session_scope
from .models import Member, Project, Task
from .services import (
    TZ,
    add_checkin,
    add_comment,
    apply_patch,
    create_task,
    fmt_date,
    local_now,
    local_today,
    member_by_telegram,
    members_all,
    parse_hhmm,
    presence,
    project_metrics,
    save_telegram_settings,
    task_by_key,
    task_sort_key,
    tasks_all,
    team_metrics,
    telegram_settings,
    utcnow,
)

log = logging.getLogger("liiot.bot")

STATE: dict = {"app": None, "running": False, "username": None, "error": None}

COMMANDS = [
    ("hoy", "Mis tareas para hoy y lo vencido"),
    ("semana", "Lo que vence en los próximos 7 días"),
    ("pendientes", "Todas mis tareas abiertas"),
    ("estado", "Ver y actualizar una tarea: /estado BLP-3"),
    ("nueva", "Crear una tarea: /nueva Llamar a la tercera empresa"),
    ("equipo", "Qué está haciendo cada quien"),
    ("resumen", "Indicadores del proyecto"),
    ("silencio", "Pausar mensajes del bot: /silencio 2"),
    ("vincular_grupo", "Usar este grupo para los resúmenes"),
    ("ayuda", "Ver los comandos"),
]
PRESENCE_LABEL = {
    "trabajando": "trabajando",
    "bloqueado": "bloqueado",
    "revision": "esperando revisión",
    "celebrando": "acaba de terminar algo",
    "disponible": "disponible",
    "reunion": "en reunión",
    "foco": "en modo foco",
    "fuera": "fuera de horario",
}
DECISION_LABEL = {"lanzar": "Lanzar", "lanzar_con_riesgo": "Lanzar con riesgo", "no_lanzar": "No lanzar todavía"}


def esc(value) -> str:
    return html.escape(str(value or ""), quote=False)


# ---------------------------------------------------------------- textos (funciones puras)
def task_line(t: Task, names: dict[str, str], today: date, show_owner: bool = False) -> str:
    due = ""
    if t.due_date:
        if t.status != "hecha" and t.due_date < today:
            due = f" · ⏰ venció {fmt_date(t.due_date)}"
        else:
            due = f" · {fmt_date(t.due_date)}"
    owner = f" · {esc(names.get(t.owner_id, t.owner_id))}" if show_owner else ""
    flag = "⛔ " if t.status == "bloqueada" else ""
    return f"• {flag}<b>{t.key}</b> {esc(t.title)}{owner}{due}"


def task_card_text(t: Task, names: dict[str, str], today: date, intro: str = "") -> str:
    lines = [intro] if intro else []
    lines.append(f"<b>{t.key}</b> · {esc(t.title)}")
    tipo = TYPE_BY_ID.get(t.type, {}).get("label", t.type)
    due = fmt_date(t.due_date)
    if t.due_date and t.status != "hecha" and t.due_date < today:
        due = f"⏰ venció {due}"
    lines.append(f"{STATUS_LABEL.get(t.status, t.status)} · {t.priority} · {tipo} · {due}")
    if t.status == "bloqueada" and t.blocker_reason:
        waiting = names.get(t.blocker_waiting_on or "", t.blocker_waiting_on or "")
        lines.append(f"⛔ {esc(t.blocker_reason)}" + (f" (espera a {esc(waiting)})" if waiting else ""))
    return "\n".join(lines)


def weekly_group_text(project: Project, metrics: dict, team: list[dict], tasks: list[Task], names: dict[str, str], today: date) -> str:
    v = metrics["verdict"]
    week_ahead = today + timedelta(days=7)
    lines = [f"🗓️ <b>Resumen semanal · {esc(project.name)}</b>"]
    if metrics.get("daysToPilot") is not None:
        lines.append(f"Piloto en {metrics['daysToPilot']} días · bloqueantes {v['blockingOk']}/{v['blockingTotal']} · {DECISION_LABEL[v['decision']]}")
    lines.append(f"✅ Hechas esta semana: {metrics['doneThisWeek']} · total {metrics['tasksDone']}/{metrics['tasksTotal']}")
    lines.append(f"⏰ Vencidas: {metrics['overdue']} · ⛔ Bloqueadas: {metrics['blocked']}")
    blocked = [t for t in tasks if t.status == "bloqueada"]
    if blocked:
        lines.append("")
        lines.append("<b>Bloqueos</b>")
        for t in blocked[:5]:
            waiting = names.get(t.blocker_waiting_on or "", t.blocker_waiting_on or "")
            lines.append(f"• <b>{t.key}</b> {esc(names.get(t.owner_id))}: {esc(t.blocker_reason)}" + (f" · espera a {esc(waiting)}" if waiting else ""))
    lines.append("")
    lines.append("<b>Próximos 7 días</b>")
    for w in team:
        mine = sorted(
            [t for t in tasks if t.owner_id == w["memberId"] and t.status != "hecha" and t.due_date and t.due_date <= week_ahead],
            key=task_sort_key,
        )
        lines.append(f"<b>{esc(names.get(w['memberId']))}</b> · carga {w['pct']} %")
        for t in mine[:3]:
            lines.append("  " + task_line(t, names, today))
        if not mine:
            lines.append("  • Nada vence esta semana")
    lines.append("")
    lines.append("Cada uno recibe por privado sus tareas para actualizarlas con un toque. 💜")
    return "\n".join(lines)


def ceo_text(metrics: dict, tasks: list[Task], names: dict[str, str], today: date) -> str:
    v = metrics["verdict"]
    overdue = sorted([t for t in tasks if t.status != "hecha" and t.due_date and t.due_date < today], key=task_sort_key)
    review = [t for t in tasks if t.status == "en_revision"]
    lines = ["🧭 <b>Para ti, Dana</b>"]
    lines.append(f"Salud del proyecto: {metrics['health']} · {DECISION_LABEL[v['decision']]} ({v['blockingOk']}/{v['blockingTotal']} bloqueantes)")
    for reason in metrics.get("healthReasons", [])[:3]:
        lines.append(f"• {esc(reason)}")
    if review:
        lines.append("")
        lines.append("<b>Esperan tu revisión</b>")
        lines.extend(task_line(t, names, today, show_owner=True) for t in review[:5])
    if overdue:
        lines.append("")
        lines.append("<b>Vencidas</b>")
        lines.extend(task_line(t, names, today, show_owner=True) for t in overdue[:6])
    return "\n".join(lines)


def help_text() -> str:
    lines = ["🤖 <b>Liiot HQ</b> · comandos"]
    lines.extend(f"/{name} — {desc}" for name, desc in COMMANDS)
    lines.append("")
    lines.append("Cuando te pregunte por una tarea, responde con los botones. Se actualiza en HQ al instante.")
    return "\n".join(lines)


# ---------------------------------------------------------------- teclados
def task_keyboard(task_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("✅ Va bien", callback_data=f"t:ok:{task_id}"),
         InlineKeyboardButton("🏁 Terminé", callback_data=f"t:done:{task_id}")],
        [InlineKeyboardButton("⛔ Bloqueo", callback_data=f"t:blk:{task_id}"),
         InlineKeyboardButton("📅 Cambiar fecha", callback_data=f"t:dt:{task_id}")],
        [InlineKeyboardButton("▶️ La empiezo", callback_data=f"t:go:{task_id}"),
         InlineKeyboardButton("💬 Comentar", callback_data=f"t:cm:{task_id}")],
    ])


def date_options(today: date) -> list[tuple[str, date]]:
    friday = today + timedelta(days=(4 - today.weekday()) % 7 or 7)
    monday = today + timedelta(days=(0 - today.weekday()) % 7 or 7)
    return [
        ("Mañana", today + timedelta(days=1)),
        ("En 2 días", today + timedelta(days=2)),
        (f"Viernes {friday.day}", friday),
        (f"Lunes {monday.day}", monday),
        ("En 1 semana", today + timedelta(days=7)),
    ]


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


# ---------------------------------------------------------------- comandos
async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    chat = update.effective_chat
    if chat.type != ChatType.PRIVATE:
        await update.message.reply_text("Escríbeme por privado para vincular tu cuenta. En este grupo usa /vincular_grupo.")
        return
    code = (context.args[0] if context.args else "").strip()
    with session_scope() as s:
        current = member_by_telegram(s, user.id)
        if code:
            member = next((m for m in members_all(s) if m.link_code == code), None)
            if member is None:
                await update.message.reply_text("Ese código no corresponde a nadie del equipo. Cópialo de nuevo desde HQ › Seguimiento.")
                return
            if current and current.id != member.id:
                current.telegram_chat_id = None
                s.add(current)
            member.telegram_chat_id = user.id
            member.telegram_username = user.username
            s.add(member)
            s.commit()
            name = member.name
        elif current:
            name = current.name
        else:
            await update.message.reply_text("Hola. Para vincularte abre HQ › Seguimiento y usa tu enlace personal.")
            return
    await _notify_changed("members")
    await update.message.reply_text(f"¡Hola, {esc(name)}! 💜 Tu cuenta quedó vinculada a Liiot HQ.\n\n" + help_text(), parse_mode=ParseMode.HTML)


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(help_text(), parse_mode=ParseMode.HTML)


async def cmd_link_group(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat = update.effective_chat
    if chat.type not in (ChatType.GROUP, ChatType.SUPERGROUP):
        await update.message.reply_text("Este comando se usa dentro del grupo del equipo.")
        return
    with session_scope() as s:
        if member_by_telegram(s, update.effective_user.id) is None:
            await update.message.reply_text("Solo alguien del equipo vinculado a HQ puede conectar el grupo.")
            return
        cfg = save_telegram_settings(s, {"groupChatId": chat.id, "groupTitle": chat.title})
        s.commit()
    await _notify_changed("settings")
    day = WEEKDAYS[cfg["weeklyDay"]].lower()
    await update.message.reply_text(f"Listo. Este grupo recibirá el resumen semanal los {day} a las {cfg['weeklyTime']}. 🗓️")


async def _member_or_warn(update: Update) -> Member | None:
    with session_scope() as s:
        member = member_by_telegram(s, update.effective_user.id)
    if member is None:
        await update.effective_message.reply_text("No te reconozco todavía. Vincúlate desde HQ › Seguimiento.")
    return member


async def _list_tasks(update: Update, title: str, predicate) -> None:
    member = await _member_or_warn(update)
    if member is None:
        return
    today = local_today()
    with session_scope() as s:
        names = {m.id: m.name for m in members_all(s)}
        mine = sorted([t for t in tasks_all(s) if t.owner_id == member.id and t.status != "hecha" and predicate(t, today)], key=task_sort_key)
    if not mine:
        await update.effective_message.reply_text(f"{title}: nada pendiente. ✨")
        return
    text = f"<b>{title}</b>\n" + "\n".join(task_line(t, names, today) for t in mine[:15])
    text += "\n\nUsa /estado CLAVE para actualizar una."
    await update.effective_message.reply_text(text, parse_mode=ParseMode.HTML)


async def cmd_today(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await _list_tasks(update, "Para hoy", lambda t, d: t.status in ("en_progreso", "bloqueada") or (t.due_date is not None and t.due_date <= d))


async def cmd_week(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await _list_tasks(update, "Próximos 7 días", lambda t, d: t.due_date is not None and t.due_date <= d + timedelta(days=7))


async def cmd_pending(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await _list_tasks(update, "Tus tareas abiertas", lambda t, d: True)


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    member = await _member_or_warn(update)
    if member is None:
        return
    if not context.args:
        await update.message.reply_text("Escribe la clave de la tarea, por ejemplo: /estado BLP-3")
        return
    with session_scope() as s:
        task = task_by_key(s, context.args[0])
        names = {m.id: m.name for m in members_all(s)}
    if task is None:
        await update.message.reply_text("No encontré esa tarea.")
        return
    await update.message.reply_text(task_card_text(task, names, local_today()), parse_mode=ParseMode.HTML,
                                    reply_markup=task_keyboard(task.id))


async def cmd_new(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    member = await _member_or_warn(update)
    if member is None:
        return
    title = " ".join(context.args).strip()
    if not title:
        await update.message.reply_text("Escribe el título después del comando: /nueva Llamar a la tercera empresa")
        return
    with session_scope() as s:
        task = create_task(s, {"title": title, "ownerId": member.id}, member.id, source="telegram")
        s.commit()
        key, task_id = task.key, task.id
    await _notify_changed("tasks")
    await update.message.reply_text(f"Creé <b>{key}</b> · {esc(title)} a tu nombre. Ponle fecha desde HQ o con 📅.",
                                    parse_mode=ParseMode.HTML, reply_markup=task_keyboard(task_id))


async def cmd_team(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if await _member_or_warn(update) is None:
        return
    with session_scope() as s:
        names = {m.id: m.name for m in members_all(s)}
        pres = presence(s)
        team = {w["memberId"]: w for w in team_metrics(s)}
    lines = ["👥 <b>Equipo ahora</b>"]
    for p in pres:
        task = p["task"]
        detail = f" · {task['key']} {esc(task['title'])}" if task else ""
        lines.append(f"• <b>{esc(names[p['memberId']])}</b>: {PRESENCE_LABEL.get(p['state'], p['state'])}{detail} · carga {team[p['memberId']]['pct']} %")
    await update.message.reply_text("\n".join(lines), parse_mode=ParseMode.HTML)


async def cmd_summary(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if await _member_or_warn(update) is None:
        return
    with session_scope() as s:
        project = s.get(Project, config.DEFAULT_PROJECT)
        text = weekly_group_text(project, project_metrics(s), team_metrics(s), tasks_all(s), {m.id: m.name for m in members_all(s)}, local_today())
    await update.message.reply_text(text, parse_mode=ParseMode.HTML)


async def cmd_quiet(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    member = await _member_or_warn(update)
    if member is None:
        return
    try:
        hours = max(0, min(72, int(context.args[0]))) if context.args else 2
    except ValueError:
        hours = 2
    with session_scope() as s:
        m = s.get(Member, member.id)
        m.quiet_until = utcnow() + timedelta(hours=hours) if hours else None
        s.add(m)
        s.commit()
    await update.message.reply_text("Listo, vuelvo a escribirte cuando quieras." if hours == 0 else f"Silencio por {hours} h. 🤫")


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
            await query.message.reply_text("No te reconozco todavía. Vincúlate desde HQ › Seguimiento.")
            return
        task = s.get(Task, task_id)
        if task is None:
            await query.message.reply_text("Esa tarea ya no existe.")
            return
        names = {m.id: m.name for m in members_all(s)}
        reply, keyboard, info = "", None, None

        if action == "ok":
            add_checkin(s, member_id=member.id, task_id=task.id, kind="respuesta", text=f"{task.key}: va bien", answer="va bien")
            from .services import log_event
            log_event(s, task.id, member.id, "telegram", "checkin", "Check-in: va bien")
            reply = f"✅ Anotado: <b>{task.key}</b> va bien."
        elif action == "done":
            info = apply_patch(s, task, {"status": "hecha"}, member.id, "telegram")
            add_checkin(s, member_id=member.id, task_id=task.id, kind="respuesta", text=f"{task.key}: terminada", answer="terminé")
            reply = f"🎉 <b>{task.key}</b> quedó como Hecha. ¡Bien!"
        elif action == "go":
            info = apply_patch(s, task, {"status": "en_progreso"}, member.id, "telegram")
            reply = f"▶️ <b>{task.key}</b> pasó a En progreso."
        elif action == "blk":
            others = [m for m in members_all(s) if m.id != member.id]
            rows = [[InlineKeyboardButton(m.name, callback_data=f"t:who:{task.id}:{m.id}") for m in others]]
            rows.append([InlineKeyboardButton("Alguien externo", callback_data=f"t:who:{task.id}:externo"),
                         InlineKeyboardButton("Es técnico", callback_data=f"t:who:{task.id}:tecnico")])
            reply, keyboard = f"⛔ <b>{task.key}</b> · ¿A quién o qué esperas?", InlineKeyboardMarkup(rows)
        elif action == "who" and len(parts) >= 4:
            context.user_data["await"] = {"kind": "reason", "task": task.id, "who": parts[3]}
            reply = "Escribe en una línea qué falta para seguir."
        elif action == "dt":
            rows = [[InlineKeyboardButton(label, callback_data=f"t:dts:{task.id}:{day.strftime('%Y%m%d')}")] for label, day in date_options(today)]
            reply, keyboard = f"📅 Nueva fecha para <b>{task.key}</b> (hoy vence {fmt_date(task.due_date)}):", InlineKeyboardMarkup(rows)
        elif action == "dts" and len(parts) >= 4:
            new_due = datetime.strptime(parts[3], "%Y%m%d").date()
            info = apply_patch(s, task, {"dueDate": new_due}, member.id, "telegram")
            reply = f"📅 <b>{task.key}</b> ahora vence el {fmt_date(new_due)}."
        elif action == "cm":
            context.user_data["await"] = {"kind": "comment", "task": task.id}
            reply = f"💬 Escribe tu comentario para <b>{task.key}</b>."
        s.commit()
        snapshot = s.get(Task, task_id)

    if action in ("ok", "done", "go", "dts", "who"):
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
    pending = context.user_data.pop("await", None)
    text = (update.message.text or "").strip()
    with session_scope() as s:
        member = member_by_telegram(s, update.effective_user.id)
        if member is None:
            await update.message.reply_text("Hola. Para usar el bot vincúlate desde HQ › Seguimiento.")
            return
        if not pending:
            await update.message.reply_text("Usa los botones o un comando. /ayuda muestra todos.")
            return
        task = s.get(Task, pending["task"])
        if task is None:
            await update.message.reply_text("Esa tarea ya no existe.")
            return
        info = None
        if pending["kind"] == "reason":
            who = pending.get("who")
            waiting = who if who in {m.id for m in members_all(s)} else ("Alguien externo" if who == "externo" else "Tema técnico")
            info = apply_patch(s, task, {"status": "bloqueada", "blockerReason": text, "blockerWaitingOn": waiting}, member.id, "telegram")
            add_checkin(s, member_id=member.id, task_id=task.id, kind="respuesta", text=f"{task.key}: bloqueo", answer=text)
            reply = f"Listo. <b>{task.key}</b> quedó Bloqueada y le avisé a quien corresponde. Te escribo cuando se resuelva."
        else:
            add_comment(s, task, text, member.id, "telegram")
            reply = f"💬 Comentario guardado en <b>{task.key}</b>."
        s.commit()
        snapshot = s.get(Task, task.id)
    await update.message.reply_text(reply, parse_mode=ParseMode.HTML)
    if info is not None:
        await _after_patch(snapshot, info, member.id)
    else:
        await _notify_changed("tasks")


# ---------------------------------------------------------------- avisos automáticos
async def on_task_change(task_id: int, info: dict, actor: str, source: str) -> None:
    """Llamado tras cualquier cambio de tarea (web o Telegram)."""
    if not STATE["running"]:
        return
    outgoing: list[tuple[int | None, str]] = []
    with session_scope() as s:
        task = s.get(Task, task_id)
        if task is None:
            return
        cfg = telegram_settings(s)
        members = {m.id: m for m in members_all(s)}
        names = {k: m.name for k, m in members.items()}
        ceo = members.get(cfg.get("ceoId") or "")
        if info.get("blocked") and cfg["blockerAlerts"]:
            waiting = names.get(task.blocker_waiting_on or "", task.blocker_waiting_on or "")
            text = (f"⛔ <b>Bloqueo nuevo · {task.key}</b> ({task.priority})\n{esc(task.title)}\n"
                    f"{esc(names.get(task.owner_id))}: {esc(task.blocker_reason)}" + (f"\nEspera a: <b>{esc(waiting)}</b>" if waiting else ""))
            targets = set()
            if ceo and ceo.telegram_chat_id and ceo.id != actor:
                targets.add(ceo.telegram_chat_id)
            target = members.get(task.blocker_waiting_on or "")
            if target and target.telegram_chat_id and target.id != actor:
                targets.add(target.telegram_chat_id)
            outgoing.extend((chat, text) for chat in targets)
            if cfg["groupBlockers"] and cfg["groupChatId"]:
                outgoing.append((cfg["groupChatId"], text))
            add_checkin(s, member_id=task.owner_id, task_id=task.id, kind="bloqueo", chat="privado", text=f"Alerta de bloqueo {task.key}")
        if info.get("unblocked") and members.get(task.owner_id) and members[task.owner_id].telegram_chat_id and actor != task.owner_id:
            outgoing.append((members[task.owner_id].telegram_chat_id, f"🟢 Se resolvió el bloqueo de <b>{task.key}</b> · {esc(task.title)}. ¡A seguir!"))
        if info.get("done") and cfg["groupCelebrations"] and cfg["groupChatId"]:
            outgoing.append((cfg["groupChatId"], f"🎉 <b>{esc(names.get(task.owner_id))}</b> terminó <b>{task.key}</b> · {esc(task.title)}"))
        if info.get("rescheduled") and source == "telegram" and ceo and ceo.telegram_chat_id and ceo.id != actor:
            outgoing.append((ceo.telegram_chat_id, f"📅 <b>{task.key}</b> cambió de fecha: ahora vence el {fmt_date(task.due_date)} (pedido de {esc(names.get(actor, actor))})."))
        if info.get("reassigned") and members.get(task.owner_id) and members[task.owner_id].telegram_chat_id and actor != task.owner_id:
            outgoing.append((members[task.owner_id].telegram_chat_id, f"📌 Te asignaron <b>{task.key}</b> · {esc(task.title)} (vence {fmt_date(task.due_date)})."))
        s.commit()
    for chat_id, text in outgoing:
        await send(chat_id, text)


async def send_followup(task_id: int, requested_by: str) -> tuple[bool, str]:
    """Pregunta por una tarea al responsable, a pedido desde la web."""
    if not STATE["running"]:
        return False, "El bot no está activo. Configura TELEGRAM_BOT_TOKEN y reinicia HQ."
    with session_scope() as s:
        task = s.get(Task, task_id)
        if task is None:
            return False, "La tarea no existe."
        owner = s.get(Member, task.owner_id)
        names = {m.id: m.name for m in members_all(s)}
        if owner is None or owner.telegram_chat_id is None:
            return False, f"{owner.name if owner else 'La persona'} todavía no vinculó su Telegram."
        intro = f"👋 {esc(names.get(requested_by, requested_by))} pregunta cómo va esta tarea:"
        text = task_card_text(task, names, local_today(), intro)
        chat_id = owner.telegram_chat_id
        add_checkin(s, member_id=owner.id, task_id=task.id, kind="manual", text=f"Seguimiento a pedido de {names.get(requested_by, requested_by)}")
        s.commit()
    ok = await send(chat_id, text, task_keyboard(task_id))
    await _notify_changed("checkins")
    return ok, "Pregunta enviada por Telegram." if ok else "Telegram no aceptó el mensaje."


async def run_weekly(force: bool = False) -> dict:
    """Ritual semanal: resumen al grupo, check-in privado a cada persona y resumen para la CEO."""
    if not STATE["running"]:
        return {"ok": False, "reason": "El bot no está activo."}
    today = local_today()
    privates: list[tuple[int, str, list[tuple[str, int]]]] = []
    with session_scope() as s:
        cfg = telegram_settings(s)
        if not force and not cfg["weeklyEnabled"]:
            return {"ok": False, "reason": "El ritual semanal está apagado."}
        project = s.get(Project, config.DEFAULT_PROJECT)
        tasks = tasks_all(s)
        metrics = project_metrics(s)
        team = team_metrics(s)
        members = members_all(s)
        names = {m.id: m.name for m in members}
        group_text = weekly_group_text(project, metrics, team, tasks, names, today) if cfg["groupWeeklySummary"] else None
        for m in members:
            if m.telegram_chat_id is None or _quiet(m):
                continue
            mine = sorted([t for t in tasks if t.owner_id == m.id and t.status != "hecha"], key=task_sort_key)
            intro = (f"🗓️ Hola, {esc(m.name)}. Seguimiento semanal: tienes {len(mine)} tareas abiertas."
                     + (" Te muestro las más urgentes; responde con los botones." if mine else " ¡Todo al día! ✨"))
            cards = [(task_card_text(t, names, today), t.id) for t in mine[:4]]
            privates.append((m.telegram_chat_id, intro, cards))
            add_checkin(s, member_id=m.id, kind="semanal", text=f"Check-in semanal con {len(cards)} tareas")
        ceo = next((m for m in members if m.id == cfg["ceoId"]), None)
        ceo_chat = ceo.telegram_chat_id if ceo and not _quiet(ceo) else None
        ceo_message = ceo_text(metrics, tasks, names, today) if ceo_chat else None
        if group_text and cfg["groupChatId"]:
            add_checkin(s, kind="resumen", chat="grupo", text="Resumen semanal al grupo")
        s.commit()
    sent_group = await send(cfg["groupChatId"], group_text) if group_text and cfg["groupChatId"] else False
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
            for t in sorted([t for t in tasks if t.owner_id == m.id and t.status != "hecha" and t.due_date], key=task_sort_key):
                if budget <= 0 or (m.id, t.id) in already:
                    continue
                if t.due_date == today:
                    intro = "⏰ Vence hoy:"
                elif t.due_date == today + timedelta(days=1):
                    intro = "🔔 Vence mañana:"
                elif t.due_date == today - timedelta(days=1):
                    intro = "⚠️ Venció ayer. ¿Qué pasó?"
                else:
                    continue
                outgoing.append((m.telegram_chat_id, task_card_text(t, names, today, intro), t.id))
                add_checkin(s, member_id=m.id, task_id=t.id, kind="vencimiento", text=f"{intro} {t.key}")
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
