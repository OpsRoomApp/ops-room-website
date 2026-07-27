import { useState, useEffect } from 'react';

const LICENSE_API = '/api/licenses';

export default function Licensing() {
  const [licenses, setLicenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genForm, setGenForm] = useState({ count: 1, tier: '', email: '', notes: '' });

  const load = () => {
    fetch(LICENSE_API, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => { setLicenses(data.licenses || []); })
      .catch(() => setError('Failed to load license data'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const resp = await fetch(`${LICENSE_API}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(genForm),
      });
      const body = await resp.json();
      if (!resp.ok) {
        setError(body.detail || 'Generation failed');
      } else {
        setGenForm({ count: 1, tier: '', email: '', notes: '' });
        load();
      }
    } catch {
      setError('Network error');
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = (key) => {
    if (!confirm(`Revoke license ${key.slice(0, 12)}...? This cannot be undone.`)) return;
    fetch(`${LICENSE_API}/${key}/revoke`, { method: 'POST', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(() => load())
      .catch(() => setError('Failed to revoke'));
  };

  const handleExtend = (key) => {
    const months = prompt('Extend by how many months?', '12');
    if (!months) return;
    fetch(`${LICENSE_API}/${key}/extend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ months: parseInt(months) }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(() => load())
      .catch(() => setError('Failed to extend'));
  };

  if (loading) return <div className="loading-state">Loading license data...</div>;

  const active = licenses.filter((l) => l.status === 'active');
  const revoked = licenses.filter((l) => l.status === 'revoked');
  const expired = licenses.filter((l) => l.status === 'expired');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>/ LICENSE MANAGEMENT</h1>
      </div>

      {error && <div className="mb-1"><span className="badge badge-err">ERROR</span> {error}</div>}

      <div className="grid-3 mb-2">
        <div className="card" style={{ borderLeft: '3px solid var(--green)' }}>
          <div className="card-head">ACTIVE</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{active.length}</div>
        </div>
        <div className="card" style={{ borderLeft: '3px solid var(--amber)' }}>
          <div className="card-head">EXPIRED</div>
          <div className="stat-value" style={{ color: 'var(--amber)' }}>{expired.length}</div>
        </div>
        <div className="card" style={{ borderLeft: '3px solid var(--red)' }}>
          <div className="card-head">REVOKED</div>
          <div className="stat-value" style={{ color: 'var(--red)' }}>{revoked.length}</div>
        </div>
      </div>

      <div className="card mb-2" style={{ borderColor: 'var(--acc)', background: 'rgba(0,188,212,0.03)' }}>
        <div className="card-head">GENERATE NEW LICENSES</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginTop: '0.5rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Count</label>
            <input type="number" min="1" max="100" value={genForm.count} onChange={(e) => setGenForm({ ...genForm, count: parseInt(e.target.value) || 1 })} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Tier</label>
            <select value={genForm.tier} onChange={(e) => setGenForm({ ...genForm, tier: e.target.value })}>
              <option value="">(Any)</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Email (optional)</label>
            <input value={genForm.email} onChange={(e) => setGenForm({ ...genForm, email: e.target.value })} placeholder="customer@email.com" />
          </div>
          <div className="form-group" style={{ marginBottom: 0, display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-primary btn-sm" onClick={handleGenerate} disabled={generating}>
              {generating ? 'Generating...' : `Generate ${genForm.count}`}
            </button>
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: 0, marginTop: '0.75rem' }}>
          <label>Notes</label>
          <input value={genForm.notes} onChange={(e) => setGenForm({ ...genForm, notes: e.target.value })} placeholder="Batch description..." />
        </div>
      </div>

      <table className="data-table">
        <thead>
          <tr><th>License Key</th><th>Tier</th><th>Status</th><th>Email</th><th>Issued</th><th>Expires</th><th>Notes</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {licenses.length === 0 && (
            <tr><td colSpan="8" className="empty-state">No licenses generated yet. Use the form above to create license keys.</td></tr>
          )}
          {licenses.map((l) => (
            <tr key={l.key}>
              <td className="mono-dim" style={{ fontSize: '0.75rem' }}>{l.key}</td>
              <td><span className="badge badge-stable">{l.tier || 'standard'}</span></td>
              <td>
                <span className={`badge badge-${l.status === 'active' ? 'ok' : l.status === 'expired' ? 'warn' : 'err'}`}>
                  {l.status}
                </span>
              </td>
              <td className="dim" style={{ fontSize: '0.75rem' }}>{l.email || '-'}</td>
              <td className="dim" style={{ fontSize: '0.7rem' }}>{l.issued_at?.slice(0, 10) || '-'}</td>
              <td className="dim" style={{ fontSize: '0.7rem', color: l.expires_at && new Date(l.expires_at) < new Date() ? 'var(--red)' : 'inherit' }}>
                {l.expires_at?.slice(0, 10) || 'Never'}
              </td>
              <td className="dim" style={{ fontSize: '0.7rem', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {l.notes || '-'}
              </td>
              <td>
                <button className="btn btn-sm" onClick={() => handleExtend(l.key)}>Extend</button>
                {l.status === 'active' && (
                  <button className="btn btn-sm btn-danger" style={{ marginLeft: '0.4rem' }} onClick={() => handleRevoke(l.key)}>Revoke</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
