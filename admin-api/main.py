"""OPS ROOM Admin API -- FastAPI backend for the release administration panel.

Serves the admin.opsroom.live subdomain.  All write endpoints require a valid
GitHub OAuth JWT session.  Read endpoints are also authenticated.
"""

from __future__ import annotations

from fastapi import FastAPI, Request
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
import openaip    # OpenAIP airspace proxy (map enrichment)
import notams     # v0.25.63: DB-backed NOTAM serving endpoints
import rainviewer   # v0.25.80: server-cached RainViewer precipitation tiles
import notam_ingest  # v0.25.63: NOTAM bulk + incremental ingestion jobs
import transcripts  # v0.25.55 (C1)
import appeals     # v0.25.55 (C4)
import discord
import community   # community flight events + leaderboard + live feed
import bug_reports  # v0.25.x: desktop app bug report ingest + admin panel
import support       # v0.25.x: website /support contact form ingest + admin review
import flightsim     # v0.25.x: flightsim.to social-proof badge stats
import analytics_umami  # v0.25.x: Umami website analytics bridge (admin panel)

app = FastAPI(title="OPS ROOM Admin API")


# v0.25.80: the RainViewer precipitation endpoints are public, read-only,
# non-credentialed data served to the desktop app AND LAN tablets. The global
# CORS allowlist covers localhost only, so override it with a wildcard for
# this prefix. Registered after CORSMiddleware (outermost), it replaces the
# per-origin header for these routes with "*".
@app.middleware("http")
async def _rainviewer_cors(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/v1/rainviewer/"):
        response.headers["Access-Control-Allow-Origin"] = "*"
    return response


@app.on_event("startup")
async def _startup() -> None:
    """Start background tasks (transcript retention cleanup, allowlist seed)."""
    try:
        transcripts.start_cleanup_task()
    except Exception:
        pass
    try:
        notam_ingest.start_ingest_task()
    except Exception:
        pass
    try:
        rainviewer.start_tasks()
    except Exception:
        pass
    try:
        import allowlist
        allowlist.seed_from_env()
    except Exception:
        pass
    try:
        bug_reports.init_db()
    except Exception:
        pass
    try:
        support.init_db()
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
        "http://127.0.0.1:5173",
        "http://localhost:5173",
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
app.include_router(openaip.router)
app.include_router(notams.router)
app.include_router(rainviewer.router)
app.include_router(transcripts.router)
app.include_router(appeals.router)
app.include_router(discord.router)
app.include_router(community.router)
app.include_router(bug_reports.router)
app.include_router(support.router)
app.include_router(flightsim.router)
app.include_router(analytics_umami.router)


@app.get("/api/ping")
async def ping():
    return {"ok": True, "service": "opsroom-admin-api"}
