"""Efectos de un cambio de tarea: aviso en vivo y mensajes de Telegram."""
from __future__ import annotations

from . import bot
from .realtime import hub, notify


async def task_changed(task_id: int, info: dict, actor: str, source: str, owner_id: str | None = None, task_key: str | None = None) -> None:
    await notify("tasks", taskId=task_id, source=source)
    if info.get("done"):
        await hub.publish({"type": "celebrate", "taskId": task_id, "memberId": owner_id, "taskKey": task_key})
    await bot.on_task_change(task_id, info, actor, source)
