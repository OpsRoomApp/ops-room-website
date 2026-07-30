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

app = FastAPI(title="OPS ROOM Admin API")

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


@app.get("/api/ping")
async def ping():
    return {"ok": True, "service": "opsroom-admin-api"}
