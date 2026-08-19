import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import SEO from '../components/SEO.jsx';

function fmtRate(value) {
  if (value === null || value === undefined) return '-';
  return `${Math.round(value)} fpm`;
}

function fmtDate(value) {
  if (!value) return '';
  try {
    const d = new Date(String(value).replace(' ', 'T') + (String(value).includes('Z') ? '' : 'Z'));
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return value;
  }
}

export default function PilotProfile() {
  const { username } = useParams();
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    let alive = true;
    setState({ loading: true, error: null, data: null });
    fetch(`/api/community/profile?user=${encodeURIComponent(username || '')}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => { if (alive) setState({ loading: false, error: null, data: d }); })
      .catch((e) => { if (alive) setState({ loading: false, error: e.message, data: null }); });
    return () => { alive = false; };
  }, [username]);

  const stats = state.data?.stats || {};
  const flights = state.data?.flights || [];

  return (
    <>
      <SEO
        title={`${username || 'Pilot'} — Flight Profile · OPS ROOM`}
        description={`${username || 'Pilot'}'s public flight log: hours flown, landings and landing rate, tracked by the OPS ROOM community.`}
        path={`profile/${encodeURIComponent(username || '')}`}
      />
      <section className="section" style={{ minHeight: '70vh' }}>
        <div className="container" style={{ maxWidth: '980px' }}>
          <span className="section-eyebrow" style={{ display: 'flex', justifyContent: 'center' }}>
            / PUBLIC FLIGHT PROFILE
          </span>
          <h1 style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', margin: '1rem 0 .5rem' }}>
            {username || 'PILOT'}
          </h1>
          <p style={{ textAlign: 'center', color: 'var(--fg-soft)', margin: '0 0 2rem' }}>
            Flights shared publicly with the OPS ROOM community. Only public-visibility
            flights appear here.
          </p>

          {state.loading && <div style={{ textAlign: 'center', color: 'var(--fg-soft)' }}>LOADING PROFILE...</div>}

          {state.error && !state.loading && (
            <div style={{ textAlign: 'center', color: 'var(--fg-soft)' }}>
              <p>This profile could not be loaded. The pilot may not have shared any public flights yet.</p>
              <Link to="/leaderboard" className="btn btn-primary" style={{ marginTop: '1rem' }}>Back to Leaderboard</Link>
            </div>
          )}

          {!state.loading && !state.error && (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '0.75rem',
                  marginBottom: '2rem',
                }}
              >
                {[
                  ['FLIGHTS', String(stats.flights ?? 0)],
                  ['HOURS', String(stats.hours ?? 0)],
                  ['AVG LANDING', fmtRate(stats.average_landing_rate_fpm)],
                  ['BEST LANDING', fmtRate(stats.best_landing_rate_fpm)],
                  ['AIRFRAMES', String((stats.aircraft || []).length || '-')],
                ].map(([label, value]) => (
                  <div key={label} style={{ border: '1px solid var(--line)', padding: '1rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.72rem', letterSpacing: '.14em', color: 'var(--fg-soft)', marginBottom: '.4rem' }}>
                      {label}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.15rem', fontWeight: 700 }}>{value}</div>
                  </div>
                ))}
              </div>

              {flights.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--fg-soft)', padding: '3rem 0' }}>
                  No public flights yet. Fly with OPS ROOM and choose Public visibility in the app to build this log.
                  <div style={{ marginTop: '1.25rem' }}>
                    <Link to="/download" className="btn btn-primary">Get OPS ROOM</Link>
                  </div>
                </div>
              ) : (
                <div style={{ overflow: 'auto', border: '1px solid var(--line)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'var(--fg-soft)', fontSize: '0.7rem', letterSpacing: '.12em' }}>
                        <th style={{ padding: '.7rem .9rem' }}>DATE</th>
                        <th style={{ padding: '.7rem .9rem' }}>CALLSIGN</th>
                        <th style={{ padding: '.7rem .9rem' }}>ROUTE</th>
                        <th style={{ padding: '.7rem .9rem' }}>AIRCRAFT</th>
                        <th style={{ padding: '.7rem .9rem' }}>HOURS</th>
                        <th style={{ padding: '.7rem .9rem' }}>LANDING</th>
                        <th style={{ padding: '.7rem .9rem' }}>G</th>
                        <th style={{ padding: '.7rem .9rem' }}>SCORE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flights.map((f, i) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--line-soft)' }}>
                          <td style={{ padding: '.7rem .9rem', whiteSpace: 'nowrap' }}>{fmtDate(f.submitted_at)}</td>
                          <td style={{ padding: '.7rem .9rem', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{f.callsign || '-'}</td>
                          <td style={{ padding: '.7rem .9rem', fontFamily: 'var(--font-mono)' }}>
                            {f.departure || '----'} → {f.arrival || '----'}
                          </td>
                          <td style={{ padding: '.7rem .9rem' }}>{f.aircraft || '-'}{f.registration ? ` · ${f.registration}` : ''}</td>
                          <td style={{ padding: '.7rem .9rem' }}>
                            {f.duration_min != null ? (f.duration_min / 60).toFixed(1) : '-'}
                          </td>
                          <td style={{ padding: '.7rem .9rem', fontFamily: 'var(--font-mono)' }}>{fmtRate(f.landing_rate_fpm)}</td>
                          <td style={{ padding: '.7rem .9rem', fontFamily: 'var(--font-mono)' }}>
                            {f.touchdown_g != null ? Number(f.touchdown_g).toFixed(2) : '-'}
                          </td>
                          <td style={{ padding: '.7rem .9rem', fontFamily: 'var(--font-mono)' }}>{f.score != null ? Math.round(f.score) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ textAlign: 'center', margin: '2rem 0' }}>
                <Link to="/leaderboard" className="btn">Back to Leaderboard</Link>
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}
