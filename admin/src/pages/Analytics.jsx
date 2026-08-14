import { useState, useCallback, useEffect } from 'react';

const API = '/api/analytics/web';
const PERIODS = [
  ['24h', 'Last 24 hours'],
  ['7d', 'Last 7 days'],
  ['30d', 'Last 30 days'],
  ['90d', 'Last 90 days'],
];

function fmtNum(n) {
  const v = Number(n || 0);
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 10000) return `${(v / 1000).toFixed(1)}k`;
  return v.toLocaleString();
}

function fmtTime(seconds) {
  const s = Number(seconds || 0);
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${r}s`;
}

async function fetchJson(url) {
  const resp = await fetch(url, { credentials: 'include' });
  const text = await resp.text();
  let body = {};
  let parseError = '';
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      parseError = text.slice(0, 160);
    }
  }
  if (!resp.ok || parseError) {
    const detail = body.detail
      || (parseError ? `Server error (HTTP ${resp.status}): ${parseError}` : `HTTP ${resp.status}`);
    throw new Error(detail);
  }
  return body;
}

function MetricBar({ label, value, max }) {
  const v = Number(value || 0);
  const top = max || (v > 0 ? v : 1);
  const width = top > 0 ? Math.max(2, Math.min(100, Math.round((v / top) * 100))) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0' }}>
      <span className="dim" style={{ fontSize: '0.75rem', width: '42%', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={label}>
        {label || '-'}
      </span>
      <div style={{ flex: 1, background: 'rgba(255,255,255,0.07)', borderRadius: '2px', height: '10px', overflow: 'hidden' }}>
        <div style={{ width: `${width}%`, background: '#00bcd4', height: '100%' }} />
      </div>
      <span className="mono-dim" style={{ fontSize: '0.75rem', width: '4rem', textAlign: 'right' }}>{fmtNum(value)}</span>
    </div>
  );
}

export default function Analytics() {
  const [period, setPeriod] = useState('7d');
  const [status, setStatus] = useState(null);
  const [overview, setOverview] = useState(null);
  const [metrics, setMetrics] = useState({ pages: [], referrers: [], browsers: [], devices: [], countries: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (next = period) => {
    setLoading(true);
    setError('');
    try {
      const st = await fetchJson(`${API}/status`);
      setStatus(st);
      if (!st.ok) {
        setLoading(false);
        return;
      }
      const q = `period=${encodeURIComponent(next)}&limit=10`;
      const [ov, pages, referrers, browsers, devices, countries] = await Promise.all([
        fetchJson(`${API}/overview?${q}`),
        fetchJson(`${API}/top-pages?${q}`),
        fetchJson(`${API}/referrers?${q}`),
        fetchJson(`${API}/browsers?${q}`),
        fetchJson(`${API}/devices?${q}`),
        fetchJson(`${API}/countries?${q}`),
      ]);
      if (!ov.ok) throw new Error(ov.error || 'Umami data unavailable');
      setOverview(ov);
      setMetrics({
        pages: pages.rows || [],
        referrers: referrers.rows || [],
        browsers: browsers.rows || [],
        devices: devices.rows || [],
        countries: countries.rows || [],
      });
    } catch (err) {
      console.error('Analytics load failed:', err);
      setError(err?.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const changePeriod = (p) => {
    setPeriod(p);
    load(p);
  };

  const periodLabel = PERIODS.find(([k]) => k === period)?.[1] || period;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>/ WEBSITE ANALYTICS</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <select value={period} onChange={(e) => changePeriod(e.target.value)}>
            {PERIODS.map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
          <button className="btn btn-sm" onClick={() => load()} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="card mb-2" style={{ borderColor: 'rgba(255,23,68,0.3)', background: 'rgba(255,23,68,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="badge badge-err">ERROR</span>
            <span className="mono-dim" style={{ fontSize: '0.8rem' }}>{error}</span>
          </div>
        </div>
      )}

      {status && !status.ok && (
        <div className="card mb-2" style={{ borderColor: 'rgba(255,152,0,0.3)', background: 'rgba(255,152,0,0.05)' }}>
          <div className="card-head" style={{ marginBottom: '0.5rem' }}>
            <span className="badge badge-warn">NOT CONFIGURED</span>
          </div>
          <div className="dim" style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
            Umami is deployed with the stack, but the admin-api bridge has no credentials yet.
            Complete the one-time Umami setup on the VPS (create the admin account + the
            opsroom.live website), then add UMAMI_USERNAME, UMAMI_PASSWORD and UMAMI_WEBSITE_ID
            to the server .env and rebuild the admin-api container. Stats will appear here once
            the tracker starts receiving visits.
          </div>
        </div>
      )}

      {loading && !overview && <div className="loading-state">Loading analytics...</div>}

      {overview && (
        <>
          <div className="grid-4 mb-2">
            {[
              ['Active now', fmtNum(overview.active), 'badge-ok'],
              ['Pageviews', fmtNum(overview.pageviews), ''],
              ['Visitors', fmtNum(overview.visitors), ''],
              ['Visits', fmtNum(overview.visits), ''],
            ].map(([label, value, badge]) => (
              <div className="card" key={label}>
                <div className="card-head" style={{ marginBottom: '0.25rem' }}>{label.toUpperCase()}</div>
                <div className="stat-value" style={{ fontSize: '1.3rem' }}>
                  {badge ? <span className={`badge ${badge}`}>{value}</span> : value}
                </div>
              </div>
            ))}
          </div>

          <div className="grid-4 mb-2">
            {[
              ['Bounce rate', `${Math.round(Number(overview.bounceRate || 0) * 100)}%`, ''],
              ['Avg visit', fmtTime(overview.averageTime), ''],
              ['Total time', fmtTime(overview.totalTime), ''],
              ['Period', periodLabel, ''],
            ].map(([label, value, badge]) => (
              <div className="card" key={label}>
                <div className="card-head" style={{ marginBottom: '0.25rem' }}>{label.toUpperCase()}</div>
                <div className="stat-value" style={{ fontSize: '1.1rem' }}>
                  {badge ? <span className={`badge ${badge}`}>{value}</span> : value}
                </div>
              </div>
            ))}
          </div>

          <div className="card mb-2">
            <div className="card-head" style={{ marginBottom: '0.5rem' }}>TOP PAGES</div>
            {metrics.pages.length === 0 && <div className="empty-state">No page data for this period.</div>}
            {metrics.pages.map((row) => (
              <MetricBar key={row.label || Math.random()} label={row.label} value={row.value} max={metrics.pages[0]?.value} />
            ))}
          </div>

          <div className="grid-2 mb-2">
            <div className="card">
              <div className="card-head" style={{ marginBottom: '0.5rem' }}>REFERRERS</div>
              {metrics.referrers.length === 0 && <div className="empty-state">None.</div>}
              {metrics.referrers.map((row) => (
                <MetricBar key={row.label || Math.random()} label={row.label} value={row.value} max={metrics.referrers[0]?.value} />
              ))}
            </div>
            <div className="card">
              <div className="card-head" style={{ marginBottom: '0.5rem' }}>COUNTRIES</div>
              {metrics.countries.length === 0 && <div className="empty-state">None.</div>}
              {metrics.countries.map((row) => (
                <MetricBar key={row.label || Math.random()} label={row.label} value={row.value} max={metrics.countries[0]?.value} />
              ))}
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card-head" style={{ marginBottom: '0.5rem' }}>BROWSERS</div>
              {metrics.browsers.length === 0 && <div className="empty-state">None.</div>}
              {metrics.browsers.map((row) => (
                <MetricBar key={row.label || Math.random()} label={row.label} value={row.value} max={metrics.browsers[0]?.value} />
              ))}
            </div>
            <div className="card">
              <div className="card-head" style={{ marginBottom: '0.5rem' }}>DEVICES</div>
              {metrics.devices.length === 0 && <div className="empty-state">None.</div>}
              {metrics.devices.map((row) => (
                <MetricBar key={row.label || Math.random()} label={row.label} value={row.value} max={metrics.devices[0]?.value} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
