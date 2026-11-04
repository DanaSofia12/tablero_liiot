"""Aplicación FastAPI: API, canal en vivo, bot de Telegram e interfaz compilada."""
from __future__ import annotations

import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse

from . import auth, bot, config, migrate, vault
from .api import public, router
from .api_auth import accounts, router as auth_router
from .catalog import APP_NAME
from .db import init_db
from .realtime import hub
from .seed import seed_if_empty

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

MUTATING = {"POST", "PUT", "PATCH", "DELETE"}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    fresh = seed_if_empty()
    migrate.upgrade(fresh=fresh)
    auth.announce_setup()
    await bot.start_bot()
    sync_task = asyncio.create_task(vault.run_loop())
    yield
    sync_task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await sync_task
    await bot.stop_bot()


app = FastAPI(title=APP_NAME, version="0.2.0", lifespan=lifespan)


@app.middleware("http")
async def guard(request: Request, call_next):
    """Los cambios a la API solo se aceptan desde la propia interfaz (encabezado X-Liiot), no desde otras páginas."""
    if request.method in MUTATING and request.url.path.startswith("/api/") and request.headers.get("x-liiot") != "1":
        return JSONResponse({"detail": "Solicitud rechazada."}, status_code=403)
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    return response


app.include_router(public)
app.include_router(auth_router)
app.include_router(accounts)
app.include_router(router)


@app.websocket("/ws")
async def live(ws: WebSocket) -> None:
    if auth.resolve(ws.cookies.get(auth.COOKIE)) is None:
        await ws.close(code=4401)
        return
    await hub.connect(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        hub.disconnect(ws)


NO_BUILD = f"""<!doctype html><meta charset="utf-8"><title>{APP_NAME}</title>
<body style="font-family:system-ui;background:#07050d;color:#f6f1ff;padding:48px">
<h1>{APP_NAME} está corriendo</h1>
<p>La API responde en <code>/api</code>, pero la interfaz no está compilada.</p>
<p>Abre <code>iniciar.cmd</code> (compila y abre todo) o <code>desarrollo.ps1</code> (modo desarrollo en el puerto 5173).</p>
</body>"""


@app.get("/{full_path:path}", include_in_schema=False)
async def spa(full_path: str):
    if full_path == "api" or full_path.startswith("api/"):
        raise HTTPException(404, "Ruta de API no encontrada.")
    static_dir = config.STATIC_DIR.resolve()
    if not (static_dir / "index.html").is_file():
        return HTMLResponse(NO_BUILD)
    target = (static_dir / full_path).resolve()
    if full_path and target.is_file() and static_dir in target.parents:
        # Los archivos de assets/ llevan hash en el nombre: se pueden guardar para siempre
        cache = "public, max-age=31536000, immutable" if full_path.startswith("assets/") else "no-cache"
        return FileResponse(target, headers={"Cache-Control": cache})
    # index.html siempre se revalida, para que una compilación nueva se vea sin forzar recarga
    return FileResponse(static_dir / "index.html", headers={"Cache-Control": "no-cache"})
