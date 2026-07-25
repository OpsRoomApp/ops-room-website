# OPS ROOM Website

Public website for OPS ROOM, a professional operations platform for Microsoft Flight Simulator.

Live at: https://opsroom.live

## Tech Stack

- React 19
- Vite 8
- React Router v7
- react-helmet-async for SEO
- Docker + nginx

## Development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

## Project Structure

```
opsroom-website/
  public/              Static assets (favicon, og-image, update.json template)
    update.json        Template for the update manifest (served from /opt/opsroom-releases on the server)
  src/
    components/        Header, Footer, Layout, SEO, VatsimFIDS
    config/            Feature flags and SEO constants
    modules/
      billing/         Future Stripe/payment integration (disabled by default)
    pages/             Home, Features, Screenshots, Download, Documentation, Changelog, Contact
    App.jsx            Router
    main.jsx           Entry point
    index.css          Global styles
  Dockerfile
  docker-compose.yml
  nginx.conf
  .env.example
```

## Deployment on DigitalOcean Ubuntu VM

1. Provision an Ubuntu server and point `opsroom.live` to it.
2. Install Docker and Docker Compose.
3. Clone the repository:

   ```bash
   git clone <repo-url>
   cd opsroom-website
   ```

4. Copy the environment file and adjust as needed:

   ```bash
   cp .env.example .env
   ```

5. Create the releases directory on the host:

   ```bash
   mkdir -p /opt/opsroom-releases
   mkdir -p /opt/opsroom/certbot
   ```

6. Build and run:

   ```bash
   docker compose up -d --build
   ```

7. The site is now served on port 80 and 443. Certbot manages SSL certificates.

## Release Management

### Publishing a New OPS ROOM Release

Follow these steps on the DigitalOcean server every time a new release is built.

**1. Upload the installer ZIP**

```bash
scp OPS_ROOM_v0_25_XX_Public_Windows_x64.zip user@opsroom.live:/opt/opsroom-releases/
```

**2. Generate the SHA256 checksum**

```bash
sha256sum /opt/opsroom-releases/OPS_ROOM_v0_25_XX_Public_Windows_x64.zip
```

**3. Update the manifest**

Edit `/opt/opsroom-releases/update.json`:

```bash
nano /opt/opsroom-releases/update.json
```

Set `latest_version`, `version`, `download_url`, `url`, `sha256`, `message`, and
`notes`. Keep `fallback_download_url` pointing to the GitHub mirror.

**4. Update the `latest` symlink**

```bash
cd /opt/opsroom-releases
rm -f latest
ln -s OPS_ROOM_v0_25_XX_Public_Windows_x64.zip latest
```

**5. Verify everything is live**

```bash
# Manifest returns valid JSON with correct version
curl -s https://opsroom.live/api/update.json | jq .latest_version

# Latest download redirects to the ZIP
curl -sI https://opsroom.live/downloads/latest | grep -E 'HTTP|content-type|content-length'
```

No website rebuild or container restart is required. nginx reads the manifest
and symlink on every request.

### Directory Structure on the Server

```
/opt/
  opsroom/
    website/              Website source (this repository)
  opsroom-releases/       Release files served at https://opsroom.live/downloads/
    update.json           Update manifest (served at /api/update.json)
    OPS_ROOM_v0_25_13_Public_Windows_x64.zip
    latest -> OPS_ROOM_v0_25_13_Public_Windows_x64.zip   (symlink)
```

### Uploading a New Release

1. Build the release ZIP with `BUILD OPS ROOM COMPLETE.bat` on a Windows machine.

2. Compute the SHA256:

   ```bash
   sha256sum OPS_ROOM_v0_25_XX_Public_Windows_x64.zip
   ```

3. Copy the ZIP to the server:

   ```bash
   scp OPS_ROOM_v0_25_XX_Public_Windows_x64.zip user@opsroom.live:/opt/opsroom-releases/
   ```

4. Update `update.json` with the new version, download URL, and SHA256.

5. Update the `latest` symlink:

   ```bash
   cd /opt/opsroom-releases
   rm -f latest
   ln -s OPS_ROOM_v0_25_XX_Public_Windows_x64.zip latest
   ```

6. The update is now live. Existing OPS ROOM installations will discover it on their next check (or restart).

### Updating update.json on the Server

Edit the file directly:

```bash
nano /opt/opsroom-releases/update.json
```

Update the fields:

- `latest_version` and `version`: new version string
- `download_url` and `url`: full download path
- `sha256`: the computed hash of the ZIP
- `message`: short user-facing message
- `notes`: detailed release notes

Restart is not required; nginx reads the file on every request.

### Deploying Website Changes

```bash
cd /opt/opsroom/website/opsroom-website
git pull
docker compose up -d --build
```

The container rebuilds and serves the updated site.

### How Users Receive Updates

1. OPS ROOM desktop app checks `https://opsroom.live/api/update.json` on startup (and periodically).
2. If a newer version is available, the user is notified.
3. The app downloads the ZIP, verifies the SHA256 against the manifest, and launches the updater.
4. The updater replaces the installation and restarts OPS ROOM.

### Fallback Behaviour

If `opsroom.live` is unreachable (DNS failure, timeout, HTTP error):

1. The updater falls back to `https://raw.githubusercontent.com/OpsRoomApp/ops-room-releases/main/update.json`.
2. If GitHub is also unreachable, the update check fails gracefully and the user continues on their current version.
3. No data is lost; the update check is read-only until the user explicitly approves an update.

### Rollback

If a release has issues:

1. Edit `/opt/opsroom-releases/update.json` to point back to the previous version.
2. Update the `latest` symlink to the previous ZIP.
3. Existing users who already installed the bad version can manually reinstall the previous version from the downloads page.

## Future Payments

Payment functionality is disabled by default via `VITE_PAYMENT_ENABLED=false`. The billing module under `src/modules/billing/` provides the structure for future Stripe integration without exposing payment UI or keys publicly.

## Notes

- Keep the `update.json` SHA256 updated after every build; the OPS ROOM updater will reject mismatched checksums.
- The `public/update.json` in this repository is a template; the live manifest lives at `/opt/opsroom-releases/update.json` on the server.
- Update `index.html` OpenGraph URLs if the domain changes.
