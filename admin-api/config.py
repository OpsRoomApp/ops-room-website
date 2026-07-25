"""OPS ROOM Admin API configuration.

All configuration is read from environment variables with safe defaults.
Secrets must never be hardcoded.
"""

import os
from pathlib import Path

# ---- Paths ----
RELEASES_DIR = Path(os.getenv("OPSROOM_RELEASES_DIR", "/opt/opsroom-releases"))
MANIFEST_PATH = RELEASES_DIR / "update.json"
LATEST_SYMLINK = RELEASES_DIR / "latest"
STAGED_PATH = RELEASES_DIR / "staged.json"
MANIFEST_BACKUP_DIR = RELEASES_DIR / ".manifest-backups"

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

# ---- Logging ----
LOG_FILE = Path(os.getenv("ADMIN_LOG_FILE", "/var/log/opsroom-admin.log"))
