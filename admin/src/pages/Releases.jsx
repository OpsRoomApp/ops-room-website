import { useState, useEffect } from 'react';

const API = '/api/releases';

const STATE_BADGES = {
  draft: 'badge-warn',
  testing: 'badge-stable',
  published: 'badge-ok',
  archived: 'badge-err',
};

const STATE_LABELS = {
  draft: 'DRAFT',
  testing: 'TESTING',
  published: 'PUBLISHED',
  archived: 'ARCHIVED',
};

export default function Releases() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('all');
  const [stateMsg, setStateMsg] = useState('');

  const load = () => {
    fetch(API, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(setData)
      .catch(() => setError('Failed to load releases'));
  };

  useEffect(() => { load(); }, []);

  const handleState = async (version, newState) => {
    if (!confirm(`Set v${version} to ${newState.toUpperCase()}?`)) return;
    setStateMsg('');
    try {
      const resp = await fetch(`${API}/state/${version}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: newState }),
      });
      const body = await resp.json();
      if (!resp.ok) {
        setStateMsg(body.detail || 'Failed');
      } else {
        setStateMsg(`v${version} -> ${newState}`);
        load();
      }
    } catch {
      setStateMsg('Network error');
    }
  };

  const handleRollback = async (filename) => {
    const version = filename.replace('OPS_ROOM_v', '').split('_Public')[0].replace(/_/g, '.');
    if (!confirm(`Roll back production to v${version}?\\n\\nA backup of the current manifest will be saved.\\nThe ZIP file is never deleted.\\n\\nThis stops new installs from getting the current version, but does not revert existing installs.`)) return;
    try {
      const resp = await fetch(`${API}/rollback/${version}`, { method: 'POST', credentials: 'include' });
      if (!resp.ok) {
        const body = await resp.json();
        setError(body.detail || 'Rollback failed');
      } else {
        load();
      }
    } catch {
      setError('Network error during rollback');
    }
  };

  const handleArchive = async (version) => {
    if (!confirm(`Archive v${version}? The ZIP file remains on disk.`)) return;
    try {
      const resp = await fetch(`${API}/${version}`, { method: 'DELETE', credentials: 'include' });
      if (!resp.ok) {
        const body = await resp.json();
        setError(body.detail || 'Archive failed');
      } else {
        load();
      }
    } catch {
      setError('Network error');
    }
  };

  if (error) return <div className="card"><span className="badge badge-err">ERROR</span> {error}</div>;
  if (!data) return <div className="loading-state">Loading release data...</div>;

  const { catalog, zips } = data;
  const draftCount = catalog.filter((c) => c.state === 'draft').length;

  const filteredCatalog = tab === 'all'
    ? catalog
    : catalog.filter((c) => c.state === tab);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>/ RELEASE HISTORY</h1>
      </div>

      {stateMsg && <div className="card mb-1"><span className="badge badge-ok">OK</span> {stateMsg}</div>}

      {/* State tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {[
          { key: 'all', label: `All (${catalog.length})` },
          { key: 'draft', label: `Draft (${draftCount})` },
          { key: 'testing', label: `Testing (${catalog.filter((c) => c.state === 'testing').length})` },
          { key: 'published', label: `Published (${catalog.filter((c) => c.state === 'published').length})` },
          { key: 'archived', label: `Archived (${catalog.filter((c) => c.state === 'archived').length})` },
          { key: 'zips', label: `ZIPs (${zips.length})` },
        ].map((t) => (
          <button
            key={t.key}
            className={`btn btn-sm ${tab === t.key ? 'btn-primary' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab !== 'zips' && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Version</th>
              <th>Channel</th>
              <th>State</th>
              <th>Filename</th>
              <th>Size</th>
              <th>SHA256</th>
              <th>Published</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredCatalog.sort((a, b) => (b.uploaded_at || '').localeCompare(a.uploaded_at || '')).map((r) => (
              <tr key={r.version}>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>v{r.version}</td>
                <td><span className={`badge badge-${r.channel === 'beta' ? 'warn' : 'stable'}`}>{r.channel}</span></td>
                <td><span className={`badge ${STATE_BADGES[r.state] || 'badge-warn'}`}>{STATE_LABELS[r.state] || r.state}</span></td>
                <td className="mono-dim" style={{ fontSize: '0.7rem' }}>{r.filename}</td>
                <td>{r.size_mb} MB</td>
                <td className="mono-dim" style={{ fontSize: '0.65rem' }}>{r.sha256.slice(0, 12)}...</td>
                <td style={{ fontSize: '0.7rem' }}>{r.published_at ? new Date(r.published_at).toLocaleDateString() : r.uploaded_at ? new Date(r.uploaded_at).toLocaleDateString() : '-'}</td>
                <td style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                  {r.state === 'draft' && (
                    <>
                      <button className="btn btn-sm" onClick={() => handleState(r.version, 'testing')}>Test</button>
                      <button className="btn btn-sm btn-primary" onClick={() => handleState(r.version, 'published')}>Publish</button>
                    </>
                  )}
                  {r.state === 'testing' && (
                    <>
                      <button className="btn btn-sm" onClick={() => handleState(r.version, 'draft')}>Back to Draft</button>
                      <button className="btn btn-sm btn-primary" onClick={() => handleState(r.version, 'published')}>Publish</button>
                    </>
                  )}
                  {r.state === 'published' && (
                    <>
                      <button className="btn btn-sm" onClick={() => handleState(r.version, 'testing')}>Demote to Test</button>
                      <button className="btn btn-sm" onClick={() => handleArchive(r.version)}>Archive</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleRollback(r.filename)}>Rollback</button>
                    </>
                  )}
                  {r.state === 'archived' && (
                    <>
                      <button className="btn btn-sm" onClick={() => handleState(r.version, 'draft')}>Restore Draft</button>
                      <button className="btn btn-sm" onClick={() => handleRollback(r.filename)}>Rollback</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {filteredCatalog.length === 0 && (
              <tr><td colSpan="8" style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '1.5rem' }}>No releases in this state.</td></tr>
            )}
          </tbody>
        </table>
      )}

      {tab === 'zips' && (
        <table className="data-table">
          <thead>
            <tr><th>Filename</th><th>Size</th><th>Modified</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {zips.map((z) => (
              <tr key={z.filename}>
                <td className="mono-dim">{z.filename}</td>
                <td>{z.size_mb} MB</td>
                <td>{new Date(z.modified).toLocaleDateString()}</td>
                <td>
                  <button className="btn btn-sm btn-danger" onClick={() => handleRollback(z.filename)}>Rollback</button>
                </td>
              </tr>
            ))}
            {zips.length === 0 && (
              <tr><td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '1.5rem' }}>No release ZIPs found.</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
