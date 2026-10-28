"""Canal en vivo: avisa a todos los navegadores cuando algo cambia."""
from __future__ import annotations

from fastapi import WebSocket


class Hub:
    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.clients.add(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self.clients.discard(ws)

    async def publish(self, message: dict) -> None:
        dead = []
        for ws in list(self.clients):
            try:
                await ws.send_json(message)
            except Exception:  # noqa: BLE001  (un cliente caído no debe frenar a los demás)
                dead.append(ws)
        for ws in dead:
            self.clients.discard(ws)


hub = Hub()


async def notify(scope: str, **extra) -> None:
    await hub.publish({"type": "changed", "scope": scope, **extra})
