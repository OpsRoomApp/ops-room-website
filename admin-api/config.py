"""OPS ROOM Admin API configuration.

All configuration is read from environment variables with safe defaults.
Secrets must never be hardcoded.
"""

import os
from pathlib import Path

# ---- Paths ----
RELEASES_DIR = Path(os.getenv("OPSROOM_RELEASES_DIR", "/opt/opsroom-releases"))
MANIFEST_PATH = RELEASES_DIR / "update.json"
TESTING_MANIFEST_PATH = RELEASES_DIR / "update-testing.json"
RELEASES_CATALOG_PATH = RELEASES_DIR / "releases.json"
LATEST_SYMLINK = RELEASES_DIR / "latest"
STAGED_PATH = RELEASES_DIR / "staged.json"
MANIFEST_BACKUP_DIR = RELEASES_DIR / ".manifest-backups"
ANALYTICS_DB_PATH = RELEASES_DIR / ".downloads.jsonl"
ANALYTICS_SALT = os.getenv("ANALYTICS_SALT", os.getenv("JWT_SECRET", "change-me")).strip()

# ---- GitHub OAuth ----
GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "").strip()
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "").strip()
GITHUB_REDIRECT_URI = os.getenv("GITHUB_REDIRECT_URI", "https://admin.opsroom.live/api/auth/callback").strip()

# Comma-separated list of GitHub usernames allowed to access the admin panel.
APPROVED_USERS = set(
    u.strip().lower()
    for u in os.getenv("APPROVED_GITHUB_USERS", "").split(",")
    if u.strip()
)

# ---- JWT ----
JWT_SECRET = os.getenv("JWT_SECRET", "").strip()
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = int(os.getenv("JWT_EXPIRY_HOURS", "8"))

# ---- Upload limits ----
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "500"))

# ---- Rate limiting ----
RATE_LIMIT_LOGIN_PER_MIN = int(os.getenv("RATE_LIMIT_LOGIN_PER_MIN", "10"))
RATE_LIMIT_UPLOAD_PER_MIN = int(os.getenv("RATE_LIMIT_UPLOAD_PER_MIN", "5"))

# v0.25.80 -- RainViewer precipitation tile cache (server-cached proxy).
RAINVIEWER_CACHE_DIR = Path(os.getenv("RAINVIEWER_CACHE_DIR", "/opt/opsroom-rainviewer"))

# ---- Logging ----
LOG_FILE = Path(os.getenv("ADMIN_LOG_FILE", "/var/log/opsroom-admin.log"))

# ---- Analytics retention (days) ----
ANALYTICS_RETENTION_DAYS = int(os.getenv("ANALYTICS_RETENTION_DAYS", "90"))

# v0.25.55 -- Transcript retention (C1)
TRANSCRIPT_RETENTION_DAYS = int(os.getenv("TRANSCRIPT_RETENTION_DAYS", "14"))

# ---- Bug reports (v0.25.x) ----
# Shared ingest secret shipped inside the desktop binary. It is a spam gate,
# not a real credential (anyone with the app can read it) - the per-IP rate
# limit below is the primary defense. Rotating it requires shipping a matching
# desktop build, so keep the default in sync with app/bug_report.py:
# DEFAULT_SECRET in the ops-room-private-development repo.
BUG_REPORT_SECRET = os.getenv(
    "BUG_REPORT_SECRET",
    "e7eb1adf7e094220a3f5ad89fcf6d01ce4194a0fe4b2452f9415b97d808bbbab",
).strip()
BUG_REPORTS_DB = Path(os.getenv("BUG_REPORTS_DB", "/opt/opsroom-bug-reports/bug_reports.sqlite3"))
BUG_REPORTS_STORAGE_DIR = Path(os.getenv("BUG_REPORTS_STORAGE_DIR", "/opt/opsroom-bug-reports"))
BUG_REPORTS_RATE_LIMIT_PER_MIN = int(os.getenv("BUG_REPORTS_RATE_LIMIT_PER_MIN", "10"))

# v0.25.55 -- Discord OAuth (C3)
DISCORD_CLIENT_ID = os.getenv("DISCORD_CLIENT_ID", "")
DISCORD_CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET", "")
DISCORD_REDIRECT_URI = os.getenv("DISCORD_REDIRECT_URI", "https://admin.opsroom.live/api/auth/discord/callback")
APPROVED_DISCORD_USERS = set(
    uid.strip().lower() for uid in os.getenv("APPROVED_DISCORD_USERS", "").split(",") if uid.strip()
)

# End-user Discord app-connect (desktop app "Connect Discord"). Separate
# redirect so an end-user connect can never touch the admin allowlist. This
# MUST be registered verbatim in the Discord Developer Portal (OAuth2 > Redirects)
# and match the community router's /connect/callback route exactly.
DISCORD_APP_CONNECT_REDIRECT_URI = os.getenv(
    "DISCORD_APP_CONNECT_REDIRECT_URI",
    "https://admin.opsroom.live/api/community/connect/callback",
)

# Optional ops/testing bypass for community event ingestion. When set, a bearer
# header matching this token lets the caller supply discord_id directly. Normal
# end users authenticate with their per-user app_token from the connect flow
# instead -- the desktop app never needs this secret.
COMMUNITY_EVENT_TOKEN = os.getenv("COMMUNITY_EVENT_TOKEN", "")
