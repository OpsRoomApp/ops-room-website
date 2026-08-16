/**
 * Prerender. Emit static HTML for the marketing routes so crawlers (Google,
 * Bing, Discord, social scrapers) see real content instead of an empty JS
 * shell.
 *
 * Runs after `vite build` (see package.json "build"). No browser, no
 * puppeteer: it builds the SSR entry (src/ssr-entry.jsx) with Vite's SSR
 * pipeline, renders each route with react-dom/server, and injects the HTML +
 * per-route head tags into the built index.html template.
 *
 * Head handling: on React 19, react-helmet-async's Helmet emits
 * <title>/<meta>/<link> directly in the render output (the helmet SSR context
 * is not populated), so this script extracts those tags from the rendered
 * body HTML and hoists them into <head>.
 *
 * Output layout matches the nginx SPA fallback (`try_files $uri $uri/
 * /index.html`): /features -> dist/features/index.html, / -> dist/index.html.
 */

import { build } from 'vite';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const tmpOut = join(root, '.prerender-ssr');

// Routes that produce static HTML. Dynamic routes (/transcripts/:id) and the
// catch-all are deliberately excluded, they keep the SPA fallback.
const ROUTES = [
  '/',
  '/features',
  '/screenshots',
  '/demo',
  '/getting-started',
  '/documentation',
  '/download',
  '/changelog',
  '/support',
  '/contact',
  '/faq',
  '/privacy',
  '/appeal',
  '/leaderboard',
];

// Static head tags in index.html that the route's own SEO component re-emits
// (title, description, keywords, og:*, twitter:*, canonical). Strip them so
// each prerendered page has exactly one set, sourced from the route itself.
const STRIP_RE = [
  /<title>[\s\S]*?<\/title>/,
  /<meta name="description"[^>]*\/>/,
  /<meta name="keywords"[^>]*\/>/,
  /<meta property="og:[^>]*\/>/,
  /<meta name="twitter:[^>]*\/>/,
  /<link rel="canonical"[^>]*\/>/,
];

function stripStaticHeadTags(head) {
  let out = head;
  for (const re of STRIP_RE) out = out.replace(re, '');
  return out;
}

/**
 * Pull <title>, <meta ...> and <link ...> tags out of the rendered body HTML
 * (where React 19 puts them) so they can live in <head>. Returns
 * { headTags, body }. The body with those tags removed.
 */
function hoistHeadTags(body) {
  const tags = [];
  const cleaned = body
    .replace(/<title>[\s\S]*?<\/title>/g, (m) => {
      tags.push(m);
      return '';
    })
    .replace(/<meta\b[^>]*\/?>/g, (m) => {
      tags.push(m);
      return '';
    })
    .replace(/<link\b[^>]*\/?>/g, (m) => {
      tags.push(m);
      return '';
    });
  return { headTags: tags.join('\n'), body: cleaned };
}

function routeToPath(route) {
  if (route === '/') return join(dist, 'index.html');
  return join(dist, route.replace(/^\//, ''), 'index.html');
}

// 1. Build the SSR bundle from src/ssr-entry.jsx.
await build({
  root,
  configFile: join(root, 'vite.config.js'),
  build: {
    ssr: 'src/ssr-entry.jsx',
    outDir: tmpOut,
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
  },
  logLevel: 'warn',
});

// The SSR output is ESM (package.json "type": "module"); filename is the
// entry name with a .js/.mjs extension.
const candidates = ['ssr-entry.js', 'ssr-entry.mjs'];
let entryPath = null;
for (const c of candidates) {
  const p = join(tmpOut, c);
  try {
    readFileSync(p);
    entryPath = p;
    break;
  } catch {
    /* keep looking */
  }
}
if (!entryPath) {
  throw new Error('SSR bundle not found in ' + tmpOut + ' (tried ' + candidates.join(', ') + ')');
}

const { renderRoute } = await import(pathToFileURL(entryPath).href);

// 2. Render every route and write static HTML next to the client build.
const template = readFileSync(join(dist, 'index.html'), 'utf-8');
const headEnd = template.indexOf('</head>');
const baseHead = template.slice(0, headEnd);
const baseTail = template.slice(headEnd);

let rendered = 0;
for (const route of ROUTES) {
  const { html } = renderRoute(route);
  const { headTags, body } = hoistHeadTags(html);
  const cleanHead = stripStaticHeadTags(baseHead);
  const page = cleanHead + '\n' + headTags + '\n' + baseTail.replace(
    '<div id="root"></div>',
    `<div id="root">${body}</div>`
  );
  const out = routeToPath(route);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, page, 'utf-8');
  rendered += 1;
  console.log(`prerendered ${route} -> ${out.replace(root + '/', '')} (${page.length} bytes)`);
}

// 3. Clean up the temporary SSR bundle.
rmSync(tmpOut, { recursive: true, force: true });
console.log(`prerender done: ${rendered} routes`);
