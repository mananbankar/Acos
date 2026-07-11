"""
Vercel Python Serverless entrypoint for ACOS backend.

This file exposes the FastAPI `app` from /app/backend/server.py as a serverless
handler for Vercel's Python runtime.

On Vercel:
- Any request to /api/* is rewritten (via vercel.json) to this function.
- The FastAPI app's own routes are already prefixed with /api, so no path stripping is needed.
- Long-running background tasks (scheduler_loop) are auto-disabled via the VERCEL env var.
"""
import os
import sys
from pathlib import Path

# Make the backend package importable regardless of where Vercel runs the function from
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend"))

# Vercel sets VERCEL=1 in its runtime — server.py uses this flag to skip the scheduler loop
os.environ.setdefault("VERCEL", "1")

from backend.server import app  # noqa: E402

# Vercel's Python runtime auto-detects an ASGI `app` object and serves it
handler = app
