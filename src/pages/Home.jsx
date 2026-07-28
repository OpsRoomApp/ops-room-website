import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import SEO from '../components/SEO.jsx';
import { PAGE_TITLES, SITE } from '../config/seo.js';
import VatsimFIDS from '../components/VatsimFIDS.jsx';

/* Module definitions drawn from `app/static/opsroom.js` PAGE_LABELS and the
   /api/* endpoints in `app/main.py`. Codes match the source keys so support
   references stay consistent with the desktop app. */
const MODULES = [
  { code: 'FIDS', title: 'VATSIM FIDS',   brief: 'Live airport departures and arrivals pulled from VATSIM.' },
  { code: 'DSP',  title: 'Dispatch',      brief: 'Route selection, fuel planning and a signed OFP.' },
  { code: 'BRF',  title: 'Briefing',      brief: 'Charts, weather pack, route, METAR / TAF, signed.' },
  { code: 'WTC',  title: 'Flight Watch',  brief: 'Live telemetry, uplink state and route progress.' },
  { code: 'BBX',  title: 'Black Box',     brief: 'Continuous recorder with scrubbable replay.' },
  { code: 'ANL',  title: 'Flight Analysis', brief: 'Landing grade, fuel vs plan, PIREP filing.' },
  { code: 'GND',  title: 'Ground Control', brief: 'GSX Pro coordination for boarding and pushback.' },
  { code: 'RAAS', title: 'Runway Awareness', brief: 'Aural warnings for incursion and approach hazards.' },
  { code: 'DAT',  title: 'CPDLC Datalink', brief: 'Controller-pilot data link over Hoppie.' },
  { code: 'NET',  title: 'Network / Comms', brief: 'ATC frequencies, swap, squawk state.' },
  { code: 'MAP',  title: 'Live Map',      brief: 'Ownship, traffic, navaids and route overlay.' },
  { code: 'SP',   title: 'Kneeboard',     brief: 'ATIS letters, gate, altimeter, transponder.' },
  { code: 'PRC',  title: 'Procedures',    brief: 'Normal and non-normal checklists and SOPs.' },
  { code: 'LOC',  title: 'Logbook',       brief: 'Automatic flight logbook with PDF export.' },
  { code: 'AOC',  title: 'Announcer',     brief: 'Cabin-style voice announcements from sim events.' },
  { code: 'OBS',  title: 'OBS Tools',     brief: 'Streaming overlays and brand artwork.' },
];

const STRIP_LOOP = [
  { file: 'vatsim-fids.png',         label: 'VATSIM FIDS' },
  { file: 'live-map.png',            label: 'Live Map' },
  { file: 'black-box-fdr.png',       label: 'Black Box' },
  { file: 'briefing.png',            label: 'Briefing' },
  { file: 'finances-and-career.png', label: 'Finances' },
  { file: 'cpdlc-datalink.png',      label: 'CPDLC' },
  { file: 'logbook.png',              label: 'Logbook' },
  { file: 'runway-awareness.png',     label: 'RAAS' },
  { file: 'announcer.png',            label: 'Announcer' },
  { file: 'obs-overlay-studio.png',   label: 'OBS' },
];

