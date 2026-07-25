import { useState, useEffect } from 'react';

const API = '/api/releases';

export default function Releases() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editFields, setEditFields] = useState({});
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [tab, setTab] = useState('manifest');

  const load = () => {
    fetch(API, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(setData)
      .catch(() => setError('Failed to load releases'));
  };

  useEffect(() => { load(); }, []);

  const handleEdit = () => {
    setEditFields({
      channel: data.manifest.channel || 'stable',
      mandatory: data.manifest.mandatory || false,
      notes: data.manifest.notes || '',
      message: data.manifest.message || '',
      codename: data.manifest.codename || '',
    });
    setEditMode(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const resp = await fetch(`${API}/manifest`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFields),
      });
      if (!resp.ok) {
        const body = await resp.json();
        setError(body.detail || 'Save failed');
      } else {
        setEditMode(false);
        load();
      }
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!confirm('Publish the staged release? This updates the live manifest and symlink.')) return;
    setPublishing(true);
    try {
      const resp = await fetch(`${API}/publish`, { method: 'POST', credentials: 'include' });
      const body = await resp.json();
      if (!resp.ok) {
        setError(body.detail || 'Publish failed');
      } else {
        load();
      }
    } catch {
      setError('Network error during publish');
    } finally {
      setPublishing(false);
    }
  };

  const handleRollback = async (filename) => {
    const version = filename.replace('OPS_ROOM_v', '').split('_Public')[0].replace(/_/g, '.');
    if (!confirm(`Roll back production to ${version}?\n\nA backup of the current manifest will be saved.\nThe ZIP file is never deleted.`)) return;

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

  if (error) return <div className="card"><span className="badge badge-err">ERROR</span> {error}</div>;
  if (!data) return <div style={{ color: 'var(--text-dim)', padding: '1.5rem' }}>Loading...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>/ RELEASE MANAGEMENT</h1>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem' }}>
        {['manifest', 'zips'].map((t) => (
          <button
            key={t}
            className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'manifest' ? 'Manifest' : `ZIPs (${data.zips.length})`}
          </button>
        ))}
      </div>

      {tab === 'manifest' && (
        <>
          {/* Staged release */}
          {data.staged && (
            <div className="card mb-2" style={{ borderColor: 'var(--acc)', background: 'rgba(0,188,212,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div className="card-head" style={{ marginBottom: '0.25rem' }}>STAGED — v{data.staged.version}</div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                    {data.staged.filename} · {data.staged.size_mb} MB · SHA256 {data.staged.sha256.slice(0, 16)}...
                  </span>
                </div>
                <button className="btn btn-primary" onClick={handlePublish} disabled={publishing}>
                  {publishing ? 'Publishing...' : 'Publish'}
                </button>
              </div>
            </div>
          )}

          {/* Manifest editor / viewer */}
          {editMode ? (
            <div className="card mb-2">
              <div className="card-head">EDIT MANIFEST</div>
              <div className="grid-2">
                <div className="form-group">
                  <label>Channel</label>
                  <select value={editFields.channel} onChange={(e) => setEditFields({ ...editFields, channel: e.target.value })}>
                    <option value="stable">stable</option>
                    <option value="beta">beta</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Mandatory</label>
                  <select value={String(editFields.mandatory)} onChange={(e) => setEditFields({ ...editFields, mandatory: e.target.value === 'true' })}>
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                </div>
              </div>
              <div className="form-group"><label>Codename</label><input value={editFields.codename} onChange={(e) => setEditFields({ ...editFields, codename: e.target.value })} /></div>
              <div className="form-group"><label>Message</label><input value={editFields.message} onChange={(e) => setEditFields({ ...editFields, message: e.target.value })} /></div>
              <div className="form-group"><label>Notes</label><textarea value={editFields.notes} onChange={(e) => setEditFields({ ...editFields, notes: e.target.value })} /></div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
                <button className="btn" onClick={() => setEditMode(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="card mb-2">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div className="card-head" style={{ marginBottom: 0 }}>ACTIVE MANIFEST</div>
                <button className="btn btn-sm" onClick={handleEdit}>Edit</button>
              </div>
              <div className="manifest-preview">{JSON.stringify(data.manifest, null, 2)}</div>
            </div>
          )}
        </>
      )}

      {tab === 'zips' && (
        <>
          <div className="section-label">ZIPS ON DISK (never deleted automatically)</div>
          <table className="data-table">
            <thead>
              <tr><th>Filename</th><th>Size</th><th>Modified</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {data.zips.map((z) => (
                <tr key={z.filename}>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{z.filename}</td>
                  <td>{z.size_mb} MB</td>
                  <td>{new Date(z.modified).toLocaleDateString()}</td>
                  <td>
                    <button className="btn btn-sm btn-danger" onClick={() => handleRollback(z.filename)}>
                      Rollback
                    </button>
                  </td>
                </tr>
              ))}
              {data.zips.length === 0 && (
                <tr><td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No release ZIPs found.</td></tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
