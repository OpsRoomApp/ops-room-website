# OPS ROOM v0.25.55 — VPS Deployment Runbook

Covers three components deployed from two repos:

| Component | Repo | Compose file | Service(s) |
|---|---|---|---|
| OPS CONTROL Discord bot | `ops-control-bot` | `docker-compose.yml` | `bot` |
| Public website (nginx + SPA) | `opsroom-website` | `docker-compose.yml` | `opsroom-website` |
| Admin API (FastAPI) | `opsroom-website` | `docker-compose.yml` | `admin-api` |

The website compose deploys **both** the nginx front-end and the admin API on one
Docker network (`opsroom-net`); the bot runs as its own standalone compose project.

---

## 1. Host prerequisites

- Docker Engine 24+ and Docker Compose v2 (`docker compose version`).
- DNS A records for `opsroom.live`, `www.opsroom.live`, and `admin.opsroom.live`
  pointing at the VPS IP.
- Firewall (ufw / firewalld) open on **80/tcp** and **443/tcp**.
- Recommended directory layout (used by the compose mounts):

```
/opt/ops-control-bot/        # bot repo checkout  (MUST be here — see §5 path agreement)
/opt/opsroom-website/        # website repo checkout
/opt/opsroom-releases/       # release artifacts (update.json + installers), mounted read-only
/opt/opsroom-transcripts/    # hosted ticket transcript storage (shared volume)
/opt/opsroom/certbot/        # ACME webroot for certbot
```

```bash
sudo mkdir -p /opt/opsroom-releases /opt/opsroom-transcripts /opt/opsroom/certbot \
             /opt/ops-control-bot/data
```

---

## 2. Discord application setup (Developer Portal)

1. Create an application at https://discord.com/developers/applications.
2. **Bot** tab → Reset/Copy the token → this is `DISCORD_TOKEN`.
3. **OAuth2 → General**: add redirect URI `https://admin.opsroom.live/api/auth/discord/callback`
   (this is `DISCORD_REDIRECT_URI`). Grant the `identify` scope.
4. **OAuth2** tab → copy Client ID (`DISCORD_CLIENT_ID`) and Client Secret
   (`DISCORD_CLIENT_SECRET`).

> **Bot token vs client secret — not the same thing.** The **bot token**
> (`DISCORD_TOKEN`) authenticates the bot as the bot *user* (gateway + all
> commands) and lives in the **bot** `.env`. The **client secret**
> (`DISCORD_CLIENT_SECRET`) is an OAuth2 credential used *only* by the admin
> panel's "Sign in with Discord" button (it is never read by the bot) and lives
> in the **website** `.env`. Discord only ever *shows* the client secret once
> at creation — to see it again you must click **Reset Secret**, which is safe:
> it does not touch the bot token, the bot keeps running, and no prior admin
> sessions are invalidated (only future OAuth logins use the new secret). Since
> v0.25.55 is not deployed yet, resetting now breaks nothing — just copy the
> new value straight into `opsroom-website/.env` and keep it out of git.

5. Invite the bot to the guild with the needed permissions (Manage Channels,
   Manage Roles, Moderate Members, Send Messages, Manage Messages,
   Read Message History, Attach Files, View Channels).
6. Collect the guild ID (`GUILD_ID`), your owner user ID (`OWNER_USER_ID`),
   and the arrival/ticket/beta channel + role IDs (see bot `.env.example`).

## 3. GitHub OAuth app setup (admin login)

1. https://github.com/settings/developers → New OAuth App.
2. Homepage URL: `https://admin.opsroom.live`
3. Authorization callback URL: `https://admin.opsroom.live/api/auth/callback`
   (this is `GITHUB_REDIRECT_URI`).
4. Copy Client ID / Client Secret into the website `.env`.

---

## 4. Bot deployment (`ops-control-bot`)

### 4.1 `.env`

```bash
cd /opt/ops-control-bot
cp .env.example .env
# edit .env
```

**Required (bot will not start without these):**

```dotenv
DISCORD_TOKEN=           # Discord Developer Portal bot token
GUILD_ID=                # Discord guild (server) ID
OWNER_USER_ID=           # Your Discord user ID
ARRIVALS_CHANNEL_ID=     # Welcome-message channel ID
```