export default function Home() {
  useEffect(() => {
    const cards = document.querySelectorAll('.tilt-card');
    const onMouseMove = (e) => {
      const card = e.currentTarget;
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      card.style.setProperty('--tilt-x', String(x));
      card.style.setProperty('--tilt-y', String(y));
    };
    const onMouseLeave = (e) => {
      e.currentTarget.style.setProperty('--tilt-x', '0');
      e.currentTarget.style.setProperty('--tilt-y', '0');
    };
    cards.forEach((card) => {
      card.addEventListener('mousemove', onMouseMove);
      card.addEventListener('mouseleave', onMouseLeave);
    });
    return () => {
      cards.forEach((card) => {
        card.removeEventListener('mousemove', onMouseMove);
        card.removeEventListener('mouseleave', onMouseLeave);
      });
    };
  }, []);

  return (
    <>
      <SEO title={PAGE_TITLES.home} description={SITE.description} path="/" />

      <section className="hero">
        <div className="container hero-grid">
          <div>
            <div className="hero-meta">
              <span className="tag"><span className="tag-dot" /> v0.25.0 PUBLIC</span>
              <span className="tag">STABLE CHANNEL</span>
              <span className="tag">LOCAL · WINDOWS</span>
            </div>
            <h1 className="hero-headline">
              A professional flight operations platform for <em>Microsoft Flight Simulator</em>.
            </h1>
            <p className="hero-lead">
              OPS ROOM is a local-first desktop app that puts dispatch, flight watch,
              Black Box recording, performance analysis, GSX and VATSIM in one
              workspace.
            </p>
            <div className="hero-actions">
              <Link to="/download" className="btn btn-primary">Download for Windows</Link>
              <Link to="/screenshots" className="btn btn-ghost">View Screenshots</Link>
              <Link to="/documentation" className="btn btn-ghost">Read Documentation</Link>
            </div>
          </div>
          <div>
            <VatsimFIDS defaultAirport="EGLL" compact />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">/ SCREENSHOTS FROM THE LIVE BUILD</span>
            <h2 className="section-title">What it looks like at full speed.</h2>
            <p className="section-subtitle">
              Real captures from the production OPS ROOM build. The strip cycles
              continuously. Hover to pause.
            </p>
          </div>

          <div className="strip-wrap">
            <div className="strip-marquee">
              {[...STRIP_LOOP, ...STRIP_LOOP].map((s, i) => (
                <figure key={`${s.file}-${i}`} className="strip-card">
                  <a href={`/screenshots/${s.file}`} target="_blank" rel="noreferrer" className="strip-link tilt-card">
                    <img src={`/screenshots/${s.file}`} alt={`OPS ROOM · ${s.label}`} loading="lazy" />
                    <figcaption>{s.label}</figcaption>
                  </a>
                </figure>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">/ MODULES</span>
            <h2 className="section-title">Sixteen modules. One process. One workflow.</h2>
            <p className="section-subtitle">
              Every phase of flight is a module. They share telemetry, the dispatch
              board and the local SQLite ledger.
            </p>
          </div>

          <ul className="modules-brief">
            {MODULES.map((m) => (
              <li key={m.code} className="module-brief">
                <span className="module-brief-code">MOD · {m.code}</span>
                <span className="module-brief-title">{m.title}</span>
                <span className="module-brief-text">{m.brief}</span>
              </li>
            ))}
          </ul>

          <p className="more-link">
            <Link to="/features" className="btn btn-ghost">Read every module in detail</Link>
          </p>
        </div>
      </section>

      <section className="section section-tight">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">/ TELEMETRY SOURCES</span>
            <h2 className="section-title">What the modules feed off.</h2>
            <p className="section-subtitle">
              Every integration listed here is opt-in. Nothing leaves the
              OPS ROOM box without you opting in from Settings.
            </p>
          </div>
          <div className="integration-grid">
            <div className="integration"><span className="integration-code">FSUIPC</span><span className="integration-title">FSUIPC 7 / 8</span><span className="integration-desc">Direct offset reads, 60 Hz. Fenix / PMDG / iniBuilds / FBW bindings.</span></div>
            <div className="integration"><span className="integration-code">SIMC</span><span className="integration-title">SimConnect</span><span className="integration-desc">Native MSFS interface and the fallback path.</span></div>
            <div className="integration"><span className="integration-code">VATSIM</span><span className="integration-title">VATSIM Network</span><span className="integration-desc">Live callsign, position, ATC sector. Used by FIDS, Map and Flight Watch.</span></div>
            <div className="integration"><span className="integration-code">SIMBRIEF</span><span className="integration-title">SimBrief</span><span className="integration-desc">OFP, weather and charts. Drives Dispatch and Briefing.</span></div>
            <div className="integration"><span className="integration-code">GSX</span><span className="integration-title">GSX Pro</span><span className="integration-desc">Ground services menu control and turnaround timing.</span></div>
            <div className="integration"><span className="integration-code">HOPPIE</span><span className="integration-title">Hoppie CPDLC</span><span className="integration-desc">CPDLC uplink / downlink over the Hoppie ACARS network.</span></div>
            <div className="integration"><span className="integration-code">CHRT</span><span className="integration-title">ChartFox</span><span className="integration-desc">Optional OAuth. Chart catalogue renders inside OPS ROOM.</span></div>
            <div className="integration"><span className="integration-code">NAV</span><span className="integration-title">Navigraph</span><span className="integration-desc">Optional. Jeppesen charts render alongside Briefing.</span></div>
            <div className="integration"><span className="integration-code">VPIL</span><span className="integration-title">vPilot / simBridge</span><span className="integration-desc">Optional. Focus the in-sim camera on a target traffic flight.</span></div>
          </div>
        </div>
      </section>
    </>
  );
}
