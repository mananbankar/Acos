"""
Local-dev shim: supervisor runs `uvicorn server:app` from /app/backend, so this file must expose `app`.
The canonical FastAPI code lives at /app/frontend/server/app.py (single source of truth for the Vercel deploy).
This shim simply re-exports it so nothing changes for local development.
"""
import sys
from pathlib import Path

_CANONICAL = Path(__file__).resolve().parent.parent / "frontend" / "server"
sys.path.insert(0, str(_CANONICAL))

from app import app  # noqa: F401,E402
