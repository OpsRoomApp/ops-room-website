import { useState, useCallback } from 'react';

const API = '/api/health';

export default function Health() {
  const [data, setData] = useState(null);
  const [diag, setDiag] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('health');
  const [testStatus, setTestStatus] = useState('');

  const check = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(API, { credentials: 'include' }).then((r) => (r.ok ? r.json() : Promise.reject(r))),
      tab === 'diag' ? fetch(`${API}/diagnostics`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : Promise.reject(r))) : Promise.resolve(null),
    ])
      .then(([d, di]) => { setData(d); setDiag(di); setError(''); })
      .catch(() => setError('Health check failed'))
      .finally(() => setLoading(false));
  }, [tab]);

  const badge = (status) =>
    status === 'PASS'
      ? <span className="badge badge-ok">PASS</span>
      : <span className="badge badge-err">FAIL</span>;

  const runNotificationTest = async () => {
    setTestStatus('Testing...');
    try {
      const resp = await fetch(`${API}/test-notify`, { method: 'POST', credentials: 'include' });
      const body = await resp.json();
      setTestStatus(body.ok ? 'Test sent. Check your notification channel.' : (body.detail || 'Test failed'));
    } catch {
      setTestStatus('Network error during test');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>/ SYSTEM HEALTH</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            {['health', 'diag'].map((t) => (
              <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)}>
                {t === 'health' ? 'Health' : 'Diagnostics'}
              </button>
            ))}
          </div>
          <button className="btn btn-sm" onClick={check} disabled={loading}>
            {loading ? 'Checking...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="mb-1"><span className="badge badge-err">ERROR</span> {error}</div>}

      {tab === 'health' && data && (
        <>
          <div className="card mb-2">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="card-head" style={{ marginBottom: 0 }}>OVERALL</div>
              <div className="stat-value">
                {data.healthy ? <span className="badge badge-ok">HEALTHY</span> : <span className="badge badge-err">DEGRADED</span>}
              </div>
            </div>
            <div className="stat-label" style={{ marginTop: '0.25rem' }}>
              {data.passed}/{data.total} checks passed{data.failed > 0 ? ` / ${data.failed} failed` : ''}
            </div>
          </div>

          <div className="card mb-2" style={{ borderColor: 'rgba(0,188,212,0.2)', background: 'rgba(0,188,212,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div className="card-head" style={{ marginBottom: '0.25rem' }}>NOTIFICATION TEST</div>
                <span className="mono-dim" style={{ fontSize: '0.7rem' }}>
                  Verify that alerting and webhook delivery is functional.
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {testStatus && <span className="mono-dim" style={{ fontSize: '0.7rem' }}>{testStatus}</span>}
                <button className="btn btn-sm" onClick={runNotificationTest}>
                  Send Test Alert
                </button>
              </div>
            </div>
          </div>

          <table className="data-table">
            <thead>
              <tr><th>Check</th><th>Status</th><th>Detail</th></tr>
            </thead>
            <tbody>
              {data.checks.map((c, i) => (
                <tr key={i}>
                  <td className="mono-dim" style={{ fontSize: '0.75rem' }}>{c.name}</td>
                  <td>{badge(c.status)}</td>
                  <td className="mono-dim" style={{ fontSize: '0.7rem' }}>
                    {c.detail && typeof c.detail === 'object'
                      ? Object.entries(c.detail)
                          .filter(([, v]) => v !== null && v !== undefined && String(v) !== '')
                          .map(([k, v]) => `${k}=${v}`)
                          .join(' / ')
                      : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {tab === 'diag' && diag && (
        <>
          <div className="grid-2 mb-2">
            <div className="card">
              <div className="card-head">PRODUCTION MANIFEST</div>
              <pre className="manifest-preview">{JSON.stringify(diag.production_manifest, null, 2)}</pre>
            </div>
            <div className="card">
              <div className="card-head">LIVE FETCH ({diag.live_manifest_fetch?.status})</div>
              <pre className="manifest-preview">{JSON.stringify(diag.live_manifest_fetch?.data, null, 2)}</pre>
            </div>
          </div>

          <div className="grid-2 mb-2">
            <div className="card">
              <div className="card-head">RELEASES DIRECTORY</div>
              <div className="stat-value" style={{ fontSize: '0.9rem' }}>{diag.releases_directory?.zip_count} ZIPs</div>
              <div className="mono-dim mt-1" style={{ fontSize: '0.7rem', maxHeight: '150px', overflow: 'auto' }}>
                {diag.releases_directory?.zips?.map((z) => <div key={z}>{z}</div>)}
              </div>
            </div>
            <div className="card">
              <div className="card-head">TESTING MANIFEST</div>
              <pre className="manifest-preview">{JSON.stringify(diag.testing_manifest, null, 2)}</pre>
            </div>
          </div>

          <div className="card">
            <div className="card-head">SYMLINK / DISK</div>
            <div className="mono-dim" style={{ fontSize: '0.8rem' }}>
              latest_symlink_target = {diag.latest_symlink_target || '(none)'}<br />
              releases_dir = {diag.releases_directory?.path}<br />
              exists = {String(diag.releases_directory?.exists)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
