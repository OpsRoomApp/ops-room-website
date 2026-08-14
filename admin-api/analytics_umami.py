"""OPS ROOM Admin API -- Umami website analytics bridge (v0.25.x).

Proxies the self-hosted Umami analytics service (opsroom.live /umami.js +
/api/send) to the admin panel. Reads only: overview, top pages, referrers,
browsers, devices, countries and active visitors for the configured website.

Umami is cookieless and GDPR-friendly; no consent banner is required for the
public site. The bridge authenticates to Umami's REST API with the dashboard
account (UMAMI_USERNAME / UMAMI_PASSWORD) and caches the session token.

Configuration (env):
    UMAMI_API_URL       base URL of the Umami instance, e.g. http://umami:3000
    UMAMI_USERNAME      Umami dashboard account (admin or view-only)
    UMAMI_PASSWORD      password for that account
    UMAMI_WEBSITE_ID    website id (uuid); when empty, the first website in
                        the account is used.

When not configured every endpoint returns
``{"ok": false, "configured": false}`` and the admin panel shows a setup hint
instead of numbers.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any

import httpx
from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse

from auth import verify_session
from config import (
    UMAMI_API_URL,
    UMAMI_PASSWORD,
    UMAMI_USERNAME,
    UMAMI_WEBSITE_ID,
)

_log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analytics/web", tags=["analytics-web"])

_token: dict[str, Any] = {"token": None, "at": 0.0}

_PERIODS = {
    "24h": 24 * 3600,
    "7d": 7 * 86400,
    "30d": 30 * 86400,
    "90d": 90 * 86400,
}


def _configured() -> bool:
    return bool(UMAMI_API_URL and UMAMI_USERNAME and UMAMI_PASSWORD)


async def _login(client: httpx.AsyncClient) -> str | None:
    """Return a valid Umami session token, logging in on demand."""
    if _token["token"] and time.time() - _token["at"] < 23 * 3600:
        return _token["token"]
    try:
        resp = await client.post(
            f"{UMAMI_API_URL.rstrip('/')}/api/auth/login",
            json={"username": UMAMI_USERNAME, "password": UMAMI_PASSWORD},
            timeout=15.0,
        )
        if resp.status_code != 200:
            _log.warning("Umami login HTTP %s", resp.status_code)
            return None
        data = resp.json()
        tok = data.get("token")
        if tok:
            _token["token"] = tok
            _token["at"] = time.time()
        return tok
    except Exception as exc:
        _log.warning("Umami login failed: %s", exc)
        return None


async def _resolve_website_id(client: httpx.AsyncClient, token: str) -> str | None:
    """Website id from env, falling back to the first website in the account."""
    if UMAMI_WEBSITE_ID:
        return UMAMI_WEBSITE_ID
    try:
        resp = await client.get(
            f"{UMAMI_API_URL.rstrip('/')}/api/websites?page=1&pageSize=1",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15.0,
        )
        if resp.status_code != 200:
            return None
        rows = resp.json().get("data") or []
        return rows[0]["id"] if rows else None
    except Exception as exc:
        _log.warning("Umami website lookup failed: %s", exc)
        return None


async def _api_get(client: httpx.AsyncClient, path: str, params: dict[str, Any]) -> dict[str, Any] | None:
    """GET an Umami API path with token auth; refresh the token once on 401."""
    token = await _login(client)
    if not token:
        return None
    headers = {"Authorization": f"Bearer {token}"}
    url = f"{UMAMI_API_URL.rstrip('/')}{path}"
    try:
        resp = await client.get(url, headers=headers, params=params, timeout=20.0)
        if resp.status_code == 401:
            _token["token"] = None
            token = await _login(client)
            if not token:
                return None
            resp = await client.get(
                url, headers={"Authorization": f"Bearer {token}"}, params=params, timeout=20.0
            )
        if resp.status_code != 200:
            _log.warning("Umami GET %s HTTP %s", path, resp.status_code)
            return None
        return resp.json()
    except Exception as exc:
        _log.warning("Umami GET %s failed: %s", path, exc)
        return None


def _period_window(period: str) -> tuple[int, int]:
    now = int(time.time() * 1000)
    delta = _PERIODS.get(period, _PERIODS["7d"]) * 1000
    return now - delta, now


async def _site(
    client: httpx.AsyncClient, token: str, path: str, period: str, extra: dict[str, Any] | None = None
) -> dict[str, Any] | None:
    site_id = await _resolve_website_id(client, token)
    if not site_id:
        return None
    start, end = _period_window(period)
    params: dict[str, Any] = {"startAt": start, "endAt": end, "period": period}
    if extra:
        params.update(extra)
    data = await _api_get(client, f"/api/websites/{site_id}{path}", params)
    if data is None:
        return None
    data["websiteId"] = site_id
    return data


def _metrics_rows(data: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not data:
        return []
    rows = data.get("rows") or []
    out = []
    for r in rows:
        if isinstance(r, dict):
            out.append({"label": r.get("x"), "value": r.get("y")})
        elif isinstance(r, (list, tuple)) and len(r) == 2:
            out.append({"label": r[0], "value": r[1]})
    return out


async def _overview(client: httpx.AsyncClient, token: str, period: str) -> dict[str, Any] | None:
    site_id = await _resolve_website_id(client, token)
    if not site_id:
        return None
    start, end = _period_window(period)
    params = {"startAt": start, "endAt": end, "period": period}
    stats = await _api_get(client, f"/api/websites/{site_id}/stats", params)
    if stats is None:
        return None
    active = await _api_get(client, f"/api/websites/{site_id}/active", {})
    overview = {
        "websiteId": site_id,
        "pageviews": stats.get("pageviews", 0),
        "visitors": stats.get("visitors", 0),
        "visits": stats.get("visits", 0),
        "bounces": stats.get("bounces", 0),
        "bounceRate": stats.get("bounceRate", 0),
        "totalTime": stats.get("totaltime", 0),
        "averageTime": stats.get("averageTime", 0),
        "active": int(active or 0) if isinstance(active, (int, float)) else 0,
    }
    return overview


@router.get("/status")
async def status(_session: dict = Depends(verify_session)):
    """Configuration + connection status for the admin panel setup hint."""
    if not _configured():
        return {"ok": False, "configured": False}
    async with httpx.AsyncClient() as client:
        token = await _login(client)
        if not token:
            return {"ok": False, "configured": True, "error": "Umami login failed"}
        site_id = await _resolve_website_id(client, token)
        return {"ok": True, "configured": True, "websiteId": site_id}


@router.get("/overview")
async def overview(period: str = Query("7d"), _session: dict = Depends(verify_session)):
    if not _configured():
        return {"ok": False, "configured": False}
    async with httpx.AsyncClient() as client:
        token = await _login(client)
        if not token:
            return JSONResponse({"ok": False, "configured": True, "error": "Umami login failed"}, status_code=502)
        data = await _overview(client, token, period)
        if data is None:
            return JSONResponse({"ok": False, "configured": True, "error": "Umami data unavailable"}, status_code=502)
        data["ok"] = True
        data["configured"] = True
        return data


@router.get("/top-pages")
async def top_pages(period: str = Query("7d"), limit: int = Query(10), _session: dict = Depends(verify_session)):
    if not _configured():
        return {"ok": False, "configured": False}
    async with httpx.AsyncClient() as client:
        token = await _login(client)
        if not token:
            return JSONResponse({"ok": False, "configured": True, "error": "Umami login failed"}, status_code=502)
        data = await _site(client, token, "/metrics", period, {"type": "url", "limit": min(limit, 50)})
        return {"ok": True, "configured": True, "rows": _metrics_rows(data)}


@router.get("/referrers")
async def referrers(period: str = Query("7d"), limit: int = Query(10), _session: dict = Depends(verify_session)):
    if not _configured():
        return {"ok": False, "configured": False}
    async with httpx.AsyncClient() as client:
        token = await _login(client)
        if not token:
            return JSONResponse({"ok": False, "configured": True, "error": "Umami login failed"}, status_code=502)
        data = await _site(client, token, "/metrics", period, {"type": "referrer", "limit": min(limit, 50)})
        return {"ok": True, "configured": True, "rows": _metrics_rows(data)}


@router.get("/browsers")
async def browsers(period: str = Query("7d"), limit: int = Query(10), _session: dict = Depends(verify_session)):
    if not _configured():
        return {"ok": False, "configured": False}
    async with httpx.AsyncClient() as client:
        token = await _login(client)
        if not token:
            return JSONResponse({"ok": False, "configured": True, "error": "Umami login failed"}, status_code=502)
        data = await _site(client, token, "/metrics", period, {"type": "browser", "limit": min(limit, 50)})
        return {"ok": True, "configured": True, "rows": _metrics_rows(data)}


@router.get("/devices")
async def devices(period: str = Query("7d"), limit: int = Query(10), _session: dict = Depends(verify_session)):
    if not _configured():
        return {"ok": False, "configured": False}
    async with httpx.AsyncClient() as client:
        token = await _login(client)
        if not token:
            return JSONResponse({"ok": False, "configured": True, "error": "Umami login failed"}, status_code=502)
        data = await _site(client, token, "/metrics", period, {"type": "device", "limit": min(limit, 50)})
        return {"ok": True, "configured": True, "rows": _metrics_rows(data)}


@router.get("/countries")
async def countries(period: str = Query("7d"), limit: int = Query(10), _session: dict = Depends(verify_session)):
    if not _configured():
        return {"ok": False, "configured": False}
    async with httpx.AsyncClient() as client:
        token = await _login(client)
        if not token:
            return JSONResponse({"ok": False, "configured": True, "error": "Umami login failed"}, status_code=502)
        data = await _site(client, token, "/metrics", period, {"type": "country", "limit": min(limit, 50)})
        return {"ok": True, "configured": True, "rows": _metrics_rows(data)}
