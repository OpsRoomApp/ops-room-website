import { useState, useEffect } from 'react';

const API = '/api/health';

export default function Health() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const check = () => {
    setLoading(true);
    fetch(API, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { setData(d); setError(''); })
      .catch(() => setError('Health check failed'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { check(); }, []);

  const badge = (status) =>
    status === 'PASS'
      ? <span className="badge badge-ok">PASS</span>
      : <span className="badge badge-err">FAIL</span>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>/ SYSTEM HEALTH</h1>
        <button className="btn btn-sm" onClick={check} disabled={loading}>
          {loading ? 'Checking...' : 'Refresh'}
        </button>
      </div>

      {error && <div className="mb-1"><span className="badge badge-err">ERROR</span> {error}</div>}

      {data && (
        <>
          {/* Overall status */}
          <div className="card mb-2">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="card-head" style={{ marginBottom: 0 }}>OVERALL</div>
              <div className="stat-value">
                {data.healthy ? <span className="badge badge-ok">HEALTHY</span> : <span className="badge badge-err">DEGRADED</span>}
              </div>
            </div>
            <div className="stat-label" style={{ marginTop: '0.25rem' }}>
              {data.passed}/{data.total} checks passed{data.failed > 0 ? ` · ${data.failed} failed` : ''}
            </div>
          </div>

          {/* Individual checks */}
          <table className="data-table">
            <thead>
              <tr><th>Check</th><th>Status</th><th>Detail</th></tr>
            </thead>
            <tbody>
              {data.checks.map((c, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{c.name}</td>
                  <td>{badge(c.status)}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                    {c.detail && typeof c.detail === 'object'
                      ? Object.entries(c.detail)
                          .filter(([, v]) => v !== null && v !== undefined && String(v) !== '')
                          .map(([k, v]) => `${k}=${v}`)
                          .join(' · ')
                      : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
