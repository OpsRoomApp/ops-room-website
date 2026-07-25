import { Link } from 'react-router-dom';
import SEO from '../components/SEO.jsx';
import { PAGE_TITLES } from '../config/seo.js';

const VERSIONS = [
  { v: 'v0.25.0', date: '2026-07-25', note: 'Public Release: ChartFox runtime diagnostics; finance UI polish.' },
  { v: 'v0.25.11', date: '2026-07-09', note: 'Recorder v2 schema: sidestick fields appended at tail.' },
  { v: 'v0.25.10', date: '2026-06-22', note: 'Chart rendering: ChartFox & Navigraph catalog integration.' },
  { v: 'v0.25.9',  date: '2026-06-04', note: 'Universal Announcer: distance-based volume curve.' },
  { v: 'v0.25.8',  date: '2026-05-19', note: 'Module preloader: TTL cache for slow endpoints.' },
  { v: 'v0.25.7',  date: '2026-05-02', note: 'Bug fix release: finance & dispatch controls.' },
];

export default function Download() {
  return (
    <>
      <SEO
        title={PAGE_TITLES.download}
        description="Download the latest version of OPS ROOM for Windows. Includes installer, portable build, and full version history."
        path="/download"
      />

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">/ DOWNLOADS</span>
            <h1 className="section-title">OPS ROOM v0.25.0: Windows.</h1>
            <p className="section-subtitle">
              Stable public release. Installer is recommended; portable build is provided for
              users without admin rights.
            </p>
          </div>

          <div className="dl-grid">
            <div className="dl-main">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
                <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.05rem', letterSpacing: '0.05em', color: 'var(--acc)' }}>OPS ROOM v0.25.0</h2>
                <span className="tag"><span className="tag-dot" /> STABLE</span>
              </div>
              <p className="muted" style={{ marginTop: '0.5rem' }}>
                Updated 2026-07-25 · Windows 10/11 · x64
              </p>
              <div className="dl-actions">
                <a className="btn btn-primary" href="https://github.com/opsroom/opsroom/releases/latest" rel="noopener noreferrer" target="_blank">Download Installer</a>
                <a className="btn btn-ghost"   href="https://github.com/opsroom/opsroom/releases/latest" rel="noopener noreferrer" target="_blank">Portable (.zip)</a>
                <a className="btn btn-ghost"   href="https://github.com/opsroom/opsroom/releases/latest" rel="noopener noreferrer" target="_blank">Release Notes</a>
              </div>
              <div className="dl-meta-line">
                <span>BUILD · <strong></strong></span>
                <span>SIZE · <strong>≈ 184 MB</strong></span>
                <span>SHA256 · <strong>7e4f...b12a</strong></span>
                <span>PYTHON · <strong>3.11.9</strong></span>
              </div>

              <table className="spec-table" style={{ marginTop: '1rem' }}>
                <tbody>
                  <tr><th>Recommended</th><td className="spec-v">Windows 11 · 8 GB RAM · SSD</td></tr>
                  <tr><th>Minimum</th><td className="spec-v">Windows 10 (1909+) · 4 GB RAM</td></tr>
                  <tr><th>Sim</th><td className="spec-v">Microsoft Flight Simulator 2020 / 2024</td></tr>
                  <tr><th>Privileges</th><td className="spec-v">Standard user: no admin required for portable</td></tr>
                </tbody>
              </table>
            </div>

            <div className="dl-side">
              <div className="panel">
                <div className="panel-head"><span className="panel-title">VERIFICATION</span></div>
                <div className="panel-body">
                  <p className="muted">Every release is hash-verified and signature-checked. A onefile updater transparently ensures the binary matches the manifest channel.</p>
                </div>
              </div>
              <div className="panel">
                <div className="panel-head"><span className="panel-title">SUPPORT</span></div>
                <div className="panel-body">
                  <p className="muted">Installer problems, telemetry issues, or aircraft adapter questions: see <Link to="/support">Support</Link> or <Link to="/documentation">Documentation</Link>.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="section-head" style={{ marginTop: '2.5rem' }}>
            <span className="section-eyebrow">/ VERSION HISTORY</span>
            <h2 className="section-title">Recent releases.</h2>
          </div>
          <div className="version-list">
            {VERSIONS.map((v) => (
              <div key={v.v} className="version-row">
                <span className="vtag">{v.v}</span>
                <span className="vnote">{v.note}</span>
                <span className="vdate">{v.date}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
