import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import SEO from '../components/SEO.jsx';
import { PAGE_TITLES } from '../config/seo.js';

export default function Download() {
  const [manifest, setManifest] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('https://opsroom.live/api/update.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        setManifest(data);
        // Analytics are only recorded on actual download click, not page views.
      })
      .catch(() => setError('Could not fetch release information. The update server may be unreachable.'));
  }, []);

  const version = manifest?.latest_version || manifest?.version || '';
  const downloadUrl = manifest?.download_url || manifest?.url || '';
  const installerUrl = manifest?.installer_url || '';
  const codename = manifest?.codename || '';
  const channel = manifest?.channel || 'stable';
  const sha256 = manifest?.sha256 || '';
  const notes = manifest?.notes || '';

  const handleDownload = () => {
    if (downloadUrl) {
      fetch('https://admin.opsroom.live/api/analytics/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version }),
      }).catch(() => {});
    }
  };

  return (
    <>
      <SEO
        title={PAGE_TITLES.download}
        description="Download the latest version of OPS ROOM for Windows. Single-click installer with automatic updates."
        path="/download"
      />

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">/ DOWNLOADS</span>
            <h1 className="section-title">
              {manifest ? `OPS ROOM v${version}: Windows.` : 'OPS ROOM: Windows.'}
            </h1>
            <p className="section-subtitle">
              Stable public release. Installer is recommended; portable build is provided for
              users without admin rights. Every release is SHA256-verified before installation.
            </p>
          </div>

          {error && (
            <div className="panel" style={{ borderColor: 'rgba(255,23,68,0.3)', marginBottom: '1.5rem' }}>
              <div className="panel-body">
                <p style={{ color: 'var(--red)', fontSize: '0.85rem', margin: 0 }}>{error}</p>
              </div>
            </div>
          )}

          <div className="setup-note" style={{ marginBottom: '1.5rem' }}>
            <span className="setup-note-label">NEW HERE?</span>
            <p>
              Follow the <Link to="/getting-started">Install & Setup Guide</Link> - a visual,
              screen-by-screen walkthrough from download to first flight, mirroring exactly what
              happens in the app.
            </p>
          </div>

          <div className="dl-grid">
            <div className="dl-main">
              {manifest ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
                    <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.05rem', letterSpacing: '0.05em', color: 'var(--acc)' }}>
                      OPS ROOM v{version}
                    </h2>
                    <span className="tag">
                      <span className="tag-dot" /> {channel.toUpperCase()}
                    </span>
                  </div>
                  {codename && (
                    <p className="muted" style={{ marginTop: '0.25rem' }}>
                      Codename: {codename}
                    </p>
                  )}

                  <div className="dl-actions" style={{ marginTop: '1rem' }}>
                    <a
                      className="btn btn-primary"
                      href={installerUrl || downloadUrl}
                      rel="noopener noreferrer"
                      onClick={handleDownload}
                      style={{ fontSize: '1.05rem', padding: '0.75rem 2rem' }}
                    >
                      Download OPS ROOM
                    </a>
                    {installerUrl && downloadUrl && (
                      <a
                        className="btn btn-ghost"
                        href={downloadUrl}
                        rel="noopener noreferrer"
                        onClick={handleDownload}
                      >
                        Portable ZIP
                      </a>
                    )}
                    <Link className="btn btn-ghost" to="/changelog">
                      View Changelog
                    </Link>
                  </div>

                  <div className="dl-meta-line" style={{ marginTop: '1rem' }}>
                    <span>VERSION <strong>v{version}</strong></span>
                    {installerUrl && (
                      <span>INSTALLER <strong>EXE</strong></span>
                    )}
                    {sha256 && (
                      <span>SHA256 <strong className="mono">{sha256.slice(0, 16)}...</strong></span>
                    )}
                    <span>CHANNEL <strong>{channel}</strong></span>
                  </div>

                  {notes && (
                    <div className="panel" style={{ marginTop: '1rem' }}>
                      <div className="panel-head"><span className="panel-title">RELEASE NOTES</span></div>
                      <div className="panel-body">
                        <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{notes}</p>
                      </div>
                    </div>
                  )}
                </>
              ) : !error ? (
                <div style={{ color: 'var(--text-dim)', padding: '2rem 0', textAlign: 'center' }}>
                  Loading release information...
                </div>
              ) : null}
            </div>

            <div className="dl-side">
              <div className="panel">
                <div className="panel-head"><span className="panel-title">VERIFICATION</span></div>
                <div className="panel-body">
                  <p className="muted">
                    Every release is SHA256-verified against the manifest at{' '}
                    <code>opsroom.live/api/update.json</code>. The updater validates checksums before
                    installing.
                  </p>
                </div>
              </div>
              <div className="panel">
                <div className="panel-head"><span className="panel-title">UPDATE CHANNEL</span></div>
                <div className="panel-body">
                  <p className="muted">
                    OPS ROOM checks <code>opsroom.live/api/update.json</code> for new
                    versions. If the server is unreachable, it falls back to the GitHub
                    releases manifest automatically.
                  </p>
                </div>
              </div>
              <div className="panel">
                <div className="panel-head"><span className="panel-title">SUPPORT</span></div>
                <div className="panel-body">
                  <p className="muted">
                    Installer problems, telemetry issues, or aircraft adapter questions:{' '}
                    see <Link to="/support">Support</Link>, the{' '}
                    <Link to="/getting-started">Setup Guide</Link>, or{' '}
                    <Link to="/documentation">Documentation</Link>.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
