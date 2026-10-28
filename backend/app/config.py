"""Configuración leída de variables de entorno (y de un archivo .env opcional)."""
from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BACKEND_DIR.parent
ENV_FILE = ROOT_DIR / ".env"


def _load_env_file() -> None:
    """Carga KEY=VALUE desde .env sin pisar variables que ya existan."""
    for candidate in (ROOT_DIR / ".env", BACKEND_DIR / ".env"):
        if not candidate.is_file():
            continue
        for raw in candidate.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_env_file()

DB_PATH = Path(os.environ.get("HQ_DB_PATH") or BACKEND_DIR / "data" / "hq.db")
STATIC_DIR = Path(os.environ.get("HQ_STATIC_DIR") or ROOT_DIR / "frontend" / "dist")
TELEGRAM_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
TZ_NAME = os.environ.get("HQ_TZ", "America/Bogota")
PUBLIC_URL = os.environ.get("HQ_PUBLIC_URL", "http://localhost:8000").rstrip("/")
DEFAULT_PROJECT = "bleepy"

# Bóveda de Obsidian que se sincroniza: vacío = buscarla sola en Google Drive; "off" = sin sincronización
VAULT_PATH = os.environ.get("HQ_VAULT_PATH", "").strip()
VAULT_CANDIDATES = [Path(r"G:\Mi unidad\Liiot"), Path(r"I:\Mi unidad\Liiot"), Path.home() / "Mi unidad" / "Liiot"]


def save_env_value(key: str, value: str) -> None:
    """Guarda (o quita, si value está vacío) una variable en .env sin tocar las demás líneas."""
    lines = ENV_FILE.read_text(encoding="utf-8").splitlines() if ENV_FILE.is_file() else []
    kept = [line for line in lines if not line.strip().startswith(f"{key}=")]
    if value:
        kept.append(f"{key}={value}")
    ENV_FILE.write_text("\n".join(kept) + "\n", encoding="utf-8")
    if value:
        os.environ[key] = value
    else:
        os.environ.pop(key, None)
