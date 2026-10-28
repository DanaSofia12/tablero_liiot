"""Efectos de un cambio de tarea: aviso en vivo, mensajes de Telegram y copia a Obsidian."""
from __future__ import annotations

from . import bot, vault
from .realtime import hub, notify


async def task_changed(task_id: int, info: dict, actor: str, source: str, owner_id: str | None = None, task_key: str | None = None) -> None:
    await notify("tasks", taskId=task_id, source=source)
    if info.get("done"):
        await hub.publish({"type": "celebrate", "taskId": task_id, "memberId": owner_id, "taskKey": task_key})
    await bot.on_task_change(task_id, info, actor, source)
    if source != vault.SOURCE:
        vault.request_sync()  # el cambio viaja a la nota de Obsidian en un par de segundos
