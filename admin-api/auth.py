"""OPS ROOM Admin API -- GitHub OAuth authentication with rate limiting.

Uses GitHub OAuth with JWT sessions stored in httpOnly secure cookies.
Only approved GitHub usernames (from APPROVED_GITHUB_USERS env var) are allowed.
All login attempts are audit-logged to an append-only log.
"""

from __future__ import annotations

import json
import logging
import secrets
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
import jwt
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
import allowlist
from clientip import client_ip
from config import (
    DISCORD_CLIENT_ID,
    DISCORD_CLIENT_SECRET,
    DISCORD_REDIRECT_URI,
    GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET,
    GITHUB_REDIRECT_URI,
    JWT_ALGORITHM,
    JWT_EXPIRY_HOURS,
    JWT_SECRET,
    LOG_FILE,
    RATE_LIMIT_LOGIN_PER_MIN,
)

_log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

SESSION_COOKIE = "opsroom_admin_session"
STATE_COOKIE = "opsroom_oauth_state"
COOKIE_KWARGS: dict[str, Any] = {
    "httponly": True,
    "secure": True,
    "samesite": "lax",
    "path": "/",
    "max_age": JWT_EXPIRY_HOURS * 3600,
}

# Simple in-memory rate limiter for login attempts.
_login_attempts: dict[str, list[float]] = defaultdict(list)


def _rate_limit(key: str, max_per_min: int) -> bool:
    """Return True if the request is within the rate limit."""
    now = time.time()
    window = now - 60
    attempts = [t for t in _login_attempts[key] if t > window]
    _login_attempts[key] = attempts
    if len(attempts) >= max_per_min:
        return False
    _login_attempts[key].append(now)
    return True


def _audit_log(entry: dict[str, Any]) -> None:
    """Write a structured audit log entry to the admin log file (append-only)."""
    entry.setdefault("time", datetime.now(timezone.utc).isoformat())
    entry.setdefault("version", "")
    entry.setdefault("filename", "")
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception:
        pass


def _create_token(username: str, avatar_url: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": username,
        "avatar": avatar_url,
        "iat": now,
        "exp": now + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_session(request: Request) -> dict[str, Any]:
    """Extract and verify the JWT from the session cookie.

    Returns the decoded payload on success.  Raises HTTPException(401) on
    any failure so route handlers can call this as a dependency.
    """
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    if not JWT_SECRET:
        raise HTTPException(status_code=500, detail="JWT secret not configured")

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid session")

    sub = str(payload.get("sub") or "")
    if sub.startswith("discord:"):
        # Discord session: sub is "discord:{username}"; the JWT carries the
        # Discord user ID in the custom "discord_id" claim (set at login).
        discord_id = str(payload.get("discord_id") or "")
        if not allowlist.is_allowed("discord", discord_id):
            raise HTTPException(status_code=403, detail="Not authorised")
    else:
        username = sub.lower()
        if not allowlist.is_allowed("github", username):
            raise HTTPException(status_code=403, detail="Not authorised")

    return payload


def _make_state() -> str:
    return secrets.token_urlsafe(32)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/login")
async def login(request: Request):
    """Redirect the user to GitHub for authorisation.

    Stores a CSRF state token in a short-lived cookie so the callback can
    verify the request was initiated by the same browser session.
    """
    # Rate limit
    ip = client_ip(request)
    if not _rate_limit(f"login:{ip}", RATE_LIMIT_LOGIN_PER_MIN):
        _log.warning("Rate limit hit for login from %s", ip[:20])
        raise HTTPException(status_code=429, detail="Too many login attempts. Please wait a minute and try again.")

    if not GITHUB_CLIENT_ID:
        raise HTTPException(status_code=500, detail="GitHub OAuth not configured")

    state = _make_state()
    params = {
        "client_id": GITHUB_CLIENT_ID,
        "redirect_uri": GITHUB_REDIRECT_URI,
        "scope": "read:user",
        "state": state,
    }
    qs = "&".join(f"{k}={v}" for k, v in params.items())

    response = RedirectResponse(f"https://github.com/login/oauth/authorize?{qs}")
    response.set_cookie(
        STATE_COOKIE,
        state,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/api/auth",
        max_age=600,
    )
    return response


@router.get("/callback")
async def callback(request: Request, code: str = "", state: str = ""):
    """GitHub redirects here after the user authorises the app."""
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorisation code")

    # Validate the OAuth state parameter to prevent CSRF.
    stored_state = request.cookies.get(STATE_COOKIE)
    if not stored_state or not secrets.compare_digest(stored_state, state):
        _log.warning("OAuth state mismatch or missing -- possible CSRF attempt")
        raise HTTPException(status_code=400, detail="Invalid state parameter. Please try logging in again.")

    if not GITHUB_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="GitHub OAuth not configured")

    # Exchange code for access token
    try:
        async with httpx.AsyncClient() as client:
            token_resp = await client.post(
                "https://github.com/login/oauth/access_token",
                json={
                    "client_id": GITHUB_CLIENT_ID,
                    "client_secret": GITHUB_CLIENT_SECRET,
                    "code": code,
                    "redirect_uri": GITHUB_REDIRECT_URI,
                },
                headers={"Accept": "application/json"},
                timeout=15,
            )
            token_data = token_resp.json()
    except Exception as exc:
        _log.error("GitHub token exchange network error: %s", exc)
        _audit_log({"action": "LOGIN_FAILED", "reason": "network_error", "detail": str(exc)[:200]})
        raise HTTPException(status_code=502, detail="GitHub authentication service unavailable")

    access_token = token_data.get("access_token")
    if not access_token:
        _log.warning("GitHub token exchange failed: %s", token_data)
        _audit_log({"action": "LOGIN_FAILED", "reason": "github_token_exchange_failed", "detail": str(token_data)[:200]})
        raise HTTPException(status_code=401, detail="GitHub authentication failed")

    # Fetch user info
    try:
        async with httpx.AsyncClient() as client:
            user_resp = await client.get(
                "https://api.github.com/user",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/json",
                },
                timeout=15,
            )
            user_data = user_resp.json()
    except Exception as exc:
        _log.error("GitHub user fetch error: %s", exc)
        _audit_log({"action": "LOGIN_FAILED", "reason": "user_fetch_failed", "detail": str(exc)[:200]})
        raise HTTPException(status_code=502, detail="GitHub API unavailable")

    github_username = str(user_data.get("login") or "").lower()
    if not allowlist.is_allowed("github", github_username):
        _log.warning("Unauthorised GitHub user attempted login: %s", github_username)
        _audit_log({"action": "LOGIN_FAILED", "user": github_username, "reason": "not_in_approved_list"})
        raise HTTPException(status_code=403, detail="Your GitHub account is not authorised for this admin panel.")

    avatar_url = str(user_data.get("avatar_url") or "")
    jwt_token = _create_token(github_username, avatar_url)

    _log.info("Admin login: %s", github_username)
    _audit_log({"action": "LOGIN_SUCCESS", "user": github_username})

    response = RedirectResponse("/", status_code=302)
    response.set_cookie(SESSION_COOKIE, jwt_token, **COOKIE_KWARGS)
    response.delete_cookie(STATE_COOKIE, path="/api/auth")
    return response

