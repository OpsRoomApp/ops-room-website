/**
 * SSR entry used by scripts/prerender.mjs to emit static HTML for crawlers.
 *
 * Renders the same App routes with StaticRouter (server-side). React 19 emits
 * <title>/<meta>/<link> (from react-helmet-async's Helmet) directly in the
 * render output. The helmet context is NOT populated on React 19, so the
 * prerender script hoists those tags from the returned HTML into <head>.
 *
 * No browser, no puppeteer. Plain react-dom/server, safe in node:20-alpine.
 */
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { AppRoutes } from './App.jsx';

export function renderRoute(path) {
  const html = renderToString(
    <HelmetProvider>
      <StaticRouter location={path}>
        <AppRoutes />
      </StaticRouter>
    </HelmetProvider>
  );
  return { html };
}