**Strongly recommended** (tickets, beta, audit — see `.env.example` for current IDs):
`DISCORD_ANNOUNCEMENT_CHANNEL`, `LOG_CHANNEL_ID`, `SUPPORT_CATEGORY_ID`,
`BUG_REPORTS_CHANNEL_ID`, `TICKET_TRANSCRIPT_CHANNEL_ID`,
`SUPPORT_DISPATCH_ROLE_ID`, `MODERATOR_ROLE_ID`, `OPS_CONTROL_ROLE_ID`,
`DEVELOPER_ROLE_ID`, `BETA_COORDINATOR_ROLE_ID`, `VERIFIED_TESTER_ROLE_ID`,
`PUBLIC_BETA_ROLE_ID`.

**Optional / feature-gated:**

```dotenv
# SimBrief (no API key; optional default account for route links)
SIMBRIEF_USER_ID=
SIMBRIEF_STATIC_ID=

# Where2Fly route provider (optional; falls back to local engine without token)
WHERE2FLY_ENABLED=true
WHERE2FLY_API_TOKEN=
WHERE2FLY_API_BASE_URL=https://where2fly.today/
WHERE2FLY_TIMEOUT_SECONDS=15

# v0.25.55 moderation + mute (B2)
MOD_LOG_CHANNEL_ID=
MUTED_ROLE_ID=

# v0.25.55 VATSIM event reminders (B3)
VATSIM_EVENTS_CHANNEL_ID=

# v0.25.55 admin API integration (B1 hosted transcripts, C4 appeals)
ADMIN_API_BASE_URL=https://admin.opsroom.live
ADMIN_API_TOKEN=         # MUST equal ADMIN_API_TOKEN in the website .env
APPEAL_FORM_URL=https://opsroom.live/appeal

# Pending action dispatcher
PENDING_ACTION_POLL_SECONDS=15
PENDING_ACTION_MAX_ATTEMPTS=3
```

> **Critical path agreement:** the admin API reads the bot's live SQLite database
> through the volume `/opt/ops-control-bot/data:/ops-control-data` (see §5). The
> bot repo **must live at `/opt/ops-control-bot`** and the compose already pins
> `DATABASE_PATH=/app/data/ops-control.db`, so the DB lands at
> `/opt/ops-control-bot/data/ops-control.db` on the host.

### 4.2 Build & start

```bash
cd /opt/ops-control-bot
docker compose up -d --build
docker compose ps
docker compose logs -f bot        # Ctrl-C to detach
```

Healthy startup shows: DB schema verified, migrations run, moderation / roles /
vatsim_events cogs loaded, pending-action poller started. Any
`AttributeError: 'Config' object has no attribute ...` on startup means the
installed source is older than v0.25.55 — update the checkout.

### 4.3 Verify the bot

- Send `/ping` in the guild → the bot replies.
- Send `/help` → moderation commands (`/warn /kick /ban /timeout /mute /unmute`)
  and `/rolepanel` appear.
- Close a test ticket (see §7.2) and confirm the transcript flow.

---

## 5. Website + admin API deployment (`opsroom-website`)

### 5.1 `.env`

```bash
cd /opt/opsroom-website
cp .env.example .env
# edit .env
```

Generate secrets first:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(64))"   # JWT_SECRET
python3 -c "import secrets; print(secrets.token_urlsafe(32))"   # ANALYTICS_SALT (optional)
```

**Required:**

```dotenv
# Admin panel auth
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_REDIRECT_URI=https://admin.opsroom.live/api/auth/callback
APPROVED_GITHUB_USERS=            # comma-separated GitHub usernames
JWT_SECRET=                       # random 64-byte value; signs admin sessions

