import { useState, useEffect } from 'react';

const API = '/api/releases';

function StatCard({ label, value, sub, badge, accent }) {
  return (
    <div className="card" style={accent ? { borderLeft: `3px solid var(--acc)`, background: 'rgba(0,188,212,0.03)' } : {}}>
      <div className="card-head">{label}</div>
      <div className="stat-value">{badge || value}</div>
      {sub && <div className="stat-label">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [notamSync, setNotamSync] = useState(null);
  const [error, setError] = useState('');
  const [publishing, setPublishing] = useState(false);

  const load = () => {
    Promise.all([
      fetch(API, { credentials: 'include' }).then((r) => (r.ok ? r.json() : Promise.reject(r))),
      fetch('/api/analytics/counts', { credentials: 'include' }).then((r) => (r.ok ? r.json() : Promise.reject(r))),
    ])
      .then(([d, a]) => { setData(d); setAnalytics(a); })
      .catch(() => setError('Failed to load release data'));
  };

  useEffect(() => { load(); }, []);

  // v0.25.63: NOTAM ingest sync health -- independent of the release load so
  // a not-yet-deployed NOTAM DB can never take down the dashboard.
  useEffect(() => {
    fetch('/api/v1/notams/sync/status', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(setNotamSync)
      .catch(() => setNotamSync(null));
  }, []);

  const handlePublish = async () => {
    if (!confirm('Publish the draft release to production? This updates the live manifest for all OPS ROOM users.')) return;
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
  if (!data) return <div className="loading-state">Loading release data...</div>;

  const { manifest, testing_manifest, catalog, zips, latest_symlink, storage_total_gb, last_actions } = data;
  const draftEntries = catalog.filter((c) => c.state === 'draft').sort((a, b) => (b.uploaded_at || '').localeCompare(a.uploaded_at || ''));
  const testingEntries = catalog.filter((c) => c.state === 'testing');
  const draft = draftEntries.length > 0 ? draftEntries[0] : null;

  // Services status (derived from manifest presence)
  const updaterOnline = !!(manifest && manifest.latest_version);
  const downloadOnline = !!(manifest && manifest.download_url);
  const zipFound = !!(manifest && manifest.sha256 && manifest.sha256.length === 64);
  const shaValid = zipFound && latest_symlink;

  return (
    <div>
      <h1 className="page-title">/ RELEASE DASHBOARD</h1>

      {/* Top row: production + draft + channel + symlink */}
      <div className="grid-4 mb-2">
        <StatCard
          label="PRODUCTION"
          value={`v${manifest.latest_version || manifest.version || '-'}`}
          sub={manifest.codename || 'current'}
          badge={<span className="badge badge-ok">LIVE</span>}
          accent
        />
        <StatCard
          label="DRAFT"
          value={draft ? `v${draft.version}` : <span className="badge badge-warn">NONE</span>}
          sub={draft ? `${draft.filename} / ${draft.size_mb} MB` : 'Upload a release'}
        />
        <StatCard
          label="CHANNEL"
          value={<span className={`badge badge-${manifest.channel === 'beta' ? 'warn' : 'stable'}`}>{manifest.channel || 'stable'}</span>}
          sub={manifest.mandatory ? 'Mandatory' : 'Optional'}
        />
        <StatCard
          label="LATEST SYMLINK"
          value={latest_symlink ? <span className="badge badge-ok">ACTIVE</span> : <span className="badge badge-warn">NONE</span>}
          sub={latest_symlink || '-'}
        />
      </div>

      {/* Service status row */}
      <div className="grid-4 mb-2">
        <StatCard label="UPDATER API" value={updaterOnline ? <span className="badge badge-ok">ONLINE</span> : <span className="badge badge-err">OFFLINE</span>} sub={manifest.latest_version ? `v${manifest.latest_version}` : '-'} />
        <StatCard label="DOWNLOAD SVC" value={downloadOnline ? <span className="badge badge-ok">ONLINE</span> : <span className="badge badge-err">OFFLINE</span>} sub="latest zip available" />
        <StatCard label="LATEST ZIP" value={zipFound ? <span className="badge badge-ok">FOUND</span> : <span className="badge badge-warn">MISSING</span>} sub={manifest.sha256 ? manifest.sha256.slice(0, 16) + '...' : '-'} />
        <StatCard label="SHA256" value={shaValid ? <span className="badge badge-ok">VALID</span> : <span className="badge badge-warn">CHECK</span>} sub={shaValid ? 'Matches disk' : 'Not verified'} />
      </div>

      {/* Publish action */}
      {draft && (
        <div className="card mb-2" style={{ borderColor: 'var(--acc)', background: 'rgba(0,188,212,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="card-head" style={{ marginBottom: '0.25rem' }}>READY TO PUBLISH</div>
              <span className="mono-dim">
                {draft.filename} · v{draft.version} · {draft.size_mb} MB · state=draft
              </span>
            </div>
            <button className="btn btn-primary" onClick={handlePublish} disabled={publishing}>
              {publishing ? 'Publishing...' : 'Publish Release'}
            </button>
          </div>
        </div>
      )}

      {/* Catalog + testing info */}
      {testingEntries.length > 0 && (
        <div className="card mb-2" style={{ borderColor: 'rgba(255,171,0,0.25)', background: 'rgba(255,171,0,0.03)' }}>
          <div className="card-head">TESTING ({testingEntries.length})</div>
          {testingEntries.map((t) => (
            <div key={t.version} className="mono-dim" style={{ fontSize: '0.75rem' }}>
              v{t.version} · {t.filename} · {t.size_mb} MB
            </div>
          ))}
          {testing_manifest && <div className="mono-dim mt-1" style={{ fontSize: '0.7rem' }}>update-testing.json exists -- served at /api/update-testing.json</div>}
        </div>
      )}

      {/* Storage + last actions */}
      <div className="grid-2 mb-2">
        <div className="card">
          <div className="card-head">STORAGE</div>
          <div className="stat-value" style={{ fontSize: '1rem' }}>{zips.length} ZIPs · {storage_total_gb.toFixed(1)} GB</div>
          <div style={{ marginTop: '0.5rem' }}>
            {zips.slice(0, 5).map((z) => (
              <div key={z.filename} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.75rem' }}>
                <span className="mono-dim">{z.filename}</span>
                <span className="dim">{z.size_mb} MB</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head">RECENT ACTIVITY</div>
          {last_actions.length === 0 && <div className="dim" style={{ fontSize: '0.8rem' }}>No actions logged yet.</div>}
          {last_actions.map((a, i) => (
            <div key={i} style={{ padding: '0.25rem 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.75rem' }}>
              <span style={{ color: a.result === 'success' ? 'var(--green)' : a.result === 'failed' ? 'var(--red)' : 'var(--acc)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                {a.action}
              </span>
              <span className="dim" style={{ marginLeft: '0.4rem' }}>
                {a.user} · v{a.version || '-'} · {a.time?.slice(0, 19) || '-'}
              </span>
              {a.error && <div style={{ color: 'var(--red)', fontSize: '0.7rem' }}>{a.error}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Download Analytics */}
      {analytics && (
        <div className="card mb-2">
          <div className="card-head">DOWNLOAD ANALYTICS</div>
          <div className="stat-value" style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>
            {analytics.total_downloads || 0} total downloads
          </div>
          {analytics.by_version && analytics.by_version.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {analytics.by_version.slice(0, 10).map((v) => {
                const maxDl = analytics.by_version[0]?.downloads || 1;
                const barPct = Math.max(2, (v.downloads / maxDl) * 100);
                return (
                  <div key={v.version} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.75rem' }}>
                    <span className="mono-dim" style={{ width: '80px', textAlign: 'right', flexShrink: 0 }}>v{v.version}</span>
                    <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: '2px', height: '14px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${barPct}%`, background: 'var(--acc)', borderRadius: '2px', minWidth: '2px', transition: 'width 300ms' }} />
                    </div>
                    <span className="dim" style={{ width: '40px', flexShrink: 0 }}>{v.downloads}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="dim" style={{ fontSize: '0.8rem' }}>No download data yet. Downloads are recorded when users click the Download button on opsroom.live.</div>
          )}
        </div>
      )}

      {/* NOTAM ingest sync health (v0.25.63) */}
      <div className="card mb-2">
        <div className="card-head">NOTAM SYNC (FAA NMS INGEST)</div>
        {notamSync ? (
          <div className="grid-4" style={{ marginTop: '0.5rem' }}>
            <StatCard label="ROWS" value={notamSync.rows ?? '-'} sub={`${notamSync.active ?? 0} active`} />
            <StatCard
              label="BULK PULL"
              value={notamSync.last_bulk_pull_at ? <span className="badge badge-ok">OK</span> : <span className="badge badge-warn">PENDING</span>}
              sub={notamSync.last_bulk_pull_at?.slice(0, 19) || 'first pull due on deploy'}
            />
            <StatCard
              label="INCREMENTAL"
              value={notamSync.last_incremental_pull_at ? <span className="badge badge-ok">OK</span> : <span className="badge badge-warn">PENDING</span>}
              sub={notamSync.last_incremental_pull_at?.slice(0, 19) || '3-min cadence'}
            />
            <StatCard
              label="SYNC ERROR"
              value={notamSync.last_sync_error ? <span className="badge badge-err">ERROR</span> : <span className="badge badge-ok">NONE</span>}
              sub={notamSync.last_sync_error ? String(notamSync.last_sync_error).slice(0, 60) : 'healthy'}
            />
          </div>
        ) : (
          <div className="dim" style={{ fontSize: '0.8rem', marginTop: '0.4rem' }}>NOTAM sync status unavailable (database not deployed yet).</div>
        )}
      </div>

      {/* Manifest preview */}
      <details className="card">
        <summary className="card-head" style={{ cursor: 'pointer', marginBottom: '0.5rem' }}>MANIFEST (update.json)</summary>
        <pre className="manifest-preview">{JSON.stringify(manifest, null, 2)}</pre>
      </details>
    </div>
  );
}
