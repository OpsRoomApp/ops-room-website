"""OPS ROOM Admin API — FastAPI backend for the release administration panel.

Serves the admin.opsroom.live subdomain.  All write endpoints require a valid
GitHub OAuth JWT session.  Read endpoints are also authenticated.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import auth
import health
import releases

app = FastAPI(title="OPS ROOM Admin API", version="0.25.13")

# CORS: allow the admin frontend origin (served from the same nginx, but
# the browser sees different origins for API calls).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://admin.opsroom.live"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(releases.router)
app.include_router(health.router)


@app.get("/api/ping")
async def ping():
    return {"ok": True, "service": "opsroom-admin-api"}
