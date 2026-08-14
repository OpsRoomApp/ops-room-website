# OPS ROOM Bug Reports — Server Migration + Admin Panel (v0.25.x)

Moves the desktop app's in-app **Report Bug** flow off the legacy Google Apps
Script endpoint onto the OPS ROOM server (SQLite + diagnostics ZIP storage) with
an admin panel page. The desktop UI is unchanged — the client posts the exact
same JSON contract it used before.

---

## 1. What changed

### Website repo (`opsroom-website`)

| File | Change |
|---|---|
| `admin-api/bug_reports.py` | **New.** FastAPI router: public ingest + admin list/stats/detail/download/update. SQLite schema init, per-IP rate limit, base64 ZIP validation. |
| `admin-api/tests/test_bug_reports.py` | **New.** Standalone smoke test (17 checks) covering the exact desktop contract. Run: `cd admin-api && python tests/test_bug_reports.py` |
| `admin-api/config.py` | Added `BUG_REPORT_SECRET`, `BUG_REPORTS_DB`, `BUG_REPORTS_STORAGE_DIR`, `BUG_REPORTS_RATE_LIMIT_PER_MIN`. |
| `admin-api/main.py` | Registers `bug_reports.router`; calls `bug_reports.init_db()` at startup. |
| `admin/src/pages/BugReports.jsx` | **New.** Admin panel page: stats, filters, table, detail, status/notes, ZIP download. |
| `admin/src/App.jsx`, `admin/src/components/Layout.jsx` | Route + nav link (`/bug-reports`). |
| `nginx.conf` | Ingest is served on the **admin vhost** (`admin.opsroom.live`): its existing `location /api/` proxy already forwards `/api/v1/bug-reports` to `admin-api:8000` with a 600m body cap (the base64 ZIP payload is ~11 MB). The temporarily-added main-site location block was removed. |
| `docker-compose.yml` | Bug report env vars + `/opt/opsroom-bug-reports` volume. |
| `DEPLOYMENT_BUG_REPORTS.md` | This runbook. |

### Desktop app repo (`ops-room-private-development`, `opsroom-app/source`)

| File | Change |
|---|---|
| `app/bug_report.py` | `DEFAULT_ENDPOINT` → `https://admin.opsroom.live/api/v1/bug-reports`; provider `opsroom_server`; neutral error text. |
| `app/settings_store.py` | New defaults + one-time load-time migration that rewrites the legacy Apps Script URL in existing `settings.json` files (custom endpoints are never touched). |
| `app/static/opsroom.js` | Success line "Diagnostics uploaded to Google Drive." → "Diagnostics uploaded." |

---

## 2. API contract (identical to the old Apps Script endpoint)

```
POST https://admin.opsroom.live/api/v1/bug-reports
Content-Type: application/json

{
  "secret": "<BUG_REPORT_SECRET>",
  "report": { "reportId": "OPS-...", "version": "0.25.80", ..., "reportText": "..." },
  "diagnosticsZip": { "filename": "...zip", "mimeType": "application/zip", "base64": "..." } | null
}

200 {"ok": true, "reportId": "OPS-...", "diagnosticsFileUrl": "/api/v1/bug-reports/OPS-.../download", "sheetRow": ""}
```

Expected client failures (bad secret, malformed payload, rate limit, duplicate)
return **HTTP 200 with `ok:false`** so the desktop app shows the error message
directly instead of a raw HTTP status.

Admin endpoints (OAuth session required, same as the rest of the panel):

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/bug-reports` | List (filters: `status`, `module`, `version`, `q`; pagination: `limit`, `offset`) |
| GET | `/api/v1/bug-reports/stats` | Counts by status |
| GET | `/api/v1/bug-reports/{report_id}` | Full detail |
| GET | `/api/v1/bug-reports/{report_id}/download` | Diagnostics ZIP |
| PUT | `/api/v1/bug-reports/{report_id}` | `{"status": "new|open|closed", "notes": "..."}` |

---

## 3. Deploy the server side

On the VPS, from the website checkout (the compose file mounts
`/opt/opsroom-bug-reports` and the Dockerfile builds both SPAs + bakes nginx):

```bash
cd /opt/opsroom
git pull                       # or copy the changed files from this repo
mkdir -p /opt/opsroom-bug-reports
docker compose up -d --build
docker compose ps
```

Environment (all optional; defaults are safe):

| Variable | Default | Notes |
|---|---|---|
| `BUG_REPORT_SECRET` | `e7eb1adf…` (matches the desktop binary) | Anti-spam gate only — it ships in the app, so the per-IP rate limit is the real defense. Rotating it requires shipping a matching desktop build. |
| `BUG_REPORTS_DB` | `/opt/opsroom-bug-reports/bug_reports.sqlite3` | Created automatically at startup. |
| `BUG_REPORTS_STORAGE_DIR` | `/opt/opsroom-bug-reports` | Diagnostics ZIPs stored here as `{report_id}.zip`. |
| `BUG_REPORTS_RATE_LIMIT_PER_MIN` | `10` | Per client IP (Cloudflare-aware via nginx `X-Real-IP`). |

Verify:

```bash
docker exec opsroom-website nginx -t
curl -fsS https://opsroom.live/health
curl -fsS http://localhost:8000/api/ping
```

## 4. Smoke tests

Automated (no auth needed, uses a temp DB):

```bash
cd admin-api && python tests/test_bug_reports.py   # expect 17/17 PASS
```

Manual ingest (exactly what the desktop app sends):

```bash
curl -sS -X POST https://admin.opsroom.live/api/v1/bug-reports \
  -H 'Content-Type: application/json' \
  -d '{"secret":"e7eb1adf7e094220a3f5ad89fcf6d01ce4194a0fe4b2452f9415b97d808bbbab",
       "report":{"reportId":"OPS-20260814-120000-SMOKE0001","version":"0.25.80","module":"Ground Control",
                 "userDescription":"Smoke test","expectedResult":"ok","stepsToReproduce":"send","reportText":"smoke"},
       "diagnosticsZip":null}'
