import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import SEO from '../components/SEO.jsx';
import { PAGE_TITLES } from '../config/seo.js';

function shortDate(iso) {
  if (!iso) return '';
  const d = iso.slice(0, 10); // YYYY-MM-DD
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const m = months[parseInt(parts[1], 10) - 1];
  return m ? `${m} ${parseInt(parts[2], 10)}, ${parts[0]}` : d;
}

export default function Changelog() {
  const [releases, setReleases] = useState(null); // null = loading
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch('/api/public/releases');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (!cancelled) setReleases(data.releases || []);
      } catch (e) {
        if (!cancelled) setError('Could not load the changelog right now. Please try again in a moment.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <SEO title={PAGE_TITLES.changelog} description="What's new in OPS ROOM - release notes for every version." path="/changelog" />

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">/ CHANGELOG</span>
            <h1 className="section-title">What&apos;s new.</h1>
            <p className="section-subtitle">
              OPS ROOM is freeware for Windows and works alongside Microsoft Flight Simulator
              2020 and 2024 - from briefing to debrief, in one app.
            </p>
          </div>

          <div className="changelog-list">
            {error && <p className="changelog-message">{error}</p>}
            {!error && releases === null && <p className="changelog-message">Loading release history…</p>}
            {!error && releases !== null && releases.length === 0 && (
              <p className="changelog-message">No releases published yet. Check back soon.</p>
            )}
            {releases &&
              releases.map((r) => (
                <article key={r.version} className="changelog-entry">
                  <div className="changelog-head">
                    <span className="changelog-version">v{r.version}</span>
                    <span className="changelog-date">{shortDate(r.published_at)}</span>
                  </div>
                  <div className="changelog-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {r.notes || '*No release notes for this version.*'}
                    </ReactMarkdown>
                  </div>
                </article>
              ))}
          </div>
        </div>
      </section>
    </>
  );
}