# v0.25.55 Discord login (C3)
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_REDIRECT_URI=https://admin.opsroom.live/api/auth/discord/callback
APPROVED_DISCORD_USERS=           # comma-separated Discord user IDs
```

**Required for hosted transcripts + appeals (v0.25.55 B1/C1/C4):**

```dotenv
TRANSCRIPT_RETENTION_DAYS=14
ADMIN_API_TOKEN=                  # MUST equal ADMIN_API_TOKEN in bot .env
```

**Optional:** `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET`, `ANALYTICS_SALT`,
`RATE_LIMIT_LOGIN_PER_MIN=10`, `RATE_LIMIT_UPLOAD_PER_MIN=5`,
`ANALYTICS_RETENTION_DAYS=90`, `VITE_PAYMENT_ENABLED=false`.

> **Allowlist source of truth:** on first boot the admin API seeds the
> `staff_allowlist` table from `APPROVED_GITHUB_USERS` / `APPROVED_DISCORD_USERS`.
> After that, the admin panel's Staff Allowlist page manages the table directly;
> the env vars are seed values only.

### 5.2 Build & start

```bash
cd /opt/opsroom-website
docker compose up -d --build
docker compose ps
```

Expected: `opsroom-website` (nginx, ports 80/443) and `opsroom-admin-api`
(FastAPI, bound to `127.0.0.1:8000` on the host, reachable inside the compose
network as `admin-api:8000`).

Host-level health checks:

```bash
curl -fsS http://localhost/health                     # nginx -> 200 OK
curl -fsS http://localhost:8000/api/ping              # admin-api health
docker compose logs -f opsroom-admin-api              # startup logs
```

### 5.3 Nginx configuration checks

The nginx config is baked into the image from `nginx.conf`. Verify it parses and
matches expectations:

```bash
docker exec opsroom-website nginx -t
docker exec opsroom-website nginx -T | grep -A3 "location /api/v1"
```

What the baked-in config does:

- **Main site `opsroom.live` / `www.opsroom.live`**: redirects HTTP→HTTPS; serves
  the public SPA; proxies **only** `/api/v1/transcripts/` and `/api/v1/appeals/`
  to `admin-api:8000`; serves `/downloads/`, `/api/update.json` and `/health`.
- **Admin `admin.opsroom.live`**: redirects HTTP→HTTPS; serves the admin SPA;
  proxies the full `/api/` namespace to `admin-api:8000`.
- **TLS**: both 443 blocks use
  `/etc/letsencrypt/live/opsroom.live/fullchain.pem` / `privkey.pem`, so the
  certificate **must cover `admin.opsroom.live` as a SAN** as well.

### 5.4 TLS (certbot)

```bash
# First issuance (webroot matches the acme-challenge roots in nginx.conf):
sudo certbot certonly --webroot -w /opt/opsroom/certbot \
    -d opsroom.live -d www.opsroom.live -d admin.opsroom.live

# Renewal (cron/systemd timer): renew --webroot, then reload nginx
docker exec opsroom-website nginx -s reload
```

If the certificate does not yet exist when the container first starts, nginx will
fail to bind 443 — restart the container after issuing the cert:
`docker compose restart opsroom-website`.

---

## 6. First-boot smoke tests (run in order)

### 6.1 Admin API reachable

```bash
curl -fsS https://admin.opsroom.live/api/ping          # through nginx
curl -fsS https://opsroom.live/health                  # main site health
```

### 6.2 GitHub + Discord login (C3)

1. Visit `https://admin.opsroom.live` → **Sign in with GitHub** → authorize.
   You must be in `APPROVED_GITHUB_USERS` (seeded into `staff_allowlist`).
2. Log out → **Sign in with Discord** → authorize with the `identify` scope.
   Your Discord user ID must be in `APPROVED_DISCORD_USERS`.
3. Both paths should land on the same dashboard with a valid session
   (`/api/auth/session` returns `authenticated: true` when logged in,
   `authenticated: false` otherwise).
4. Confirm the allowlist table was seeded:

```bash
docker exec opsroom-admin-api python -c "import sqlite3;c=sqlite3.connect('/ops-control-data/ops-control.db');print(c.execute('select provider,identifier from staff_allowlist').fetchall())"
```

### 6.3 Hosted ticket transcript (B1/C1) — end-to-end

1. In Discord: create a support ticket → staff clicks **Claim** → **Close** and
   enters a close reason.
2. The bot POSTs the transcript to
   `https://admin.opsroom.live/api/v1/transcripts/store` with
   `Authorization: Bearer $ADMIN_API_TOKEN`.
3. Verify the stored file + DB columns:

