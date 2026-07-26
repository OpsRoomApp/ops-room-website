import { useState, useEffect, useCallback } from 'react';

const API = '/api/audit';

export default function AuditLog() {
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(50);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API}?limit=${limit}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { setEntries(d.entries || []); setError(''); })
      .catch(() => setError('Failed to load audit log'))
      .finally(() => setLoading(false));
  }, [limit]);

  useEffect(() => { load(); }, [load]);

  const badgeFor = (action) => {
    const a = (action || '').toLowerCase();
    if (a.includes('publish')) return <span className="badge badge-ok">PUBLISH</span>;
    if (a.includes('upload')) return <span className="badge" style={{ background: 'rgba(0,188,212,0.1)', color: 'var(--acc)' }}>UPLOAD</span>;
    if (a.includes('rollback')) return <span className="badge badge-warn">ROLLBACK</span>;
    if (a.includes('archive')) return <span className="badge" style={{ color: 'var(--fg-muted)' }}>ARCHIVE</span>;
    if (a.includes('test') || a.includes('validate')) return <span className="badge" style={{ background: 'rgba(0,188,212,0.1)', color: 'var(--acc)' }}>TEST</span>;
    if (a.includes('delete') || a.includes('fail')) return <span className="badge badge-err">FAILED</span>;
    return <span className="badge">{action}</span>;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>/ AUDIT LOG</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span className="dim" style={{ fontSize: '0.75rem' }}>Show</span>
          {[25, 50, 100, 200].map((n) => (
            <button key={n} className={`btn btn-sm ${limit === n ? 'btn-primary' : ''}`} onClick={() => setLimit(n)}>
              {n}
            </button>
          ))}
          <button className="btn btn-sm" onClick={load} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="mb-1"><span className="badge badge-err">ERROR</span> {error}</div>}

      {!loading && entries.length === 0 && (
        <div className="card">
          <div className="dim" style={{ textAlign: 'center', padding: '2rem', fontSize: '0.85rem' }}>
            No audit entries recorded yet. Actions like uploads, publishes, and rollbacks will appear here.
          </div>
        </div>
      )}

      <table className="data-table">
        <thead>
          <tr>
            <th style={{ width: '160px' }}>Time</th>
            <th style={{ width: '100px' }}>Action</th>
            <th>User</th>
            <th>Version</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i}>
              <td className="mono-dim" style={{ fontSize: '0.7rem' }}>{e.t?.slice(0, 19) || '-'}</td>
              <td>{badgeFor(e.action)}</td>
              <td className="mono-dim" style={{ fontSize: '0.75rem' }}>{e.user || '-'}</td>
              <td className="mono-dim" style={{ fontSize: '0.75rem' }}>{e.version ? `v${e.version}` : '-'}</td>
              <td className="dim" style={{ fontSize: '0.75rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.error || e.filename || (e.result ? `${e.result} / ${e.state || ''}` : '-')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {entries.length > 0 && (
        <div className="dim" style={{ marginTop: '0.5rem', fontSize: '0.7rem', textAlign: 'right' }}>
          Showing {entries.length} entries (max {limit})
        </div>
      )}
    </div>
  );
}
