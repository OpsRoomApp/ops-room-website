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

export default function Leaderboard() {
  const [period, setPeriod] = useState('alltime');
  const { leaderboard, loading, error } = useCommunityLeaderboard(period);

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
            <h2 className="section-title">Flight leaderboard.</h2>
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
                    <th>FLIGHTS</th>
                    <th>HOURS</th>
                    <th>AVG LANDING</th>
                    <th>BEST LANDING</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((row, i) => (
                    <tr key={row.username || i}>
                      <td className="mono-bold">{MEDALS[i] || `#${i + 1}`}</td>
                      <td className="mono-bold">{row.username || 'pilot'}</td>
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
