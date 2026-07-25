
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
├── public/            # Static assets (favicon, og-image placeholders)
├── src/
│   ├── components/    # Header, Footer, Layout, SEO
│   ├── config/        # Feature flags and SEO constants
│   ├── modules/
│   │   └── billing/   # Future Stripe/payment integration (disabled by default)
│   ├── pages/         # Home, Features, Technology, Download, Documentation, Changelog, Contact
│   ├── App.jsx        # Router
│   ├── main.jsx       # Entry point
│   └── index.css      # Global styles
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
└── .env.example
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

5. Build and run:

   ```bash
   docker compose up -d --build
   ```

6. The site is now served on port 80. Configure SSL with Certbot or a reverse proxy for HTTPS.

## Future Payments

Payment functionality is disabled by default via `VITE_PAYMENT_ENABLED=false`. The billing module under `src/modules/billing/` provides the structure for future Stripe integration without exposing payment UI or keys publicly.

## Notes

- Replace `public/og-image.png` with a real 1200x630 OpenGraph image before launching publicly.
- Update `index.html` OpenGraph URLs if the domain changes.
# ops-room-website
