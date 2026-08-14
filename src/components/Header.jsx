import { useState, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/features', label: 'Modules' },
  { to: '/demo', label: 'Live Demo' },
  { to: '/download', label: 'Downloads' },
  { to: '/getting-started', label: 'Setup Guide' },
  { to: '/documentation', label: 'Docs' },
  { to: '/support', label: 'Support' },
  { to: 'https://discord.gg/Dv6fNAjhAt', label: 'Discord', external: true },
];

const MOBILE_NAVBAR_BREAKPOINT = 860;

function ZuluClock() {
  const [z, setZ] = useState(() => utc());
  useEffect(() => {
    const id = setInterval(() => setZ(utc()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="ss-zulu">TLS {z}</span>;
}
function utc() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
}

export default function Header() {
  const [open, setOpen] = useState(false);

  // Close the drawer whenever the viewport enters desktop width so the
  // navigation isn't stuck open when a tablet rotates or the window is
  // resized past the breakpoint.
  useEffect(() => {
    const closeIfDesktop = () => {
      if (window.innerWidth > MOBILE_NAVBAR_BREAKPOINT) setOpen(false);
    };
    window.addEventListener('resize', closeIfDesktop);
    return () => window.removeEventListener('resize', closeIfDesktop);
  }, []);

  return (
    <header className="sys-header">
      <div className="sys-status" role="status" aria-label="System status">
        <span className="ss-item ss-item--ok">
          <span className="tag-dot" /> DTW INFRA <strong>NOMINAL</strong>
        </span>
        <span className="ss-item ss-item--sep">/</span>
        <span className="ss-item ss-item--acc">
          VATSIM FEED <strong>CONN</strong>
        </span>
        <span className="ss-item ss-item--sep">/</span>
        <span className="ss-item ss-item--hide-sm">
          TELEMETRY <strong>24 Hz</strong>
        </span>
        <span className="ss-item ss-item--sep ss-item--hide-sm">/</span>
        <span className="ss-item">
          BUILD <strong>v0.25.0</strong>
        </span>
        <ZuluClock />
      </div>
      <div className="sys-nav container">
        <Link to="/" className="sys-brand" aria-label="OPS ROOM home">
          <img className="sys-brand-mark" src="/opsroom-mark-64.png" alt="" width="28" height="28" />
          <span>
            <span className="sys-brand-name">OPS ROOM</span>
            <span className="sys-brand-tag">/ FLIGHT OPS</span>
          </span>
        </Link>
        <button
          className="menu-toggle"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="primary-nav"
          onClick={() => setOpen(!open)}
        >
          <span className="menu-bar" /><span className="menu-bar" /><span className="menu-bar" />
        </button>
        <nav id="primary-nav" className={`sys-nav-links ${open ? 'open' : ''}`}>
          {NAV_LINKS.map((l) =>
            l.external ? (
              <a key={l.to} href={l.to} className="sys-nav-link" target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
                {l.label}
              </a>
            ) : (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === '/'}
                className={({ isActive }) => (isActive ? 'sys-nav-link active' : 'sys-nav-link')}
                onClick={() => setOpen(false)}
              >
                {l.label}
              </NavLink>
            )
          )}
        </nav>
      </div>
    </header>
  );
}
