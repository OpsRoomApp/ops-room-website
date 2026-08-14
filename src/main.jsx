import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import './index.css';
import './getting-started.css';
import App from './App.jsx';

// Self-hosted Umami analytics (v0.25.x): cookieless, GDPR-friendly. The
// tracker is injected only when VITE_UMAMI_WEBSITE_ID is set at build time
// (set it in the website container env or .env before building). It loads
// same-origin from /script.js (Umami v2.19.0's tracker path; the old
// /umami.js now redirects), which nginx proxies to the Umami container.
if (import.meta.env.VITE_UMAMI_WEBSITE_ID) {
  const script = document.createElement('script');
  script.defer = true;
  script.src = '/script.js';
  script.setAttribute('data-website-id', import.meta.env.VITE_UMAMI_WEBSITE_ID);
  document.head.appendChild(script);
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </StrictMode>
);
