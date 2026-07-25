import { Link } from 'react-router-dom';

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <div className="footer-brand-name">OPS ROOM</div>
            <p className="footer-tagline">
              A local-first operations platform for Microsoft Flight Simulator.
              Modules described below all live in a single desktop process.
              Telemetry goes straight from FSUIPC and SimConnect to the OPS ROOM UI,
              not through any browser middleware.
            </p>
          </div>
          <div className="footer-col">
            <h4>Product</h4>
            <ul>
              <li><Link to="/features">Modules</Link></li>
              <li><Link to="/screenshots">Screenshots</Link></li>
              <li><Link to="/download">Downloads</Link></li>
              <li><Link to="/changelog">Changelog</Link></li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Resources</h4>
            <ul>
              <li><Link to="/documentation">Documentation</Link></li>
              <li><Link to="/documentation">Install Guide</Link></li>
              <li><Link to="/documentation">First Flight</Link></li>
              <li><Link to="/documentation">Aircraft Setup</Link></li>
              <li><Link to="/support">Support</Link></li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Integrations</h4>
            <ul>
              <li><span className="mono" style={{ color: 'var(--fg-muted)', fontSize: '0.85rem' }}>VATSIM</span></li>
              <li><span className="mono" style={{ color: 'var(--fg-muted)', fontSize: '0.85rem' }}>SimBrief</span></li>
              <li><span className="mono" style={{ color: 'var(--fg-muted)', fontSize: '0.85rem' }}>GSX Pro</span></li>
              <li><span className="mono" style={{ color: 'var(--fg-muted)', fontSize: '0.85rem' }}>Hoppie CPDLC</span></li>
              <li><span className="mono" style={{ color: 'var(--fg-muted)', fontSize: '0.85rem' }}>FSUIPC / SimConnect</span></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span className="footer-build">BUILD v0.25.0 · {year} · OPSROOM.LIVE</span>
          <span>Not affiliated with Microsoft, Asobo Studio, or VATSIM.</span>
        </div>
      </div>
    </footer>
  );
}
