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

# ---- Website support form (v0.25.x) ----
# Public contact form on opsroom.live/support. No secret (public by design);
# per-IP rate limiting is the primary spam defense.
SUPPORT_DB = Path(os.getenv("SUPPORT_DB", "/opt/opsroom-support/support.sqlite3"))
SUPPORT_RATE_LIMIT_PER_MIN = int(os.getenv("SUPPORT_RATE_LIMIT_PER_MIN", "5"))

# ---- flightsim.to social-proof badge (v0.25.x) ----
# Optional: when FLIGHTSIM_API_KEY + FLIGHTSIM_ADDON_ID are set, the website
# homepage badge shows the live rating/download count (server-cached 6h).
# Without a key the badge degrades to a plain link. Get a key from
# https://flightsim.to (developer API).
FLIGHTSIM_API_KEY = os.getenv("FLIGHTSIM_API_KEY", "").strip()
FLIGHTSIM_ADDON_ID = os.getenv("FLIGHTSIM_ADDON_ID", "").strip()
FLIGHTSIM_ADDON_URL = os.getenv("FLIGHTSIM_ADDON_URL", "").strip()
FLIGHTSIM_STATS_URL = os.getenv(
    "FLIGHTSIM_STATS_URL", "https://api.flightsim.to/v1/modules/{addon_id}"
).strip()

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

# ---- Umami website analytics (self-hosted, cookieless) ----
# Read-only bridge powering the admin panel Analytics page. The Umami
# service runs as a sibling container on the opsroom-net network; the
# admin-api talks to it directly. When UMAMI_USERNAME/PASSWORD are empty
# the bridge reports ``configured: false`` and the admin page shows a
# setup hint instead of numbers.
UMAMI_API_URL = os.getenv("UMAMI_API_URL", "http://umami:3000").strip()
UMAMI_USERNAME = os.getenv("UMAMI_USERNAME", "").strip()
UMAMI_PASSWORD = os.getenv("UMAMI_PASSWORD", "").strip()
UMAMI_WEBSITE_ID = os.getenv("UMAMI_WEBSITE_ID", "").strip()

# ---- Discord release notifications (incoming webhooks) ----
# Fired from publish_release the instant a release goes live. Empty URL =
# that channel's post is disabled. Webhooks need no bot permissions and are
# non-blocking (fire-and-forget tasks).
DISCORD_RELEASE_WEBHOOK_URL = os.getenv("DISCORD_RELEASE_WEBHOOK_URL", "").strip()
DISCORD_DOWNLOADS_WEBHOOK_URL = os.getenv("DISCORD_DOWNLOADS_WEBHOOK_URL", "").strip()
