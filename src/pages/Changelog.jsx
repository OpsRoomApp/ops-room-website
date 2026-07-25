import SEO from '../components/SEO.jsx';
import { PAGE_TITLES } from '../config/seo.js';

const ENTRIES = [
  {
    v: 'v0.25.0',
    date: '2026-07-25',
    bullets: [
      'ChartFox runtime diagnostics: counters, performance stats, token state, recent failures.',
      'ChartFox chart files rendered locally (no iframe, no cross-origin issues).',
      'Passenger satisfaction scores surfaced in the Finance page (last flight and lifetime average).',
      'Finance panel layout: equal-height cards, consistent spacing.',
      'Diagnostics endpoint /api/charts/chartfox/debug exposed with masked secrets.',
    ],
  },
  {
    v: 'v0.25.11',
    date: '2026-07-09',
    bullets: [
      'Recording schema v2: sidestick fields appended at tail, schema bumped.',
      'Airports chips: fixed ICAO rendering on arrival chips.',
      'Build validator: route count updated to 239/207.',
    ],
  },
  {
    v: 'v0.25.10',
    date: '2026-06-22',
    bullets: [
      'Chart rendering: ChartFox and Navigraph catalog integration with local PDF viewing.',
      'New `/api/charts/chartfox/file/{chart_id}` proxy endpoint with proper error codes.',
    ],
  },
  {
    v: 'v0.25.9',
    date: '2026-06-04',
    bullets: [
      'Universal Announcer: distance-based in-sim volume curve enabled by default.',
      'Module preloader: TTL cache + background prewarmer for slow endpoints.',
    ],
  },
  {
    v: 'v0.25.8',
    date: '2026-05-19',
    bullets: [
      'In-sim replay system: replay captures SkyDolly-like synchronized scenes.',
      'Recording v1 schema extended: additional fuel / pitch / FMS state.',
    ],
  },
];

export default function Changelog() {
  return (
    <>
      <SEO title={PAGE_TITLES.changelog} description="OPS ROOM release history: version notes, dates, and changes per release." path="/changelog" />

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">/ CHANGELOG</span>
            <h1 className="section-title">Release history.</h1>
            <p className="section-subtitle">
              Notes from each OPS ROOM public release. Full changelog is included in the
              application under “Release Notes”.
            </p>
          </div>

          <div className="changelog-list">
            {ENTRIES.map((e) => (
              <article key={e.v} className="changelog-entry">
                <div className="changelog-head">
                  <span className="changelog-version">{e.v}</span>
                  <span className="changelog-date">{e.date}</span>
                </div>
                <ul className="changelog-list-bullets">
                  {e.bullets.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