# ---------------------------------------------------------------------------
# Discord OAuth (v0.25.55 / C3) -- mirror of GitHub OAuth, both work side-by-side
# ---------------------------------------------------------------------------

@router.get("/discord/login")
async def discord_login(request: Request):
    """Redirect the user to Discord for authorisation."""
    ip = client_ip(request)
    if not _rate_limit(f"login:{ip}", RATE_LIMIT_LOGIN_PER_MIN):
        raise HTTPException(status_code=429, detail="Too many login attempts.")

    if not DISCORD_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Discord OAuth not configured")

    state = _make_state()
    params = {
        "client_id": DISCORD_CLIENT_ID,
        "redirect_uri": DISCORD_REDIRECT_URI,
        "response_type": "code",
        "scope": "identify",
        "state": state,
    }
    qs = "&".join(f"{k}={v}" for k, v in params.items())

    response = RedirectResponse(f"https://discord.com/api/oauth2/authorize?{qs}")
    response.set_cookie(STATE_COOKIE, state, httponly=True, secure=True, samesite="lax", path="/api/auth", max_age=600)
    return response


@router.get("/discord/callback")
async def discord_callback(request: Request, code: str = "", state: str = ""):
    """Discord redirects here after the user authorises the app."""
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorisation code")

    stored_state = request.cookies.get(STATE_COOKIE)
    if not stored_state or not secrets.compare_digest(stored_state, state):
        raise HTTPException(status_code=400, detail="Invalid state parameter.")

    if not DISCORD_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Discord OAuth not configured")

    # Exchange code for access token
    try:
        async with httpx.AsyncClient() as client:
            token_resp = await client.post(
                "https://discord.com/api/oauth2/token",
                data={
                    "client_id": DISCORD_CLIENT_ID,
                    "client_secret": DISCORD_CLIENT_SECRET,
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": DISCORD_REDIRECT_URI,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=15,
            )
            token_data = token_resp.json()
    except Exception as exc:
        _log.error("Discord token exchange error: %s", exc)
        raise HTTPException(status_code=502, detail="Discord authentication unavailable")

    access_token = token_data.get("access_token")
    if not access_token:
        raise HTTPException(status_code=401, detail="Discord authentication failed")

    # Fetch Discord user info
    try:
        async with httpx.AsyncClient() as client:
            user_resp = await client.get(
                "https://discord.com/api/users/@me",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=15,
            )
            user_data = user_resp.json()
    except Exception as exc:
        _log.error("Discord user fetch error: %s", exc)
        raise HTTPException(status_code=502, detail="Discord API unavailable")

    discord_id = str(user_data.get("id") or "")
    discord_username = str(user_data.get("username") or "")

    if not allowlist.is_allowed("discord", discord_id):
        _log.warning("Unauthorised Discord user: %s", discord_id)
        raise HTTPException(status_code=403, detail="Your Discord account is not authorised.")

    avatar_hash = user_data.get("avatar") or ""
    avatar_url = f"https://cdn.discordapp.com/avatars/{discord_id}/{avatar_hash}.png" if avatar_hash else ""

    jwt_token = _create_token(f"discord:{discord_username}", avatar_url)
    jwt_payload = jwt.decode(
        jwt_token, JWT_SECRET, algorithms=[JWT_ALGORITHM]
    )
    jwt_payload["discord_id"] = discord_id
    jwt_token = jwt.encode(jwt_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    _log.info("Admin login (Discord): %s", discord_username)

    response = RedirectResponse("/", status_code=302)
    response.set_cookie(SESSION_COOKIE, jwt_token, **COOKIE_KWARGS)
    response.delete_cookie(STATE_COOKIE, path="/api/auth")
    return response


@router.get("/session")
async def session(request: Request):
    """Return the current session info (used by the frontend to check auth)."""
    try:
        payload = verify_session(request)
        return {
            "authenticated": True,
            "username": payload.get("sub"),
            "avatar": payload.get("avatar"),
        }
    except HTTPException:
        return {"authenticated": False}


@router.post("/logout")
async def logout():
    """Clear the session cookie."""
    response = Response(status_code=204)
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response
