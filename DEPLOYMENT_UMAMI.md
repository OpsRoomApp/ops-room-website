# OPS ROOM Website Analytics — self-hosted Umami (v0.25.x)

Cookieless, GDPR-friendly website analytics running on the VPS next to the
existing stack. The public site loads the tracker same-origin from
`opsroom.live/script.js` (immune to ad-blockers, no third-party requests), and
the admin panel gets an **Analytics** page that reads Umami through the
admin-api bridge. No consent banner is needed: Umami sets no cookies.

---

> **IMPORTANT — Umami is pinned to v2 (`postgresql-v2.19.0`, the final v2
> release).** Three things to know:
>
> 1. `postgresql-latest` now resolves to **Umami v3**, which removed
>    `/api/auth/setup`, changed the REST API, and breaks the admin-api bridge.
>    Symptom: setup/login curls reply with a Next.js "Page not found" HTML
>    page (not JSON). **Do not use `postgresql-latest`.**
> 2. **v2.19.0 itself no longer has `/api/auth/setup` either** — the route was
>    removed in the v2 line (security hardening). There is no first-run
>    "create account" UI and no register endpoint. The first admin account is
>    created by inserting a row directly into Postgres (section 2). This is
>    the standard v2.19.0 bootstrap; login/websites/stats API calls all work
>    normally afterwards.
> 3. **The tracker lives at `/script.js` in v2.19.0**, not `/umami.js`
>    (renamed in the v2 line so ad-blockers don't recognize it). nginx proxies
>    `/script.js` and redirects the old `/umami.js`; the site bundle loads
>    `/script.js`. Verify with `/script.js`, not `/umami.js`.
>
> If you accidentally deployed v3 and need to re-pin to v2.19.0, reset the
> umami-db volume (v3's schema is incompatible with v2 — only when there is no
> analytics data yet, e.g. first install):
>
> ```bash
> cd /opt/opsroom
> docker compose stop umami umami-db
> docker compose rm -f umami umami-db
> docker volume ls | grep umami-db          # get the exact volume name
> docker volume rm opsroom_umami-db-data    # fresh install, no data yet — safe
> docker compose up -d umami umami-db
> ```

---

## 1. What changed

| File | Change |
|---|---|
| `docker-compose.yml` | New `umami` service (**pinned** `ghcr.io/umami-software/umami:postgresql-v2.19.0`) + `umami-db` (postgres:16-alpine) + `umami-db-data` volume. Umami binds `127.0.0.1:3000` only (dashboard is not public). Admin-api gets `UMAMI_API_URL=http://umami:3000` + credentials env. Website service gets a `VITE_UMAMI_WEBSITE_ID` **build arg** (the tracker id is baked into the JS at build time). |
| `nginx.conf` | Main site: `location = /script.js` (tracker, with `/umami.js` → `/script.js` redirect) and `location = /api/send` proxy same-origin to the umami container (exact-match locations win over the static-asset regex). |
| `src/main.jsx` | Injects the tracker `<script src="/script.js">` only when `VITE_UMAMI_WEBSITE_ID` is set at build time. |
| `admin-api/analytics_umami.py` | **New.** Read-only bridge: `GET /api/analytics/web/{status,overview,top-pages,referrers,browsers,devices,countries}` (OAuth-gated like the rest of the panel). Logs into Umami with `UMAMI_USERNAME`/`UMAMI_PASSWORD`, caches the session token, resolves `UMAMI_WEBSITE_ID` (falls back to the first website in the account). Unconfigured = `{"ok": false, "configured": false}` and the panel shows a setup hint. |
| `admin-api/config.py`, `admin-api/main.py` | `UMAMI_*` config vars; router registered. |
| `admin/src/pages/Analytics.jsx` | **New.** Admin panel page: active-now / pageviews / visitors / visits / bounce / time cards, period selector (24h/7d/30d/90d), top pages, referrers, countries, browsers, devices. |
| `admin/src/App.jsx`, `admin/src/components/Layout.jsx` | Route + nav item (`/analytics`). |
| `admin-api/tests/test_analytics_umami.py` | Standalone smoke test (10 checks). Run: `cd admin-api && python tests/test_analytics_umami.py` |
| `.env.example` | `UMAMI_*` section + `VITE_UMAMI_WEBSITE_ID`. |
| `DEPLOYMENT_UMAMI.md` | This runbook. |

---

## 2. One-time setup (only the first deploy)

The Umami containers start with an empty database. Create the account and the
website once, then fill in `.env`.

1. Deploy the stack (section 3).

2. Create the admin account — **v2.19.0 has no `/api/auth/setup`, so insert
   the user directly into Postgres** (password hashed with bcrypt so login
   works exactly like a UI-created account). From the VPS shell, first get a
   bcrypt hash. The container ships a Next.js **standalone** build, so
   `require('bcryptjs')` from `/app` fails — point NODE_PATH at the real
   modules (find the path first), or use htpasswd/python on the host:

   ```bash
   # A) preferred — locate bcryptjs in the container, then hash with it
   docker compose exec -T umami sh -c "find / -maxdepth 6 -type d -name bcryptjs 2>/dev/null"
   #    -> e.g. /app/.next/standalone/node_modules/bcryptjs
   HASH=$(docker compose exec -T umami sh -c \
     "NODE_PATH=/app/.next/standalone/node_modules node -e \"console.log(require('bcryptjs').hashSync('YOUR-PASSWORD', 10))\"")
   echo "$HASH"

   # B) fallback — htpasswd bcrypt (compatible: bcryptjs accepts $2a/$2b/$2y)
   #    apt-get install -y apache2-utils
   #    HASH=$(htpasswd -bnBC 10 "" 'YOUR-PASSWORD' | tr -d ':\n')

   # C) fallback — python bcrypt if the host has it
   #    python3 -c "import bcrypt; print(bcrypt.hashpw(b'YOUR-PASSWORD', bcrypt.gensalt(10)).decode())"
   ```

   Then insert the admin user (table `user`, columns verified against the
   v2.19.0 schema: `user_id`, `username`, `password`, `role`, `created_at`,
   `updated_at`):

   ```bash
   docker compose exec -T umami-db psql -U umami umami -c \
     "INSERT INTO \"user\" (user_id, username, password, role, created_at, updated_at)
      VALUES (gen_random_uuid(), 'YOUR-USERNAME', '$HASH', 'admin', now(), now());"
   ```

   Keep `HASH` in the same shell session. If the row already exists, delete it
   first and re-insert:
   `docker compose exec -T umami-db psql -U umami umami -c "DELETE FROM \"user\" WHERE username='YOUR-USERNAME';"`

3. Verify login works (returns JSON with a `"token"`):

   ```bash
   curl -sS -X POST http://127.0.0.1:3000/api/auth/login \
     -H 'Content-Type: application/json' \
     -d '{"username":"YOUR-USERNAME","password":"YOUR-PASSWORD"}'
   ```

4. Create the opsroom.live website. Either click **Add website** in the
   dashboard (SSH tunnel: `ssh -L 3000:127.0.0.1:3000 user@VPS`, then open
   http://localhost:3000) or:

   ```bash
   TOKEN=$(curl -sS -X POST http://127.0.0.1:3000/api/auth/login \
     -H 'Content-Type: application/json' \
     -d '{"username":"YOUR-USERNAME","password":"YOUR-PASSWORD"}' | python -c "import sys,json;print(json.load(sys.stdin)['token'])")
   curl -sS -X POST http://127.0.0.1:3000/api/websites \
     -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{"name":"opsroom.live","domain":"opsroom.live"}'
   # note the "websiteId" in the response
   ```

5. Add to the server `.env` (next to the existing vars) — **exactly** the
   username/password from step 2:

   ```bash
   UMAMI_API_URL=http://umami:3000
   UMAMI_USERNAME=<YOUR-USERNAME>
   UMAMI_PASSWORD=<YOUR-PASSWORD>
   UMAMI_WEBSITE_ID=<websiteId from step 4>
   VITE_UMAMI_WEBSITE_ID=<same websiteId>
   UMAMI_APP_SECRET=<random string>
   UMAMI_DB_PASSWORD=<random string>
   ```

   Generate secrets: `python -c "import secrets; print(secrets.token_urlsafe(32))"`

6. Rebuild so the tracker id is baked in:
   `docker compose up -d --build`

---

## 3. Deploy (every update)

```bash
cd /opt/opsroom
git pull
docker compose up -d --build
docker compose ps          # opsroom-umami + opsroom-umami-db should be healthy
```

## 4. Verify

```bash
# tracker script proxied same-origin (v2.19.0 serves /script.js)
curl -fsSI https://opsroom.live/script.js | head -3
# old path redirects
curl -fsSI https://opsroom.live/umami.js | head -3   # expect 301 -> /script.js
# ingest endpoint reachable (POST with no payload returns 400, not 404)
curl -sS -o /dev/null -w "%{http_code}\n" -X POST https://opsroom.live/api/send
# admin-api bridge (unconfigured shows the hint; configured returns numbers)
curl -fsS -H "Cookie: <session>" https://admin.opsroom.live/api/analytics/web/status
```

Then open `https://admin.opsroom.live/analytics` — after a few visits the
cards populate; active-now updates immediately.

## 5. Smoke test

```bash
cd admin-api && python tests/test_analytics_umami.py   # expect 10/10 PASS
```

## 6. Operations notes

- **Storage**: Postgres data lives in the `umami-db-data` named volume
  (`docker volume inspect opsroom-website_umami-db-data`). Back it up with
  the rest of the server state: `docker compose exec umami-db pg_dump -U umami umami > umami-$(date +%F).sql`.
- **Password reset**: update the `password` column with a fresh bcrypt hash
  (any of options A/B/C in step 2), or delete the row and re-run step 2.
- **Tracker path**: v2.19.0 serves `/script.js`; the old `/umami.js` 301-redirects
  to it. If you ever proxy a different Umami version, re-check the tracker
  filename (v1/v2-early used `/umami.js`).
- **Privacy**: Umami collects no cookies and no personal data; it hashes IPs.
  The privacy policy already covers this (website analytics section).
- **Dashboard access**: the UI binds to `127.0.0.1:3000` on the VPS, so it is
  reachable only via SSH tunnel or through the admin panel Analytics page.
- **Do NOT switch to `postgresql-latest`**: that tag is Umami v3 now. The
  admin-api bridge and the setup flow are all v2 API. Pin stays at
  `postgresql-v2.19.0` until the bridge is ported to v3.
- **Removing it**: remove the `umami`/`umami-db` services from
  `docker-compose.yml`, drop the `VITE_UMAMI_WEBSITE_ID` build arg and the
  `main.jsx` tracker block, delete the `UMAMI_*` env vars, and rebuild.