# -> {"ok":true,"reportId":"OPS-20260814-120000-SMOKE0001","diagnosticsFileUrl":"/api/v1/bug-reports/OPS-20260814-120000-SMOKE0001/download","sheetRow":""}
```

Then open the admin panel → **Bug Reports** (nav item) at
`https://admin.opsroom.live/bug-reports`: the report should be listed as NEW;
open it, set status/notes, and download the ZIP if one was attached.

---

## 5. Cut the desktop app over

1. The desktop changes are already in the source tree. Rebuild and ship via
   `BUILD WINDOWS APP ONLY.bat` / `BUILD OPS ROOM COMPLETE.bat`.
2. Existing installs migrate automatically on first launch: the load-time
   migration in `settings_store.py` rewrites the persisted legacy Apps Script
   URL to `https://admin.opsroom.live/api/v1/bug-reports` (custom endpoints are
   left alone). No user action needed.
3. Until the new build ships, older binaries still send to the Apps Script
   endpoint. Once the new build is out and reports stop landing there, retire
   the Apps Script deployment.
4. Optional: export the old Google Sheet to CSV/JSON and import into
   `bug_reports` (SQLite) if you want history in the panel.

---

## 6. Operations & security notes

- **Backup** the new store with the rest of the server state:
  `tar czf /opt/opsroom-bug-reports-backup-$(date +%F).tar.gz /opt/opsroom-bug-reports`.
- Report IDs are non-sequential `OPS-…` tokens (not enumerable like the old
  transcript ticket IDs). The admin endpoints still require an OAuth session.
- The ingest is public + secret-gated. The secret is inside the desktop binary,
  so anyone can submit reports — the 10/min per-IP rate limit is the spam
  defense; lower it if abuse shows up. Rotating the secret means shipping a new
  build and updating `BUG_REPORT_SECRET` together.
- Diagnostics ZIPs are validated (ZIP magic, ≤8 MB decoded) and stored only
  after the report row is accepted.

---

# Support form (v0.25.x) — opsroom.live/support

The website /support page now has a contact form wired to the same admin-api.

## What was added

- `admin-api/support.py` — public ingest `POST /api/v1/support` (name, email,
  subject, message) stored in `support_messages` (SQLite, `SUPPORT_DB`,
  default `/opt/opsroom-support/support.sqlite3`); per-IP rate limit
  (5/min default, `SUPPORT_RATE_LIMIT_PER_MIN`). Admin (OAuth-gated):
  `GET /api/v1/support` (list + filters), `GET /api/v1/support/stats`,
  `GET|PUT /api/v1/support/{id}` (detail / status+notes).
- `nginx.conf` — `location ^~ /api/v1/support` on the main site proxies the
  public POST same-origin to the admin-api.
- `docker-compose.yml` — `SUPPORT_DB` / `SUPPORT_RATE_LIMIT_PER_MIN` env vars
  + `/opt/opsroom-support` volume.
- Admin panel: new **Support Requests** page (`admin/src/pages/SupportRequests.jsx`,
  route `/support-requests`, nav item) — stats, filters, detail, status/notes.
- Website: `src/pages/Contact.jsx` rewritten — Discord link fixed + button,
  and the form posts to `/api/v1/support`.

## Deploy

Same build as the bug-report work:

```bash
cd /opt/opsroom
git pull
mkdir -p /opt/opsroom-support
docker compose up -d --build
```

Verify:

```bash
curl -sS -X POST https://opsroom.live/api/v1/support \
  -H 'Content-Type: application/json' \
  -d '{"name":"Smoke","email":"smoke@example.com","subject":"Deploy check","message":"Testing the support form ingest."}'
# -> {"ok":true,"id":"SUP-..."}
```

Then open `https://admin.opsroom.live/support-requests` — the message shows as NEW.
