"""OPS ROOM Admin API -- FastAPI backend for the release administration panel.

Serves the admin.opsroom.live subdomain.  All write endpoints require a valid
GitHub OAuth JWT session.  Read endpoints are also authenticated.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import auth
import health
import releases
import analytics
import audit
import pricing
import licenses
import opensky
import nms        # v0.25.60: FAA NMS-API NOTAM proxy
import transcripts  # v0.25.55 (C1)
import appeals     # v0.25.55 (C4)
import discord

app = FastAPI(title="OPS ROOM Admin API")


@app.on_event("startup")
async def _startup() -> None:
    """Start background tasks (transcript retention cleanup, allowlist seed)."""
    try:
        transcripts.start_cleanup_task()
    except Exception:
        pass
    try:
        import allowlist
        allowlist.seed_from_env()
    except Exception:
        pass

# CORS: allow admin frontend, main website, and desktop app (localhost).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://admin.opsroom.live",
        "https://opsroom.live",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(releases.router)
app.include_router(health.router)
app.include_router(analytics.router)
app.include_router(audit.router)
app.include_router(pricing.router)
app.include_router(licenses.router)
app.include_router(opensky.router)
app.include_router(nms.router)
app.include_router(transcripts.router)
app.include_router(appeals.router)
app.include_router(discord.router)


@app.get("/api/ping")
async def ping():
    return {"ok": True, "service": "opsroom-admin-api"}
