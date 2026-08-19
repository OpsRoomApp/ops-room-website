import { useState } from 'react';
import { Link } from 'react-router-dom';
import SEO from '../components/SEO.jsx';
import { PAGE_TITLES } from '../config/seo.js';
import { useCommunityLeaderboard } from '../hooks/useCommunity.js';

const PERIODS = [
  { id: 'alltime', label: 'All time' },
  { id: 'month', label: '30 days' },
  { id: 'week', label: '7 days' },
];

const MEDALS = ['🥇', '🥈', '🥉'];

function fmtRate(value) {
  if (value === null || value === undefined) return '-';
  return `${Math.round(value)} fpm`;
}

// #119: sortable numeric columns. Default = HOURS descending (matches the
// API's hours-first ordering). Landing rates are always negative fpm and a
// soft touchdown is close to 0 (e.g. -220 fpm), so the landing columns sort
// by absolute value: the default descending click shows the softest
// touchdown first and any junk positive rates sink to the bottom.
const SORT_COLUMNS = [
  { key: 'flights', label: 'FLIGHTS', value: (r) => r.flights },
  { key: 'hours', label: 'HOURS', value: (r) => r.hours },
  { key: 'avg', label: 'AVG LANDING', value: (r) => r.avg_landing_rate_fpm, byAbs: true },
  { key: 'best', label: 'BEST LANDING', value: (r) => r.best_landing_rate_fpm, byAbs: true },
];

function sortRows(rows, key, dir) {
  const col = SORT_COLUMNS.find((c) => c.key === key);
  if (!col) return rows;
  return [...rows].sort((a, b) => {
    const va = col.value(a);
    const vb = col.value(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1; // nulls always sort last
    if (vb == null) return -1;
    if (va === vb) return 0;
    if (!col.byAbs) {
      const cmp = va < vb ? -1 : 1;
      return dir === 'asc' ? cmp : -cmp;
    }
    // Landing fpm columns: a real touchdown is negative, so positive or
    // zero rates are junk data and always sink to the bottom in both sort
    // directions. Among real landings, descending shows the softest first
    // (closest to 0 fpm) and ascending shows the hardest first.
    const junkA = va >= 0;
    const junkB = vb >= 0;
    if (junkA !== junkB) return junkA ? 1 : -1;
    const ka = -Math.abs(va);
    const kb = -Math.abs(vb);
    const cmp = ka < kb ? -1 : 1;
    return dir === 'asc' ? cmp : -cmp;
  });
}

export default function Leaderboard() {
  const [period, setPeriod] = useState('alltime');
  const [sortKey, setSortKey] = useState('hours');
  const [sortDir, setSortDir] = useState('desc');
  const { leaderboard, loading, error } = useCommunityLeaderboard(period);
  const rows = sortRows(leaderboard, sortKey, sortDir);

  const toggleSort = (key) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  return (
    <>
      <SEO
        title={PAGE_TITLES.leaderboard}
        description="OPS ROOM community flight leaderboard: hours flown, landings, and landing rate, ranked across pilots who opted into public visibility."
        path="/leaderboard"
      />

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">/ COMMUNITY</span>
            <h1 className="section-title">OPS ROOM community flight leaderboard</h1>
            <p className="section-subtitle">
              Ranked from flights logged by OPS ROOM pilots who opted into public
              visibility. Landing rate is the softest touchdown - the higher
              (closer to zero fpm), the better.
            </p>
          </div>

          <nav className="leaderboard-tabs" aria-label="Leaderboard period">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`fids-tab ${period === p.id ? 'active' : ''}`}
                onClick={() => setPeriod(p.id)}
              >
                {p.label}
              </button>
            ))}
          </nav>

          <div className="community-panel">
            {loading ? (
              <div className="community-empty">LOADING LEADERBOARD...</div>
            ) : error ? (
              <div className="community-empty">LEADERBOARD UNAVAILABLE</div>
            ) : leaderboard.length === 0 ? (
              <div className="community-empty">
                No public flights yet. Link Discord in OPS ROOM and set visibility
                to <strong>public</strong> to appear here.
              </div>
            ) : (
              <table className="fids-table leaderboard-table">
                <thead>
                  <tr>
                    <th>RANK</th>
                    <th>PILOT</th>
                    {SORT_COLUMNS.map((col) => (
                      <th key={col.key}>
                        <button
                          type="button"
                          className={`leaderboard-sort ${sortKey === col.key ? 'active' : ''}`}
                          onClick={() => toggleSort(col.key)}
                          aria-sort={
                            sortKey === col.key
                              ? sortDir === 'asc' ? 'ascending' : 'descending'
                              : 'none'
                          }
                        >
                          {col.label}
                          <span className="sort-arrow">
                            {sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                          </span>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.username || i}>
                      <td className="mono-bold">{MEDALS[i] || `#${i + 1}`}</td>
                      <td className="mono-bold">
                        {row.username ? (
                          <Link to={`/profile/${encodeURIComponent(row.username)}`} style={{ color: 'inherit', textDecoration: 'underline dotted' }}>
                            {row.username}
                          </Link>
                        ) : (
                          'pilot'
                        )}
                      </td>
                      <td>{row.flights}</td>
                      <td>{row.hours.toFixed(1)}</td>
                      <td>{fmtRate(row.avg_landing_rate_fpm)}</td>
                      <td>{fmtRate(row.best_landing_rate_fpm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <p className="more-link">
            <Link to="/download" className="btn btn-ghost">Get OPS ROOM and join the leaderboard</Link>
          </p>
        </div>
      </section>
    </>
  );
}
