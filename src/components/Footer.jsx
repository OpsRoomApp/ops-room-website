import { Link } from 'react-router-dom';
import { useVatsimStats } from '../hooks/useVatsimData.js';
import useLatestVersion from '../hooks/useLatestVersion.js';

function VatsimTicker() {
  const stats = useVatsimStats();

  return (
    <div className="vatsim-ticker" style={{
      display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem 0',
      fontFamily: 'var(--font-mono)', fontSize: '10.5px', letterSpacing: '0.08em',
      textTransform: 'uppercase', color: 'var(--fg-muted)',
      borderBottom: '1px solid var(--line)', marginBottom: '1.25rem',
      flexWrap: 'wrap',
    }}>
      <span>
        <span className="tag-dot" style={{ display: 'inline-block', marginRight: '0.35rem' }} />
        VATSIM ONLINE
      </span>
      <span><strong style={{ color: 'var(--nominal)', fontWeight: 500 }}>
        {stats.loading ? '...' : stats.pilots.toLocaleString()}
      </strong> PILOTS</span>
      <span><strong style={{ color: 'var(--acc)', fontWeight: 500 }}>
        {stats.loading ? '...' : stats.controllers.toLocaleString()}
      </strong> ATC</span>
      <span style={{ color: 'var(--fg-faint)' }}>DATA.VATSIM.NET</span>
      {stats.error && <span style={{ color: 'var(--alert)', fontSize: '9px' }}>ERR: {stats.error}</span>}
    </div>
  );
}

export default function Footer() {
  const year = new Date().getFullYear();
  const version = useLatestVersion();
  return (
    <footer className="footer">
      <div className="container">
        <VatsimTicker />
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
              <li><Link to="/getting-started">Setup Guide</Link></li>
              <li><Link to="/download">Downloads</Link></li>
              <li><Link to="/changelog">Changelog</Link></li>
              <li><Link to="/leaderboard">Leaderboard</Link></li>
              <li><Link to="/efb-apps">EFB Apps Guide</Link></li>
              <li><a href="https://discord.gg/Dv6fNAjhAt" target="_blank" rel="noopener noreferrer">Discord</a></li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Resources</h4>
            <ul>
              <li><Link to="/documentation">Documentation</Link></li>
              <li><Link to="/faq">FAQ</Link></li>
              <li><Link to="/support">Support</Link></li>
              <li><Link to="/privacy">Privacy</Link></li>
              <li><Link to="/press">Press</Link></li>
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
          <div className="footer-col">
            <h4>Community</h4>
            <ul>
              <li><a href="https://discord.gg/Dv6fNAjhAt" target="_blank" rel="noopener noreferrer">Discord Server</a></li>
              <li><a href="https://github.com/OpsRoomApp" target="_blank" rel="noopener noreferrer">GitHub</a></li>
              <li><span className="mono" style={{ color: 'var(--fg-muted)', fontSize: '0.85rem' }}>support@opsroom.live</span></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span className="footer-build">BUILD v{version} · {year} · OPSROOM.LIVE</span>
        </div>
      </div>
    </footer>
  );
}