```bash
docker exec opsroom-admin-api ls -la /opt/opsroom-transcripts
docker exec opsroom-admin-api python -c "import sqlite3;c=sqlite3.connect('/ops-control-data/ops-control.db');print(c.execute('select id,status,close_reason,transcript_url from tickets order by id desc limit 3').fetchall())"
```

4. Open the hosted link (posted in the archive channel and DMed to the creator):
   `https://opsroom.live/transcripts/<ticket_id>` → message-bubble view with the
   metadata header and close reason.
5. Click **Download PDF** → `https://opsroom.live/api/v1/transcripts/<ticket_id>/pdf`
   returns a PDF.
6. If the public link 404s, check nginx proxy (6.3) and that the admin API
   container is on `opsroom-net`.

### 6.4 Public appeal form (C4)

1. `curl -fsS https://opsroom.live/appeal` → 200 (SPA route).
2. Submit a test appeal with a Discord username/ID + statement → 201/200.
3. In the admin panel → Discord → Appeals → the entry appears as `pending`;
   approve it → the bot picks up the `moderation_reverse` pending action and
   actually reverses the ban/timeout (verify in the bot logs).
4. `curl -fsS -X POST https://opsroom.live/api/v1/appeals/submit -H 'Content-Type: application/json' -d '{}'`
   → returns a server-side validation error response (do not rely on this
   for a real submission; it also counts against the per-IP rate limit).

### 6.5 Bot ↔ admin API wiring

```bash
cd /opt/ops-control-bot && docker compose logs --tail=100 bot | grep -i "transcript\|admin-api\|poller"
```

Expect no `admin-api unreachable` / `admin-api rejected (401)` lines after the
6.3 close. If you see them:

- `admin-api unreachable` → `ADMIN_API_BASE_URL` wrong, nginx not proxying,
  or admin-api container down.
- `admin-api rejected (401/403)` → `ADMIN_API_TOKEN` mismatch between bot `.env`
  and website `.env`.

---

## 7. Operations notes

- **Backups** — before every upgrade, back up the bot DB and the transcript dir:

```bash
cp /opt/ops-control-bot/data/ops-control.db /opt/ops-control-bot/data/ops-control.db.bak-$(date +%F)
tar czf /opt/opsroom-transcripts-backup-$(date +%F).tar.gz /opt/opsroom-transcripts
```

- **Migrations** are idempotent and run automatically at bot startup
  (`init_db` + `run_migrations`); the v0.25.55 work order added a dry-run test
  proving a second run is a clean no-op.
- **Transcript retention** is enforced by a cleanup task on the admin API using
  `TRANSCRIPT_RETENTION_DAYS` (default 14).
- **Rollback**: `docker compose down` in the affected repo, check out the
  previous tag, `docker compose up -d --build` again. The bot DB is forward-
  compatible; restore the `.bak` file only if you need to go back to a version
  before the v0.25.55 schema additions.

---

## 8. Troubleshooting quick reference

| Symptom | Likely cause / fix |
|---|---|
| Bot won't start: `Config has no attribute ...` | Checkout older than v0.25.55; update source |
| `/transcripts/<id>` 404s | admin-api down; nginx proxy path; transcript volume missing; retention task deleted it |
| PDF download fails | `fpdf2` present in admin-api image (in requirements.txt); check admin-api logs |
| Bot log: `admin-api unreachable` | `ADMIN_API_BASE_URL` wrong / nginx not proxying / container down |
| Bot log: `admin-api rejected (401/403)` | `ADMIN_API_TOKEN` differs between bot and website `.env` |
| Discord login fails | Redirect URI mismatch; user not in `APPROVED_DISCORD_USERS`; `DISCORD_CLIENT_ID/SECRET` wrong |
| GitHub login fails | Callback URI mismatch; user not in `APPROVED_GITHUB_USERS` |
| Session invalid after restart | `JWT_SECRET` changed; pin a stable value |
| Admin panel shows "bot database unavailable" | `OPS_CONTROL_DB` volume path mismatch; bot repo not at `/opt/ops-control-bot` |
| nginx won't bind 443 | Cert missing or SANs don't include `admin.opsroom.live`; issue/renew cert, restart container |
| `/api/v1/transcripts/` returns 502 | admin-api not running or not on `opsroom-net` |
