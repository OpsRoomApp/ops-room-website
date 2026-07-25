import { useState, useEffect } from 'react';

const API = '/api/health/system';

export default function Support() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch(API, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const copyUpdaterDiag = () => {
    const text = [
      'OPS ROOM Updater Diagnostic',
      '-----------------------------',
      `Update URL: https://opsroom.live/api/update.json`,
      `Fallback URL: https://github.com/OpsRoomApp/ops-room-releases/releases/latest`,
      `Timestamp: ${new Date().toISOString()}`,
    ].join('\n');
    navigator.clipboard.writeText(text).catch(() => {});
    alert('Diagnostic text copied to clipboard.');
  };

  const copyDownloadHelp = () => {
    const text = [
      'OPS ROOM Download Troubleshooting',
      '----------------------------------',
      '1. Check: https://opsroom.live/downloads/latest',
      '2. Check: https://opsroom.live/api/update.json',
      '3. Ensure your firewall allows outbound HTTPS (port 443).',
      '4. If the server is unreachable, the updater falls back to GitHub.',
      `Timestamp: ${new Date().toISOString()}`,
    ].join('\n');
    navigator.clipboard.writeText(text).catch(() => {});
    alert('Troubleshooting text copied to clipboard.');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>/ SUPPORT TOOLS</h1>
        <button className="btn btn-sm" onClick={load} disabled={loading}>
          {loading ? 'Checking...' : 'Refresh'}
        </button>
      </div>

      {/* System Status */}
      <div className="card mb-2">
        <div className="card-head">SYSTEM STATUS</div>
        {loading && <div className="loading-state">Checking services...</div>}
        {!loading && !data && <div className="dim">Could not fetch system status.</div>}
        {data && (
          <div>
            <div style={{ marginBottom: '0.75rem' }}>
              <span className={data.all_online ? 'badge badge-ok' : 'badge badge-err'}>
                {data.all_online ? 'ALL ONLINE' : 'DEGRADED'}
              </span>
              <span className="mono-dim" style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}>{data.checked_at}</span>
            </div>
            {data.services.map((s) => (
              <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.8rem' }}>
                <span>{s.name}</span>
                <span>
                  <span className={`badge ${s.online ? 'badge-ok' : 'badge-err'}`}>{s.online ? 'ONLINE' : 'OFFLINE'}</span>
                  <span className="mono-dim" style={{ marginLeft: '0.5rem', fontSize: '0.65rem' }}>{s.response_ms}ms</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Support utilities */}
      <div className="grid-2 mb-2">
        <div className="card">
          <div className="card-head">UPDATER DIAGNOSTICS</div>
          <p className="dim" style={{ fontSize: '0.8rem', marginBottom: '0.75rem' }}>
            Copy the updater diagnostic text to share with users who are having update issues.
          </p>
          <button className="btn btn-sm" onClick={copyUpdaterDiag}>Copy Updater Diagnostic</button>
        </div>
        <div className="card">
          <div className="card-head">DOWNLOAD TROUBLESHOOTING</div>
          <p className="dim" style={{ fontSize: '0.8rem', marginBottom: '0.75rem' }}>
            Copy a standard troubleshooting guide for users who cannot download OPS ROOM.
          </p>
          <button className="btn btn-sm" onClick={copyDownloadHelp}>Copy Download Help</button>
        </div>
      </div>

      {/* Release info */}
      <div className="card">
        <div className="card-head">QUICK REFERENCE</div>
        <div className="grid-2">
          <div>
            <div className="card-head" style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>MULTI-DOMAIN CERT</div>
            <code className="mono-dim" style={{ fontSize: '0.7rem' }}>certbot --nginx -d opsroom.live -d www.opsroom.live -d admin.opsroom.live</code>
          </div>
          <div>
            <div className="card-head" style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>UPDATE API URL</div>
            <code className="mono-dim" style={{ fontSize: '0.7rem' }}>https://opsroom.live/api/update.json</code>
          </div>
        </div>
      </div>
    </div>
  );
}
