import { useState, useEffect } from 'react';

const API = '/api/releases';

function StatCard({ label, value, sub, badge }) {
  return (
    <div className="card">
      <div className="card-head">{label}</div>
      <div className="stat-value">
        {badge || value}
      </div>
      {sub && <div className="stat-label">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [publishing, setPublishing] = useState(false);

  const load = () => {
    fetch(API, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(setData)
      .catch(() => setError('Failed to load release data'));
  };

  useEffect(() => { load(); }, []);

  const handlePublish = async () => {
    if (!confirm('Publish the staged release to production? This makes it available to all OPS ROOM users.')) return;
    setPublishing(true);
    try {
      const resp = await fetch('/api/releases/publish', { method: 'POST', credentials: 'include' });
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

  if (error) return <div className="card"><span className="badge badge-err">ERROR</span> {error}</div>;
  if (!data) return <div style={{ color: 'var(--text-dim)', padding: '1.5rem' }}>Loading...</div>;

  const { manifest, staged, zips, latest_symlink, storage_total_gb, last_actions } = data;

  return (
    <div>
      <h1 className="page-title">/ RELEASE DASHBOARD</h1>

      {/* Top row: production + staged status */}
      <div className="grid-4 mb-2">
        <StatCard
          label="PRODUCTION"
          value={`v${manifest.latest_version || manifest.version || '-'}`}
          sub={manifest.codename || 'current'}
          badge={<span className="badge badge-ok">LIVE</span>}
        />
        <StatCard
          label="STAGED"
          value={staged ? `v${staged.version}` : <span className="badge badge-warn">NONE</span>}
          sub={staged ? `${staged.filename} · ${staged.size_mb} MB` : 'Upload a release first'}
        />
        <StatCard
          label="CHANNEL"
          value={<span className={`badge badge-${manifest.channel === 'beta' ? 'warn' : 'stable'}`}>{manifest.channel || 'stable'}</span>}
          sub={manifest.mandatory ? 'Mandatory update' : 'Optional'}
        />
        <StatCard
          label="LATEST SYMLINK"
          value={latest_symlink ? <span className="badge badge-ok">ACTIVE</span> : <span className="badge badge-warn">NONE</span>}
          sub={latest_symlink || '-'}
        />
      </div>

      {/* Publish action row */}
      {staged && (
        <div className="card mb-2" style={{ borderColor: 'var(--acc)', background: 'rgba(0,188,212,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="card-head" style={{ marginBottom: '0.25rem' }}>READY TO PUBLISH</div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                {staged.filename} · v{staged.version} · {staged.size_mb} MB · channel={staged.channel}
              </span>
            </div>
            <button className="btn btn-primary" onClick={handlePublish} disabled={publishing}>
              {publishing ? 'Publishing...' : 'Publish Release'}
            </button>
          </div>
        </div>
      )}

      {/* Second row: storage + last actions */}
      <div className="grid-2 mb-2">
        <div className="card">
          <div className="card-head">STORAGE</div>
          <div className="stat-value" style={{ fontSize: '1.1rem' }}>{zips.length} ZIPs · {storage_total_gb.toFixed(1)} GB</div>
          <div style={{ marginTop: '0.5rem' }}>
            {zips.slice(0, 6).map((z) => (
              <div key={z.filename} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.78rem' }}>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{z.filename}</span>
                <span style={{ color: 'var(--text-dim)' }}>{z.size_mb} MB</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head">LAST ACTIONS</div>
          {last_actions.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>No actions logged yet.</div>}
          {last_actions.map((a, i) => (
            <div key={i} style={{ padding: '0.3rem 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.78rem' }}>
              <span style={{ color: a.result === 'success' ? 'var(--green)' : a.result === 'failed' ? 'var(--red)' : 'var(--acc)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                {a.action}
              </span>
              <span style={{ color: 'var(--text-dim)', marginLeft: '0.5rem' }}>
                {a.user} · v{a.version || '-'} · {a.time?.slice(0, 19) || '-'}
              </span>
              {a.error && <div style={{ color: 'var(--red)', fontSize: '0.7rem' }}>{a.error}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Manifest preview */}
      <div className="card">
        <div className="card-head">MANIFEST</div>
        <div className="manifest-preview">{JSON.stringify(manifest, null, 2)}</div>
      </div>
    </div>
  );
}
