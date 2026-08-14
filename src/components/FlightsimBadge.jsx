import { useEffect, useState } from 'react';

const STATS_URL = '/api/v1/flightsim/stats';

function Stars({ rating }) {
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100));
  return (
    <span className="fs-stars" aria-label={`Rated ${rating} out of 5`}>
      <span className="fs-stars-bg">★★★★★</span>
      <span className="fs-stars-fill" style={{ width: `${pct}%` }}>★★★★★</span>
    </span>
  );
}

function formatNum(n) {
  if (n == null) return null;
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

/**
 * flightsim.to social-proof badge. When the server has an API key configured
 * it shows live rating + download count (server-cached 6h); otherwise it
 * degrades to a clean "Available on flightsim.to" link. Never renders a
 * broken widget.
 */
export default function FlightsimBadge({ compact = false }) {
  const [state, setState] = useState({ loading: true, data: null });

  useEffect(() => {
    let cancelled = false;
    fetch(STATS_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        if (cancelled) return;
        if (data?.ok && data?.stats) {
          setState({ loading: false, data });
        } else {
          setState({ loading: false, data: { fallback: true, addonUrl: data?.addonUrl || 'https://flightsim.to' } });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setState({ loading: false, data: { fallback: true, addonUrl: 'https://flightsim.to' } });
      });
    return () => { cancelled = true; };
  }, []);

  if (state.loading) {
    return <div className="fs-badge fs-badge--loading">flightsim.to · …</div>;
  }

  const d = state.data;
  if (!d || d.fallback) {
    return (
      <a className="fs-badge fs-badge--link" href={d?.addonUrl || 'https://flightsim.to'} target="_blank" rel="noopener noreferrer">
        <span className="fs-badge-logo" aria-hidden="true">f.to</span>
        <span>Available on flightsim.to</span>
        <span aria-hidden="true">↗</span>
      </a>
    );
  }

  const s = d.stats || {};
  return (
    <a className={`fs-badge ${compact ? 'fs-badge--compact' : ''}`} href={d?.addon?.url} target="_blank" rel="noopener noreferrer">
      <span className="fs-badge-logo" aria-hidden="true">f.to</span>
      {s.rating != null && (
        <span className="fs-badge-rating">
          <Stars rating={s.rating} />
          <b>{s.rating.toFixed(1)}</b>
          {s.ratingCount != null && <span className="fs-badge-count">({s.ratingCount})</span>}
        </span>
      )}
      {s.downloads != null && (
        <span className="fs-badge-downloads">
          <b>{formatNum(s.downloads)}</b> downloads
        </span>
      )}
      <span aria-hidden="true">↗</span>
    </a>
  );
}
