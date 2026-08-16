import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useLatestVersion from '../hooks/useLatestVersion.js';
import SEO from '../components/SEO.jsx';

/*
 * OPS ROOM interactive demo. Faithful reproduction of the desktop app:
 * masthead, module rail, and all 20 modules rendered with simulated data.
 * Mirror of opsroom-app/source/app/static (index.html + opsroom.css).
 */

const NAV = [
  { id: 'modules', label: 'MODULES' },
  { id: 'status', label: 'STATUS BOARD' },
  { id: 'fids', label: 'VATSIM FIDS' },
  { id: 'dispatch', label: 'DISPATCH' },
  { id: 'briefing', label: 'BRIEFING' },
  { id: 'scratchpad', label: 'SCRATCHPAD' },
  { id: 'watch', label: 'FLIGHT WATCH' },
  { id: 'performance', label: 'PERFORMANCE' },
  { id: 'raas', label: 'RUNWAY AWARENESS' },
  { id: 'network', label: 'NETWORK / COMMS' },
  { id: 'map', label: 'MAP' },
  { id: 'datalink', label: 'DATALINK' },
  { id: 'ground', label: 'GROUND CONTROL' },
  { id: 'announcer', label: 'ANNOUNCER' },
  { id: 'procedures', label: 'PROCEDURES' },
  { id: 'log', label: 'LOGBOOK' },
  { id: 'blackbox', label: 'BLACK BOX' },
  { id: 'finances', label: 'FINANCES' },
  { id: 'obs', label: 'OBS TOOLS' },
  { id: 'system', label: 'SYSTEM' },
];

const TILE_ICONS = {
  status: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 3v6l4 2',
  fids: 'M4 5h16v10H4zM4 19h16M8 9l2 2-2 2M12 9l2 2-2 2',
  dispatch: 'M3 15l9-12 9 12M6 15l6 6 6-6M12 9v3',
  briefing: 'M7 3h7l5 5v13H7zM14 3v5h5M10 12h6M10 15h6M10 18h4',
  scratchpad: 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5',
  watch: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 4v4l3 2',
  performance: 'M4 14a8 8 0 1 1 16 0M12 14l4-4M5 17h14M3 20h18',
  raas: 'M3 20h18M4 16l8-12 8 12M8 16l4-6 4 6',
  network: 'M12 3a3 3 0 0 0-3 3c0 .4.1.8.2 1.2L6 10a3 3 0 1 0 1 4l3.5-1.7c.4.4.9.7 1.5.7s1.1-.3 1.5-.7L17 14a3 3 0 1 0 1-4l-3.2-2.8A3 3 0 0 0 12 3Z',
  map: 'M12 21s-7-6.3-7-11a7 7 0 1 1 14 0c0 4.7-7 11-7 11Zm0-8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  datalink: 'M5 9a10 10 0 0 1 14 0M8 12a6 6 0 0 1 8 0M11 15a2 2 0 0 1 2 0M12 19h.01',
  ground: 'M3 21h18M6 21V9l6-4 6 4v12M10 21v-6h4v6M8 9h8',
  announcer: 'M4 10v4h3l6 4V6l-6 4H4Zm11 2a3 3 0 0 0 0-4.5M15 12a3 3 0 0 1 0 4.5',
  procedures: 'M8 4h12M8 10h12M8 16h12M4 4h.01M4 10h.01M4 16h.01',
  log: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3Z',
  blackbox: 'M4 7h16v10H4zM8 7V5h8v2M7 12h3M14 12h3M7 15h3M14 15h3',
  finances: 'M12 3v18M7 7h8a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h8',
  obs: 'M12 4v4M12 16v4M4 12h4M16 12h4M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3',
  system: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm8 4a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  modules: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
};

function Icon({ d, size = 40 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" vectorEffect="non-scaling-stroke">
      <path d={d} />
    </svg>
  );
}

function useUtcClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: `${pad(now.getUTCDate())} ${now.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }).toUpperCase()} ${now.getUTCFullYear()}`,
    clock: `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())} UTC`,
  };
}

/* Live cruise telemetry (simulated) */
function useSim() {
  const [s, setS] = useState({ alt: 37000, gs: 442, hdg: 282, vs: 0, lat: 51.47, lon: -0.45 });
  useEffect(() => {
    const t = setInterval(() => {
      setS((p) => ({
        alt: Math.min(39000, Math.max(33000, p.alt + (Math.random() - 0.5) * 120)),
        gs: Math.min(470, Math.max(420, p.gs + (Math.random() - 0.5) * 6)),
        hdg: Math.min(296, Math.max(268, p.hdg + (Math.random() - 0.5) * 0.8)),
        vs: Math.round((Math.random() - 0.5) * 60),
        lat: p.lat - 0.0006,
        lon: p.lon - 0.0012,
      }));
    }, 1200);
    return () => clearInterval(t);
  }, []);
  return s;
}

function Masthead({ clock, date }) {
  return (
    <header className="demo-masthead">
      <button className="demo-module-btn" type="button" aria-label="Toggle sidebar">☰ MENU</button>
      <button className="demo-wordmark" type="button" aria-label="Open module launcher">
        <img className="demo-brand-mark" src="/opsroom-mark.svg" alt="" />
        <strong>OPS ROOM</strong>
        <span>OPERATIONS CONTROL CENTRE</span>
      </button>
      <div className="demo-masthead-status">
        <span className="demo-bell" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3a6 6 0 0 0-6 6v3.4L4.2 16v1.2h15.6V16L18 12.4V9a6 6 0 0 0-6-6Zm0 18a3 3 0 0 0 2.7-1.7H9.3A3 3 0 0 0 12 21Z" /></svg>
        </span>
        <span className="demo-date">{date}</span>
        <strong className="demo-clock">{clock}</strong>
        <span className="demo-system-normal"><i></i><b>SYSTEM NORMAL</b></span>
      </div>
    </header>
  );
}

function Rail({ active, onNav }) {
  const version = useLatestVersion();
  return (
    <aside className="demo-rail">
      <nav aria-label="Main modules">
        {NAV.map((n) => (
          <button key={n.id} className={`demo-nav-item${active === n.id ? ' active' : ''}`} type="button" onClick={() => onNav(n.id)}>{n.label}</button>
        ))}
      </nav>
      <div className="demo-rail-footer">
        <span>OPS ROOM {version} PUBLIC RELEASE</span>
        <span>LAN CONSOLE</span>
        <span>SIMULATION USE ONLY</span>
      </div>
    </aside>
  );
}

function PageHeading({ kicker, title, children }) {
  return (
    <div className="demo-page-heading">
      <div>{kicker ? <span className="demo-kicker">{kicker}</span> : null}<h1>{title}</h1></div>
      {children ? <div className="demo-heading-actions">{children}</div> : null}
    </div>
  );
}

function Panel({ title, right, className = '', children }) {
  return (
    <section className={`demo-panel ${className}`}>
      <header><span>{title}</span><span>{right}</span></header>
      {children}
    </section>
  );
}

function Lamp({ tone }) {
  return <i className={`demo-lamp lamp-${tone}`} aria-hidden="true" />;
}

/* ---------------- STATUS BOARD ---------------- */
function StatusPage({ sim }) {
  return (
    <section className="demo-page active">
      <PageHeading kicker="CONTROL POSITION 01" title="Status board">
        <button className="demo-ctl" type="button">Refresh OFP</button>
        <button className="demo-ctl" type="button">Reconnect MSFS</button>
      </PageHeading>
      <div className="demo-status-grid">
        <Panel title="Active flight" right="OFP LOADED" className="demo-active-flight">
          <div className="demo-active-flight-body">
            <div className="demo-ident-line"><strong>BAW118</strong><span>G-CLRA · A350-1000</span><small>LONDON HEATHROW → NEW YORK JFK</small></div>
            <div className="demo-active-route"><b>EGLL</b><i>TO</i><b>JFK</b></div>
            <div className="demo-register">
              <div><span>FLIGHT</span><b>0118</b></div>
              <div><span>STD</span><b>10:18Z</b></div>
              <div><span>STA</span><b>15:42Z</b></div>
              <div><span>AIRCRAFT</span><b>A35K</b></div>
              <div><span>PAX</span><b>269</b></div>
              <div><span>GATE</span><b>B27</b></div>
            </div>
          </div>
        </Panel>
        <Panel title="Connections" right="Live status" className="demo-connections">
          <div className="demo-conn-rows">
            {[['FSUIPC 7', 'Connected', 'green'], ['SimConnect', 'Connected', 'green'], ['vPilot 3.0', 'Connected', 'green'], ['SimBrief OFP', 'Loaded', 'green'], ['Hoppie CPDLC', 'Connected', 'green'], ['GSX Pro', 'Running', 'green']].map(([n, st, tone]) => (
              <div className="demo-conn-row" key={n}>
                <Lamp tone={tone} />
                <div><div className="demo-conn-name">{n}</div><div className="demo-conn-detail">AUTO BRIDGE · {n.toUpperCase()}</div></div>
                <span className={`demo-state ${st.toLowerCase()}`}>{st}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Aircraft position" right="Live" className="demo-movement">
          <div className="demo-movement-data">
            <div><span>Nearest airport</span><strong>EGLL</strong></div>
            <div><span>Altitude</span><strong>{Math.round(sim.alt).toLocaleString()} FT</strong></div>
            <div><span>Position</span><strong>{sim.lat.toFixed(2)}N {Math.abs(sim.lon).toFixed(2)}W · {Math.round(sim.gs)} KT GS</strong></div>
          </div>
        </Panel>
        <Panel title="Advisories" right="2 advisories" className="demo-advisories">
          <div className="demo-advisory"><time>10:02Z</time><span className="demo-level">WX</span><span>Moderate chop forecast FL300-FL400 on the North Atlantic tracks, ride quality watch.</span></div>
          <div className="demo-advisory"><time>09:47Z</time><span className="demo-level">OPS</span><span>JFK arrival slot nominal, expect runway 22L via CANNE.</span></div>
          <div className="demo-notam"><time>A4634</time><b>RWY 27R CLOSED 0400-0600Z</b><span>EGLL, taxi routing via holding point A1.</span></div>
        </Panel>
      </div>
    </section>
  );
}

/* ---------------- VATSIM FIDS ---------------- */
const FIDS_DEP = [
  ['BA', 'BAW118', 'A35K', 'JFK', '10:18', 'DVR', '27L', 'DEPARTING'],
  ['LH', 'DLH400', 'A359', 'EWR', '10:24', 'LND9', 'B44', 'BOARDING'],
  ['AF', 'AFR164', 'B77W', 'ORD', '10:31', 'KONAN', 'A18', 'BOARDING'],
  ['QR', 'QTR1', 'A388', 'DOH', '10:40', 'IMVUR', 'C24', 'CHECK-IN'],
  ['UA', 'UAL930', 'B789', 'SFO', '10:47', 'DET', 'D53', 'CHECK-IN'],
  ['KL', 'KLM642', 'B78X', 'AMS', '10:52', 'LYD', 'D49', 'CHECK-IN'],
];
const FIDS_ARR = [
  ['LH', 'DLH402', 'A359', 'FRA', '11:02', 'UVAVU', 'B12', '286', 'ON TIME'],
  ['BA', 'BAW57', 'B77W', 'JNB', '11:14', 'MARGO', 'C08', '312', 'ON TIME'],
  ['VS', 'VIR26', 'A35K', 'DEL', '11:21', 'BEGAR', 'D21', '298', 'ON TIME'],
  ['AA', 'AAL46', 'B788', 'DFW', '11:38', 'LND9', 'A09', '324', 'EXPECTED'],
  ['QF', 'QFA1', 'A388', 'SYD', '11:45', 'BEL', 'C19', '411', 'ON TIME'],
  ['EY', 'ETD11', 'A35K', 'AUH', '11:52', 'RINTI', 'D06', '342', 'ON TIME'],
];
const FIDS_PRE = [
  ['BA', 'BAW113', 'A35K', 'JFK', '11:20', 'DVR'],
  ['DL', 'DAL80', 'A339', 'ATL', '11:35', 'BEGAR'],
  ['AY', 'FIN6', 'A359', 'HEL', '11:48', 'KONAN'],
];

function FidsPage() {
  const [tab, setTab] = useState('dep');
  const rows = tab === 'dep' ? FIDS_DEP : tab === 'arr' ? FIDS_ARR : FIDS_PRE;
  return (
    <section className="demo-page active demo-fids-page">
      <PageHeading kicker="AIRPORT MOVEMENT DISPLAY" title="VATSIM FIDS">
        <button className="demo-ctl" type="button">CAMERA PANEL</button>
        <button className="demo-ctl" type="button">OPEN FIDS</button>
      </PageHeading>
      <div className="demo-board">
        <div className="demo-board-top">
          <span className="demo-board-airport">EGLL · LONDON HEATHROW</span>
          <span className="demo-board-atis">ATIS DEP INFO M · 27L · QNH 1015</span>
          <span className="demo-board-atis">ARR INFO N · 27R · QNH 1015</span>
        </div>
        <nav className="demo-board-tabs" aria-label="Traffic tabs">
          <button className={tab === 'dep' ? 'active' : ''} type="button" onClick={() => setTab('dep')}>Departures <span>{FIDS_DEP.length}</span></button>
          <button className={tab === 'arr' ? 'active' : ''} type="button" onClick={() => setTab('arr')}>Arrivals <span>{FIDS_ARR.length}</span></button>
          <button className={tab === 'pre' ? 'active' : ''} type="button" onClick={() => setTab('pre')}>Prefiles <span>{FIDS_PRE.length}</span></button>
          <span className="demo-board-live"><Lamp tone="green" />LIVE VATSIM FEED</span>
        </nav>
        <div className="demo-board-wrap">
          <table className="demo-board-table">
            <thead>
              <tr>
                <th>Airline</th><th>Flight</th><th>Type</th>
                <th>{tab === 'dep' ? 'To' : tab === 'arr' ? 'From' : 'Dir'}</th>
                <th>{tab === 'dep' ? 'Time' : 'ETA'}</th>
                <th>{tab === 'dep' ? 'SID' : tab === 'arr' ? 'STAR' : 'SID/STAR'}</th>
                {tab !== 'pre' && <th>Stand</th>}
                {tab === 'arr' && <th>NM</th>}
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r[1]}>
                  <td><span className="demo-airline-badge">{r[0]}</span></td>
                  <td><b>{r[1]}</b></td>
                  <td>{r[2]}</td>
                  <td>{r[3]}</td>
                  <td>{r[4]}</td>
                  <td>{r[5]}</td>
                  {tab !== 'pre' && <td>{r[6]}</td>}
                  {tab === 'arr' && <td>{r[7]}</td>}
                  <td><span className={r[tab === 'pre' ? 6 : tab === 'arr' ? 8 : 7].includes('DEPART') || r[tab === 'pre' ? 6 : tab === 'arr' ? 8 : 7].includes('BOARD') ? 'demo-st-ok' : 'demo-st-dim'}>{r[tab === 'pre' ? 6 : tab === 'arr' ? 8 : 7]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ---------------- DISPATCH ---------------- */
function DispatchPage() {
  return (
    <section className="demo-page active">
      <PageHeading kicker="FLIGHT PLANNING" title="Dispatch">
        <button className="demo-ctl" type="button">Search flights</button>
      </PageHeading>
      <div className="demo-dispatch-form">
        <label>FROM<input defaultValue="EGLL" /></label>
        <label>TO<input defaultValue="JFK" /></label>
        <label>TIME<select defaultValue="1100"><option>0800</option><option>0900</option><option>1000</option><option selected>1100</option><option>1200</option></select></label>
        <label>AIRCRAFT<select defaultValue="any"><option>ANY</option><option>A320</option><option>A350</option><option>B77W</option><option>B789</option></select></label>
        <label>DIRECT<select defaultValue="yes"><option>ANY</option><option selected>YES</option><option>NO</option></select></label>
        <button className="demo-ctl demo-primary" type="button">SEARCH</button>
      </div>
      <div className="demo-dispatch-cards">
        <div className="demo-dispatch-card">
          <div className="demo-score"><strong>92</strong><span>SCORE</span></div>
          <div className="demo-dispatch-main">
            <div className="demo-dispatch-route"><span>EGLL</span><i>→</i><b>JFK</b><small>BAW118 · 10:18Z · A35K</small></div>
            <div className="demo-dispatch-metrics">
              <div><span>FLIGHT TIME</span><b>6H 24M</b></div>
              <div><span>FUEL TRIP</span><b>64.1T</b></div>
              <div><span>WIND</span><b>TAIL 84 KT</b></div>
              <div><span>METAR JFK</span><b>24012KT CAVOK</b></div>
            </div>
            <div className="demo-dispatch-reasons"><span>WIND OPTIMISED</span><span>DIRECT</span><span>SLOT OK</span></div>
            <div className="demo-dispatch-actions"><button type="button">VIEW OFP</button><button type="button">LOAD FLIGHT</button></div>
          </div>
        </div>
        <div className="demo-dispatch-card">
          <div className="demo-score"><strong>78</strong><span>SCORE</span></div>
          <div className="demo-dispatch-main">
            <div className="demo-dispatch-route"><span>EGLL</span><i>→</i><b>EWR</b><small>DLH400 · 10:24Z · A359</small></div>
            <div className="demo-dispatch-metrics">
              <div><span>FLIGHT TIME</span><b>7H 02M</b></div>
              <div><span>FUEL TRIP</span><b>61.4T</b></div>
              <div><span>WIND</span><b>TAIL 71 KT</b></div>
              <div><span>METAR EWR</span><b>25009KT 10SM FEW250</b></div>
            </div>
            <div className="demo-dispatch-reasons"><span>WIND</span><span>SLOT OK</span></div>
            <div className="demo-dispatch-actions"><button type="button">VIEW OFP</button><button type="button">LOAD FLIGHT</button></div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- BRIEFING ---------------- */
function BriefingPage() {
  return (
    <section className="demo-page active">
      <PageHeading kicker="OPERATIONAL BRIEFING" title="Flight briefing">
        <button className="demo-ctl demo-primary" type="button">Fetch OFP</button>
      </PageHeading>
      <div className="demo-brief-layout">
        <Panel title="Flight release" right="SIMBRIEF OFP · EGLL → JFK" className="demo-brief-wide">
          <div className="demo-release-line"><strong>BAW118</strong><span>G-CLRA · A350-1000</span><i>PUSHBACK 10:05Z</i><small>OFP GENERATED 09:31Z · RELEASE VALID</small></div>
          <div className="demo-brief-grid four">
            <div className="demo-brief-cell"><span>DISTANCE</span><b>3,452 NM</b></div>
            <div className="demo-brief-cell"><span>CRUISE</span><b>FL370</b></div>
            <div className="demo-brief-cell"><span>COST INDEX</span><b>CI 22</b></div>
            <div className="demo-brief-cell"><span>BLOCK FUEL</span><b>84.2T</b></div>
          </div>
        </Panel>
        <Panel title="Route" right="FULL ROUTE">
          <div className="demo-route-text"><span>ROUTE</span><p>DVR L151 BEDEK UL151 LULOX DCT CANNE DCT BEDAR N61A DINTY</p></div>
          <div className="demo-route-text"><span>WAYPOINTS</span><p>8 · SID DVR 27L · STAR CANNE 22L</p></div>
          <div className="demo-route-text"><span>NOTAMS</span><p>⚠ A4634 · Rwy 27R closed 0400-0600Z &nbsp;·&nbsp; ⚠ E1298 · NDB HON temporary outage &nbsp;·&nbsp; ✓ No active airspace restrictions</p></div>
        </Panel>
        <Panel title="Weather" right="LIVE">
          <div className="demo-weather-record"><span>METAR EGLL</span><p>EGLL 101050Z 24008KT 9999 SCT025 BKN045 17/09 Q1015 NOSIG</p></div>
          <div className="demo-weather-record"><span>METAR KJFK</span><p>KJFK 101051Z 24012KT 10SM FEW040 SCT250 22/13 A2998 RMK AO2 SLP151</p></div>
          <div className="demo-weather-record"><span>WINDS ALOFT FL370</span><p>NAT-B 271°/092 KT · JETSTREAM CORE 105 KT SOUTH OF TRACK</p></div>
        </Panel>
        <Panel title="Fuel & weights" right="LOAD SHEET">
          <div className="demo-brief-grid six">
            <div className="demo-brief-cell"><span>ZFW</span><b>201.4T</b></div>
            <div className="demo-brief-cell"><span>TOW</span><b>285.6T</b></div>
            <div className="demo-brief-cell"><span>BLOCK</span><b>84.2T</b></div>
            <div className="demo-brief-cell"><span>TAXI</span><b>0.6T</b></div>
            <div className="demo-brief-cell"><span>TRIP</span><b>64.1T</b></div>
            <div className="demo-brief-cell"><span>RESERVE</span><b>4.9T</b></div>
          </div>
        </Panel>
      </div>
    </section>
  );
}

/* ---------------- SCRATCHPAD ---------------- */
function ScratchpadPage() {
  const [page, setPage] = useState('departure');
  return (
    <section className="demo-page active">
      <PageHeading kicker="CONTROL POSITION 04A" title="Scratchpad">
        <span className="demo-readout">AUTOSAVE READY</span>
        <button className="demo-ctl" type="button">AUTOFILL FROM OFP</button>
      </PageHeading>
      <Panel title="Current page" right="Saved" className="demo-scratchpad-panel">
        <div className="demo-scratch-toolbar">
          <div className="demo-scratch-tabs" role="tablist" aria-label="Scratchpad pages">
            {['departure', 'arrival', 'blank'].map((p) => (
              <button key={p} className={`demo-scratch-tab${page === p ? ' active' : ''}`} type="button" onClick={() => setPage(p)}>{p.toUpperCase()}</button>
            ))}
          </div>
          <div className="demo-scratch-tools">
            <button className="demo-ctl demo-primary" type="button">TYPE</button>
            <button className="demo-ctl" type="button">PEN</button>
            <button className="demo-ctl" type="button">ERASER</button>
            <label className="demo-scratch-size">SIZE <input type="range" min="1" max="20" defaultValue="4" /></label>
            <button className="demo-ctl" type="button">UNDO</button>
            <button className="demo-ctl" type="button">CLEAR INK</button>
            <button className="demo-ctl demo-danger" type="button">CLEAR PAGE</button>
          </div>
        </div>
        <div className="demo-scratch-paper">
          {page === 'blank' ? (
            <textarea className="demo-scratch-blank" placeholder="Type notes here, or write directly on the page with touch, Apple Pencil or mouse." defaultValue="BAW118 EGLL JFK\nDVR L151 BEDEK UL151 LULOX DCT CANNE" />
          ) : (
            <>
              <div className="demo-scratch-header"><input defaultValue="BAW118" /><div><b>OPS ROOM KNEEBOARD</b><span>SIMULATION USE ONLY</span></div><input defaultValue="A35K" /></div>
              <div className="demo-scratch-route-row"><label>DEP<input defaultValue="EGLL" /></label><label>DEST<input defaultValue="JFK" /></label><label>FL<input defaultValue="370" /></label></div>
              <label className="demo-scratch-wide">ROUTE<textarea rows="2" defaultValue="DVR L151 BEDEK UL151 LULOX DCT CANNE" /></label>
              <div className="demo-scratch-grid">
                <label>RAMP / STAND<input defaultValue="B27" /></label>
                <label>ATIS<input defaultValue="M" /></label>
                <label>RWY<input defaultValue="27L" /></label>
                <label>INITIAL ALT<input defaultValue="5000" /></label>
                <label>SID / TRANSITION<input defaultValue="DVR 1A" /></label>
                <label>DEP FREQ<input defaultValue="121.200" /></label>
                <label>SQUAWK<input defaultValue="4261" /></label>
                <label>TAXI<textarea rows="2" defaultValue="B27 → H → J → A1 → 27L" /></label>
              </div>
              <label className="demo-scratch-wide">METAR<textarea rows="2" defaultValue="EGLL 101050Z 24008KT 9999 SCT025 BKN045 17/09 Q1015 NOSIG" /></label>
              <label className="demo-scratch-wide">NOTES<textarea rows="3" defaultValue="Expect JFK 22L via CANNE. Slot nominal." /></label>
            </>
          )}
        </div>
        <p className="demo-scratch-note">Typed notes and handwriting are autosaved locally on the OPS ROOM host. iPad, touch and Apple Pencil input are supported through the browser.</p>
      </Panel>
    </section>
  );
}

/* ---------------- RUNWAY AWARENESS ---------------- */
function RaasPage() {
  return (
    <section className="demo-page active">
      <PageHeading kicker="SURFACE AWARENESS SYSTEM" title="RUNWAY AWARENESS">
        <button className="demo-ctl" type="button">DISABLE</button>
        <div className="demo-unit-toggle"><span>UNITS:</span><button className="active" type="button">FT</button><button type="button">M</button></div>
      </PageHeading>
      <div className="demo-raas-layout">
        <Panel title="Runway awareness display" right="VOICE PACK READY" className="demo-raas-display">
          <div className="demo-raas-unit">
            <div className="demo-raas-text">RAAS-ARMT</div>
            <div className="demo-raas-row"><button className="demo-raas-pill" type="button"><span className="demo-lamp lamp-green"></span><b>ARMED</b></button><button className="demo-ctl" type="button">TEST ALERT</button></div>
          </div>
        </Panel>
        <Panel title="AUDIO PACK" right="VOICE PACK">
          <div className="demo-maintenance-box"><b>VOICE PACK</b><p>US FEMALE · 32 CALL-OUTS VERIFIED · 3 NEW</p></div>
          <div className="demo-raas-voice-row">
            <label>VOICE FOLDER<input defaultValue="C:\Users\pilot\raas_voice\female" /></label>
            <button className="demo-ctl" type="button">SET FOLDER</button>
          </div>
        </Panel>
      </div>
    </section>
  );
}

/* ---------------- FLIGHT WATCH ---------------- */
function WatchPage({ sim }) {
  return (
    <section className="demo-page active">
      <PageHeading kicker="CONTROL POSITION 05" title="Flight watch">
        <span className="demo-readout">LIVE SIM SYNC</span>
        <button className="demo-ctl" type="button">RECONNECT</button>
      </PageHeading>
      <div className="demo-watch-layout">
        <Panel title="Active flight" right="ENROUTE" className="demo-watch-wide">
          <div className="demo-ident-line"><strong>BAW118</strong><span>G-CLRA · A350-1000</span><small>BRITISH AIRWAYS</small></div>
          <div className="demo-watch-route-line">
            <strong>EGLL</strong>
            <span className="demo-watch-progress"><i style={{ width: '46%' }} /><b>3,452 NM · 46% COMPLETE</b></span>
            <strong>JFK</strong>
          </div>
          <div className="demo-watch-register">
            <div><span>CALLSIGN</span><b>BAW118</b></div>
            <div><span>REMAINING</span><b>1,864 NM</b></div>
            <div><span>ETA</span><b>15:42Z</b></div>
            <div><span>NEAREST</span><b>CYYT</b></div>
          </div>
        </Panel>
        <Panel title="Flight data" right="LIVE · 24 HZ" className="demo-watch-instruments">
          <div className="demo-watch-instr">
            <div><span>INDICATED ALT</span><b>{Math.round(sim.alt / 100).toFixed(2)}</b><small>FL · TRUE ALT {Math.round(sim.alt).toLocaleString()} FT</small></div>
            <div><span>AIRSPEED</span><b>{Math.round(sim.gs - 148)}</b><small>KT · GS {Math.round(sim.gs)} KT</small></div>
            <div><span>MAG HEADING</span><b>{Math.round(sim.hdg)}°</b><small>TRACK {Math.round(sim.hdg + 1)}°</small></div>
            <div><span>VERTICAL SPEED</span><b>{sim.vs > 0 ? '+' : ''}{sim.vs}</b><small>FPM · AIRBORNE</small></div>
            <div><span>FUEL</span><b>90,800</b><small>LB ON BOARD</small></div>
            <div><span>AUTOPILOT</span><b>SPD</b><small>ALT · HDG · V/S</small></div>
          </div>
        </Panel>
        <Panel title="FCU selected values" right="Read only" className="demo-watch-fcu">
          <div className="demo-fcu-readouts">
            <div><span>SELECTED ALT</span><b>FL370</b></div>
            <div><span>SELECTED HDG</span><b>{Math.round(sim.hdg)}°</b></div>
            <div><span>SELECTED SPD</span><b>284</b></div>
            <div><span>SELECTED V/S</span><b>0</b></div>
          </div>
        </Panel>
        <Panel title="Advisories" right="Live" className="demo-watch-notes">
          <div className="demo-watch-note"><Lamp tone="green" /><span>VATSIM, in contact LONDON CONTROL 134.120</span></div>
          <div className="demo-watch-note"><Lamp tone="amber" /><span>Traffic 2,000 FT below opposite direction, TCAS TA clear</span></div>
          <div className="demo-watch-note"><Lamp tone="green" /><span>CPDLC, LOGON EDYY ACCEPTED</span></div>
        </Panel>
      </div>
    </section>
  );
}

/* ---------------- PERFORMANCE ---------------- */
function PerformancePage() {
  return (
    <section className="demo-page active">
      <PageHeading kicker="CONTROL POSITION 06" title="Performance">
        <span className="demo-readout">LIVE SIM SYNC</span>
      </PageHeading>
      <Panel title="TAKEOFF / LANDING" right="LIVE SIM SYNC" className="demo-perf-panel">
        <div className="demo-perf-sections">
          <section>
            <header className="demo-perf-title">AIRCRAFT / WEIGHTS</header>
            <div className="demo-perf-grid">
              <div><span>ZFW</span><b>201.4T</b></div>
              <div><span>TOW</span><b>285.6T</b></div>
              <div><span>GW AT LNDG</span><b>224.9T</b></div>
              <div><span>CG</span><b>28.4%</b></div>
            </div>
          </section>
          <section>
            <header className="demo-perf-title">AIRPORT / RUNWAY</header>
            <div className="demo-perf-grid">
              <div><span>DEP RWY</span><b>27L</b></div>
              <div><span>TORA</span><b>3,660 M</b></div>
              <div><span>ELEV</span><b>83 FT</b></div>
              <div><span>SLOPE</span><b>-0.2%</b></div>
            </div>
          </section>
          <section>
            <header className="demo-perf-title">WEATHER <span className="demo-perf-src">SIMBRIEF OFP</span></header>
            <div className="demo-perf-grid">
              <div><span>WIND</span><b>240/08</b></div>
              <div><span>QNH</span><b>1015</b></div>
              <div><span>TEMP</span><b>17°C</b></div>
              <div><span>RUNWAY COND</span><b>DRY</b></div>
            </div>
          </section>
        </div>
      </Panel>
    </section>
  );
}

/* ---------------- NETWORK / COMMS ---------------- */
function NetworkPage() {
  return (
    <section className="demo-page active">
      <PageHeading title="NETWORK / COMMS">
        <span className="demo-readout">VATSIM LIVE</span>
        <button className="demo-ctl" type="button">Refresh</button>
      </PageHeading>
      <div className="demo-network-layout">
        <Panel title="VATSIM SESSION" right="Online" className="demo-net-identity">
          <div className="demo-net-ident-main"><Lamp tone="green" /><strong>BAW118</strong><span>PILOT · 1422001</span></div>
          <div className="demo-net-register">
            <div><span>CONNECTION</span><b>LIVE</b></div>
            <div><span>SERVER</span><b>EU-S1</b></div>
            <div><span>UPTIME</span><b>1H 24M</b></div>
            <div><span>VOICE</span><b>TX/RX</b></div>
          </div>
        </Panel>
        <Panel title="VPILOT LINK" right="Connected">
          <div className="demo-net-vpilot"><Lamp tone="green" /><b>vPilot 3.0 BRIDGE ACTIVE</b><p>Transponder mode, squawk and IDENT commands are bridged to vPilot over the local link.</p></div>
          <div className="demo-comms-actions"><button className="demo-ctl" type="button">MODE C ON</button><button className="demo-ctl" type="button">MODE C OFF</button><button className="demo-ctl" type="button">IDENT</button></div>
        </Panel>
        <Panel title="RADIOS / HANDOFF" right="SimConnect live" className="demo-net-radio">
          <div className="demo-radio-console">
            <div className="demo-radio-unit"><div className="demo-radio-title"><b>COM 1</b><span className="demo-tx">RX</span></div><div className="demo-radio-readout"><span>ACTIVE</span><strong>134.120</strong><span>STANDBY</span><strong>121.200</strong></div><div className="demo-radio-actions"><input defaultValue="121.200" /><button className="demo-ctl" type="button">SET</button><button className="demo-ctl" type="button">SWAP</button></div></div>
            <div className="demo-radio-unit"><div className="demo-radio-title"><b>COM 2</b><span>RX</span></div><div className="demo-radio-readout"><span>ACTIVE</span><strong>122.800</strong><span>STANDBY</span><strong>128.300</strong></div><div className="demo-radio-actions"><input defaultValue="128.300" /><button className="demo-ctl" type="button">SET</button><button className="demo-ctl" type="button">SWAP</button></div></div>
            <div className="demo-handoff-unit"><span>CURRENT</span><strong>LONDON CONTROL</strong><small>134.120 · NIGHT FREQ</small><span>NEXT</span><strong>SCOTTISH CONTROL</strong><small>128.300 · ON CROSSING N59</small><div className="demo-handoff-actions"><button className="demo-ctl" type="button">TO COM1</button><button className="demo-ctl" type="button">TO COM2</button></div></div>
          </div>
        </Panel>
        <Panel title="Messages" right="2 messages" className="demo-net-msgs">
          <div className="demo-net-msg"><b>LONDON_CTR</b><span>BAW118, climb to FL370, radar vectors to DVR.</span></div>
          <div className="demo-net-msg"><b>EGLL_GND</b><span>BAW118, cleared pushback, face east, stand B27.</span></div>
        </Panel>
        <Panel title="VATSIM CODE OF CONDUCT" right="RULE B3(a) COMPLIANCE" className="demo-net-coc">
          <div className="demo-coc-notice">
            <div className="demo-coc-head"><span className="demo-coc-icon">⚠</span><b>PILOTS SHALL MONITOR THEIR FLIGHTS AT ALL TIMES</b></div>
            <p>It is the responsibility of the pilot to check for, initiate, and make timely contact with appropriate air traffic controllers. Pilots shall be attentive to their aircraft and ATC, and respond to instructions without delay.</p>
            <span className="demo-coc-foot">OPS ROOM NETWORK MONITORING · RECEIVE ONLY MODE</span>
          </div>
        </Panel>
        <Panel title="FLIGHT STATIONS" right="3 stations" className="demo-net-stations">
          <div className="demo-net-station-grid">
            {[['LONDON CONTROL', '134.120', 'CTR'], ['EGLL GROUND', '121.800', 'GND'], ['EGLL TOWER', '118.500', 'TWR']].map(([n, f, t]) => (
              <div className="demo-net-station" key={n}><span className="demo-lamp lamp-green"></span><div><b>{n}</b><small>{f} · {t}</small></div></div>
            ))}
          </div>
        </Panel>
        <Panel title="CONTROLLER DIRECTORY" right="4 online" className="demo-net-directory">
          <div className="demo-network-filter"><input placeholder="CALLSIGN, NAME OR FREQUENCY" /><button className="demo-ctl" type="button">FILTER</button></div>
          <div className="demo-net-controller-grid">
            {[['LONDON_CTR', '134.120', 'CTR · NIGHT'], ['EGLL_TWR', '118.500', 'TWR'], ['EGLL_GND', '121.800', 'GND'], ['EGLL_DEL', '121.970', 'DEL']].map(([c, f, r]) => (
              <div className="demo-net-controller" key={c}><div><strong>{c}</strong><span>●</span></div><b>{f}</b><small>{r}</small></div>
            ))}
          </div>
        </Panel>
      </div>
    </section>
  );
}

/* ---------------- LIVE MAP ---------------- */
function MapPage({ sim }) {
  return (
    <section className="demo-page active">
      <PageHeading kicker="CONTROL POSITION 07" title="Live map">
        <span className="demo-readout">MAP LIVE</span>
        <button className="demo-ctl" type="button">Refresh</button>
      </PageHeading>
      <div className="demo-map-layout">
        <Panel title="BAW118 · EGLL → JFK" right="12 AIRCRAFT" className="demo-map-panel">
          <div className="demo-map-toolbar">
            <button className="demo-ctl active" type="button">WORLD</button>
            <button className="demo-ctl" type="button">ROUTE</button>
            <button className="demo-ctl" type="button">FOLLOW</button>
            <button className="demo-ctl" type="button">RESET VIEW</button>
            <button className="demo-ctl" type="button">NORTH UP</button>
            <button className="demo-ctl" type="button">NOTAMS</button>
          </div>
          <div className="demo-map-viewport">
            <svg viewBox="0 0 900 420" className="demo-map-svg" role="img" aria-label="OPS ROOM live map simulation">
              <defs>
                <pattern id="demoGrid" width="44" height="44" patternUnits="userSpaceOnUse">
                  <path d="M44 0H0V44" fill="none" stroke="rgba(115,118,90,0.16)" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="900" height="420" fill="url(#demoGrid)" />
              <path d="M80 330 L200 260 L330 210 L470 170 L610 140 L760 115 L830 108" fill="none" stroke="var(--damber)" strokeWidth="2" strokeDasharray="6 5" opacity="0.85" />
              {[['EGLL', 80, 340], ['DVR', 200, 268], ['BEDEK', 330, 216], ['LULOX', 470, 175], ['CANNE', 610, 144], ['JFK', 830, 112]].map(([n, x, y]) => (
                <g key={n}>
                  <circle cx={x} cy={y} r="4" fill="var(--dbg)" stroke="var(--damber)" strokeWidth="2" />
                  <text x={x} y={y - 10} fill="var(--dmuted)" fontSize="11" fontFamily="monospace" textAnchor="middle">{n}</text>
                </g>
              ))}
              <path d="M185 330 L520 205" stroke="var(--dgreen)" strokeWidth="1.6" strokeDasharray="3 4" opacity="0.7" />
              {[[260, 300, 'DLH400'], [420, 255, 'AFR164'], [590, 205, 'UAL930'], [715, 170, 'VIR26']].map(([x, y, c]) => (
                <g key={c}>
                  <circle cx={x} cy={y} r="3.4" fill="var(--dgreen)" opacity="0.85" />
                  <text x={x} y={y + 14} fill="#9cf78e" fontSize="10" fontFamily="monospace" textAnchor="middle">{c}</text>
                </g>
              ))}
              <g>
                <path d="M206 332 l14 -9 -14 -9 v6 h-16 v6 h16 z" fill="var(--damber)" transform={`rotate(${sim.hdg - 90} 206 332)`} style={{ transformOrigin: '206px 332px' }} />
                <circle cx="206" cy="332" r="7" fill="none" stroke="var(--damber)" strokeWidth="1.4" opacity="0.6" />
              </g>
            </svg>
            <div className="demo-map-hud">
              <div><span>OWN AIRCRAFT</span><b>BAW118</b></div>
              <div><span>ALT</span><b>{Math.round(sim.alt).toLocaleString()} FT</b></div>
              <div><span>GS</span><b>{Math.round(sim.gs)} KT</b></div>
              <div><span>HDG</span><b>{Math.round(sim.hdg)}°</b></div>
            </div>
            <div className="demo-map-provider">ONLINE VECTOR MAP · © OPENSTREETMAP CONTRIBUTORS · OPENLAYERS · SIMULATION</div>
          </div>
        </Panel>
        <Panel title="Map information" right="Live" className="demo-map-info">
          <div className="demo-map-legend">
            <div><i className="demo-lamp lamp-amber"></i>OWN AIRCRAFT</div>
            <div><i className="demo-lamp lamp-green"></i>VATSIM TRAFFIC</div>
            <div><i className="demo-lamp lamp-red"></i>ONLINE ATC</div>
            <div><i className="demo-lamp lamp-amber" style={{ opacity: 0.4 }}></i>SIMBRIEF ROUTE</div>
          </div>
          <div className="demo-map-selected"><span>SELECTED ITEM</span><b>BAW118 · G-CLRA · FL370</b></div>
          <div className="demo-map-selected"><span>AVIATION / SURFACE STATUS</span><b>AVIATION LAYERS LIVE</b></div>
          <div className="demo-map-controllers"><span>ONLINE CONTROLLERS</span><div><b>LONDON CTR</b> 134.120</div><div><b>EGLL TWR</b> 118.500</div></div>
        </Panel>
      </div>
    </section>
  );
}

/* ---------------- DATALINK ---------------- */
function DatalinkPage() {
  return (
    <section className="demo-page active">
      <PageHeading kicker="CONTROL POSITION 08" title="Datalink">
        <span className="demo-readout">HOPPIE CONNECTED</span>
        <button className="demo-ctl" type="button">LINK TEST</button>
        <button className="demo-ctl" type="button">POLL NOW</button>
      </PageHeading>
      <div className="demo-datalink-layout">
        <Panel title="ACARS / CPDLC" right="Connected" className="demo-dl-wide">
          <div className="demo-dl-status"><div><Lamp tone="green" /><b>HOPPIE POLLING ACTIVE</b></div><div><span>LOGON</span><b>BAW118</b></div><div><span>NEXT POLL</span><b>4S</b></div></div>
          <div className="demo-dl-warning">USE ONLY ONE HOPPIE CLIENT PER CALLSIGN. DISABLE THE AIRCRAFT CLIENT BEFORE STARTING OPS ROOM POLLING.</div>
        </Panel>
        <Panel title="Flight identity" right="Host managed">
          <div className="demo-dl-form"><label>CALLSIGN OVERRIDE<input defaultValue="BAW118" /></label><div className="demo-inline-actions"><button className="demo-ctl" type="button">APPLY</button><button className="demo-ctl" type="button">AUTO</button><button className="demo-ctl" type="button">STOP POLLING</button></div></div>
        </Panel>
        <Panel title="CPDLC logon" right="Data authority EDYY">
          <div className="demo-dl-form horizontal"><label>ATC FACILITY<input defaultValue="EDYY" /></label><button className="demo-ctl demo-primary" type="button">REQUEST LOGON</button></div>
        </Panel>
        <Panel title="PDC / CPDLC templates" right="Ready" className="demo-dl-wide">
          <div className="demo-dl-templates">
            <label>CATEGORY<select><option>PDC / DCL</option><option>CPDLC</option></select></label>
            <label>TEMPLATE<select><option>DEPARTURE CLEARANCE</option><option>STARTUP APPROVAL</option></select></label>
            <label>PHASE<select><option>AUTO</option><option>ON GROUND</option><option>DEPARTURE</option></select></label>
            <label>FIELD<input defaultValue="CALLSIGN" /></label>
            <label>FIELD<input defaultValue="CLEARANCE" /></label>
            <div className="demo-inline-actions"><button className="demo-ctl" type="button">AUTO FILL</button><button className="demo-ctl demo-primary" type="button">TRANSFER TO MAILBOX</button><button className="demo-ctl" type="button">CLEAR</button></div>
          </div>
        </Panel>
        <Panel title="New message" right="Ready" className="demo-dl-wide">
          <div className="demo-dl-compose">
            <label>TYPE<select><option>TELEX</option><option>CPDLC</option></select></label>
            <label>TO<input defaultValue="EDYY" /></label>
            <label className="wide">MESSAGE<textarea rows="2" defaultValue="BAW118 REQUEST DEPARTURE CLEARANCE" /></label>
            <button className="demo-ctl demo-primary" type="button">SEND</button>
          </div>
        </Panel>
        <Panel title="Weather request" right="Hoppie">
          <div className="demo-dl-info"><input defaultValue="KJFK" /><button className="demo-ctl" type="button">METAR</button><button className="demo-ctl" type="button">TAF</button><button className="demo-ctl" type="button">VATSIM ATIS</button></div>
        </Panel>
        <Panel title="Datalink messages" right="3 messages" className="demo-dl-wide">
          <div className="demo-dl-msg"><time>10:04Z</time><b>EDYY · CPDLC</b><span>LOGON ACCEPTED, DATA AUTHORITY EDYY</span></div>
          <div className="demo-dl-msg"><time>10:11Z</time><b>EDYY · CPDLC</b><span>CLIMB TO FL370, CONTACT LONDON CONTROL 134.120</span></div>
          <div className="demo-dl-msg"><time>11:02Z</time><b>KJFK · METAR</b><span>KJFK 101051Z 24012KT 10SM FEW040 SCT250 22/13 A2998</span></div>
        </Panel>
      </div>
    </section>
  );
}

/* ---------------- GROUND CONTROL ---------------- */
function GroundPage() {
  return (
    <section className="demo-page active">
      <PageHeading kicker="GROUND OPERATIONS" title="GROUND CONTROL">
        <span className="demo-readout">GSX RUNNING</span>
        <button className="demo-ctl" type="button">Refresh</button>
        <button className="demo-ctl" type="button">RELEASE GSX</button>
      </PageHeading>
      <div className="demo-ground-layout">
        <Panel title="Turnaround status" right="Connected" className="demo-ground-overview">
          <div className="demo-ground-overview">
            <div><span>GSX / COUATL</span><b>RUNNING</b></div>
            <div><span>PASSENGERS</span><b>0 / 269</b></div>
            <div><span>BOARD CARGO</span><b>0%</b></div>
            <div><span>DEBOARD CARGO</span><b>0%</b></div>
          </div>
        </Panel>
        <Panel title="Service sequence" right="Ready" className="demo-ground-auto">
          <div className="demo-ground-console">
            <div className="demo-ground-service-options"><label className="demo-check"><input type="checkbox" defaultChecked /> CATERING</label><label className="demo-check"><input type="checkbox" defaultChecked /> POTABLE WATER</label><b className="demo-ground-saved">SAVED</b></div>
            <div className="demo-ground-actions">
              <button className="demo-ctl demo-primary" type="button">BEGIN DEPARTURE SERVICES</button>
              <button className="demo-ctl" type="button">BEGIN ARRIVAL SERVICES</button>
              <button className="demo-ctl" type="button">BEGIN FULL TURNAROUND</button>
            </div>
          </div>
          <div className="demo-ground-timeline">
            <div><span className="demo-lamp lamp-green"></span><b>PUSHBACK</b><small>10:05Z · COMPLETE</small></div>
            <div><span className="demo-lamp lamp-amber"></span><b>BOARDING</b><small>STANDBY</small></div>
            <div><span className="demo-lamp lamp-amber"></span><b>CARGO</b><small>STANDBY</small></div>
          </div>
        </Panel>
        <Panel title="GSX panel" right="Connected">
          <div className="demo-network-empty">The live GSX panel appears here when it is available.</div>
        </Panel>
        <Panel title="Manual services" right="Available when needed" className="demo-ground-services">
          <div className="demo-ground-services-grid">
            <button className="demo-ctl" type="button">FUEL</button>
            <button className="demo-ctl" type="button">WATER</button>
            <button className="demo-ctl" type="button">CATERING</button>
            <button className="demo-ctl" type="button">PUSHBACK</button>
            <button className="demo-ctl" type="button">JETWAY</button>
            <button className="demo-ctl" type="button">DEBOARD</button>
          </div>
        </Panel>
        <Panel title="Service receipts" right="4 receipts" className="demo-ground-receipts">
          <div className="demo-ground-receipt"><span>FUEL · 09:58Z</span><b>64,100 KG</b></div>
          <div className="demo-ground-receipt"><span>POTABLE WATER · 09:59Z</span><b>1,200 L</b></div>
          <div className="demo-ground-receipt"><span>CATERING · 10:00Z</span><b>269 TROLLEYS</b></div>
        </Panel>
        <Panel title="Recent ground activity" right="6 events" className="demo-ground-events">
          <div className="demo-ground-event"><time>10:02Z</time><b>PUSHBACK COMPLETE</b></div>
          <div className="demo-ground-event"><time>10:00Z</time><b>CATERING LOADED</b></div>
          <div className="demo-ground-event"><time>09:58Z</time><b>FUEL COMPLETE</b></div>
        </Panel>
      </div>
    </section>
  );
}

/* ---------------- ANNOUNCER ---------------- */
function AnnouncerPage() {
  return (
    <section className="demo-page active">
      <PageHeading kicker="CABIN AUDIO" title="ANNOUNCER">
        <a className="demo-ctl" href="https://discord.gg/ZqZSSfeW9W" target="_blank" rel="noreferrer">Cabin audio packs</a>
        <button className="demo-ctl" type="button">Pause</button>
        <button className="demo-ctl" type="button">Mute</button>
        <button className="demo-ctl" type="button">Stop</button>
      </PageHeading>
      <div className="demo-announcer-layout">
        <Panel title="Cabin announcements" right="Voice pack ready">
          <div className="demo-announcer-status"><Lamp tone="green" /><b>BRITISH AIRWAYS · US ENGLISH</b></div>
          <div className="demo-announcer-hotkeys">Shortcuts · Pause Ctrl+Alt+P · Mute Ctrl+Alt+M</div>
          <div className="demo-announcer-row"><label>Airline<input defaultValue="AUTO" /></label><button className="demo-ctl" type="button">Use</button><button className="demo-ctl" type="button">Automatic</button><span>Automatic from flight plan</span></div>
          <div className="demo-announcer-row"><label>Volume</label><input type="range" min="0" max="100" defaultValue="80" /><b>80%</b></div>
        </Panel>
        <Panel title="Play an announcement" right="Manual" className="demo-announcer-buttons">
          <div className="demo-announcement-buttons">
            {['Boarding music', 'Welcome aboard', 'Safety briefing', 'Cabin crew for takeoff', 'Cabin lights for takeoff', 'After takeoff', 'Fasten seat belts', 'Cabin crew for landing', 'After landing', 'Disembarkation'].map((a) => (
              <button key={a} type="button">{a}</button>
            ))}
          </div>
        </Panel>
        <Panel title="Recent announcements" right="3 events" className="demo-announcer-log">
          <div className="demo-announcer-event"><time>09:58Z</time><b>BOARDING MUSIC</b><span>PLAYED</span></div>
          <div className="demo-announcer-event"><time>10:00Z</time><b>WELCOME ABOARD</b><span>PLAYED</span></div>
          <div className="demo-announcer-event"><time>10:05Z</time><b>SAFETY BRIEFING</b><span>PLAYED</span></div>
        </Panel>
      </div>
    </section>
  );
}

/* ---------------- PROCEDURES ---------------- */
function ProceduresPage() {
  const [phase, setPhase] = useState('Before Start');
  const phases = ['Before Start', 'Taxi', 'Takeoff', 'Climb', 'Cruise', 'Descent', 'Approach', 'Landing'];
  const items = {
    'Before Start': ['IGNITION ON', 'FUEL PUMPS ON', 'APU RUNNING', 'PACKS NORM', 'BARO SET 1015'],
    'Taxi': ['FLAPS 2', 'FLIGHT CONTROLS CHECKED', 'TAXI LIGHTS ON'],
    'Takeoff': ['V1 148 KT', 'ROTATION 2.1°', 'POSITIVE CLIMB', 'GEAR UP'],
    'Climb': ['FLAPS UP', 'CLIMB THRUST', 'CRZ FL370'],
    'Cruise': ['MACH 0.838', 'AUTO THRUST', 'FUEL 90.8T'],
    'Descent': ['FL200', 'SPEED 284 KT', 'BARO QNH 1015'],
    'Approach': ['FLAPS 3', 'GEAR DOWN', 'LANDING CHECKLIST'],
    'Landing': ['VREF 142 KT', 'AUTOBRAKE MED', 'AFTER LANDING'],
  };
  return (
    <section className="demo-page active">
      <PageHeading kicker="CONTROL POSITION 11" title="Procedures">
        <span className="demo-readout">CHECKLIST READY</span>
        <button className="demo-ctl" type="button">Reset phase</button>
        <button className="demo-ctl" type="button">Reset all</button>
      </PageHeading>
      <div className="demo-procedures-layout">
        <Panel title="Aircraft profile" right="A350-1000">
          <div className="demo-proc-controls"><label>PROFILE<select><option>AUTO DETECT</option><option>A350-900</option><option selected>A350-1000</option></select></label><label className="demo-check"><input type="checkbox" defaultChecked /> FOLLOW FLIGHT PHASE</label><label className="demo-check"><input type="checkbox" defaultChecked /> AUTO ADVANCE</label><span className="demo-proc-source">OPS ROOM GENERIC PROFILE</span></div>
          <div className="demo-proc-phase-tabs">
            {phases.map((p) => (
              <button key={p} className={phase === p ? 'active' : ''} type="button" onClick={() => setPhase(p)}>{p.toUpperCase()}</button>
            ))}
          </div>
        </Panel>
        <Panel title={`CHECKLIST · ${phase.toUpperCase()}`} right={`${items[phase].length} / ${items[phase].length}`} className="demo-proc-checklist">
          <div className="demo-proc-items">
            {items[phase].map((it) => (
              <label key={it} className="demo-check"><input type="checkbox" /> {it}</label>
            ))}
          </div>
          <div className="demo-proc-notice">Simulation aid only. Use the approved checklist for the aircraft being flown.</div>
        </Panel>
        <Panel title="Non-normal / QRH" right="Simulation aid" className="demo-qrh">
          <div className="demo-qrh-search"><input placeholder="SEARCH: ENGINE FIRE, SMOKE, GEAR, WINDSHEAR..." /><button className="demo-ctl" type="button">SEARCH</button></div>
          <div className="demo-qrh-list">
            {['ENGINE FIRE', 'ENGINE SEVERE DAMAGE', 'CABIN ALTITUDE WARNING', 'GEAR NOT DOWN', 'WINDSHEAR WARNING', 'RUNWAY EXCURSION'].map((c) => (
              <button key={c} type="button">{c}</button>
            ))}
          </div>
        </Panel>
        <Panel title="SELECT NON-NORMAL CHECKLIST" right="READY" className="demo-qrh-detail">
          <div className="demo-qrh-memory"><b>ENGINE FIRE</b><span>MEMORY ITEMS</span><ol><li>THRUST LEVER (AFFECTED) IDLE</li><li>ENGINE MASTER (AFFECTED) OFF</li><li>AGENT 1 DISCHARGE</li><li>WAIT 30 SECONDS</li></ol></div>
          <div className="demo-qrh-notice">For flight simulation use only. This is not real-world aviation documentation.</div>
        </Panel>
      </div>
    </section>
  );
}

/* ---------------- LOGBOOK ---------------- */
const LOG_ROWS = [
  ['2026-08-10', 'EGLL', 'JFK', 'A35K', '6.4', 'EXCELLENT'],
  ['2026-08-08', 'EDDF', 'KJFK', 'B77W', '8.1', 'GOOD'],
  ['2026-08-05', 'LFPG', 'EGLL', 'A20N', '1.2', 'EXCELLENT'],
  ['2026-08-02', 'OMDB', 'LFPG', 'A359', '7.3', 'FAIR'],
];

function LogbookPage() {
  return (
    <section className="demo-page active">
      <PageHeading kicker="CONTROL POSITION 12" title="Logbook and debrief">
        <span className="demo-readout">RECORDER STANDBY</span>
        <button className="demo-ctl" type="button">Refresh</button>
        <button className="demo-ctl demo-primary" type="button">Start recording</button>
        <button className="demo-ctl" type="button">Scoring rules</button>
      </PageHeading>
      <div className="demo-log-layout">
        <Panel title="Career totals" right="214 flights" className="demo-log-stats">
          <div className="demo-log-stats-grid">
            <div><span>BLOCK HOURS</span><b>412.6</b></div>
            <div><span>DISTANCE</span><b>2.4M NM</b></div>
            <div><span>ON TIME</span><b>91%</b></div>
            <div><span>AVG SCORE</span><b>88</b></div>
          </div>
        </Panel>
        <Panel title="Flight records" right="Saved flights" className="demo-log-table">
          <div className="demo-log-tools"><input placeholder="CALLSIGN, AIRPORT, AIRCRAFT OR NOTE" /><button className="demo-ctl" type="button">SEARCH</button><button className="demo-ctl" type="button">EXPORT CSV</button></div>
          <table className="demo-log-table-rows">
            <thead><tr><th>DATE</th><th>FROM</th><th>TO</th><th>AC</th><th>BLOCK</th><th>SCORE</th></tr></thead>
            <tbody>
              {LOG_ROWS.map((r) => (
                <tr key={`${r[0]}-${r[1]}`}>
                  <td>{r[0]}</td><td><b>{r[1]}</b></td><td><b>{r[2]}</b></td><td>{r[3]}</td><td>{r[4]}H</td><td><span className="demo-log-score">{r[5]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </section>
  );
}

/* ---------------- BLACK BOX ---------------- */
function Gauge({ value, label, unit }) {
  const pct = Math.max(0, Math.min(100, value));
  const R = 34;
  const C = Math.PI * R;
  const dash = (pct / 100) * C;
  return (
    <div className="demo-gauge">
      <svg viewBox="0 0 100 58" width="100%" height="100%" aria-hidden="true">
        <path d="M 16 52 A 34 34 0 0 1 84 52" fill="none" stroke="var(--dline)" strokeWidth="7" strokeLinecap="square" />
        <path d="M 16 52 A 34 34 0 0 1 84 52" fill="none" stroke="var(--damber)" strokeWidth="7" strokeLinecap="square" strokeDasharray={`${dash} ${C - dash}`} />
      </svg>
      <div className="demo-gauge-read"><b>{value.toFixed(1)}%</b><span>{label}</span><small>{unit}</small></div>
    </div>
  );
}

function BlackBoxPage() {
  const [view, setView] = useState('engines');
  return (
    <section className="demo-page active">
      <PageHeading kicker="FLIGHT DATA RECORDER" title="Black Box and replay">
        <span className="demo-readout">READY TO RECORD</span>
        <span className="demo-auto-refresh"><i></i>AUTO-REFRESH</span>
        <button className="demo-ctl" type="button">REFRESH NOW</button>
      </PageHeading>
      <div className="demo-blackbox-layout">
        <div className="demo-bbx-col">
          <Panel title="Flight-data recorder" right="TAXI OUT → TAXI IN">
            <div className="demo-bbx-recorder">
              <div className="demo-bbx-rec-head"><b>Automatic flight-data recording</b><span>Starts when engines are running on the ground</span><small>Records flight path, motion, controls, engines and available aircraft systems through FSUIPC or SimConnect.</small></div>
              <div className="demo-bbx-prefs">
                <label className="demo-check"><input type="checkbox" defaultChecked /> BLACK BOX ENABLED</label>
                <label className="demo-check"><input type="checkbox" defaultChecked /> AUTO RECORD TAXI OUT → TAXI IN</label>
                <label>MAX CAPTURE RATE<select defaultValue="30"><option>10 Hz</option><option>20 Hz</option><option selected>30 Hz</option><option>50 Hz</option></select></label>
              </div>
            </div>
          </Panel>
          <Panel title="Aircraft adapters" right="CHECKING">
            <div className="demo-bbx-adapter">
              <div><b>AIRCRAFT ADAPTERS</b><span>GENERIC MSFS AIRCRAFT · GENERIC FALLBACK</span></div>
              <div className="demo-bbx-map"><span>114 / 133 CURATED MAPPINGS</span><small>LVAR MODULE VERIFIED · BROADCAST ENABLED</small></div>
              <button className="demo-ctl" type="button">INSTALL / REPAIR ADD-ON ADAPTERS</button>
              <div className="demo-bbx-fsuipc"><b>FSUIPC LOG</b><span>Tracked log size 2 KB · FSUIPC7.log (2 KB)</span><button className="demo-ctl" type="button">SILENCE FSUIPC LOGS & TRIM NOW</button></div>
            </div>
          </Panel>
          <Panel title="Recordings" right="3 saved">
            <div className="demo-bbx-recordings">
              <div className="demo-bbx-rec-item active"><b>AVA59 · MPTO → SKBO</b><span>02:16 · 1,395 samples · ENGINES</span></div>
              <div className="demo-bbx-rec-item"><b>BAW118 · EGLL → JFK</b><span>06:24 · 48,240 samples · IN PROGRESS</span></div>
              <div className="demo-bbx-rec-item"><b>DLH400 · EDDF → KEWR</b><span>07:02 · 50,112 samples</span></div>
            </div>
          </Panel>
        </div>
        <div className="demo-bbx-col">
          <Panel title="Flight-data review" right="READY" className="demo-bbx-replay">
            <div className="demo-bbx-summary">
              <div className="demo-bbx-summary-head"><b>AVA59 · MPTO → SKBO</b><span>1,395 SAMPLES · 02:16</span></div>
              <div className="demo-bbx-summary-meta"><span>AVIANCA · AEROVIAS NACIONALES DE COLOMBIA</span><b>HK-5519</b></div>
              <div className="demo-bbx-summary-row"><span>Status</span><b>Complete</b><span>Duration</span><b>02:16</b><span>Samples</span><b>1,395</b><span>Quality</span><b>43.8%</b><span>Parameters</span><b>87</b></div>
            </div>
            <nav className="demo-bbx-tabs" aria-label="Black Box data view">
              <button className={view === 'flight' ? 'active' : ''} type="button" onClick={() => setView('flight')}>Flight</button>
              <button className={view === 'engines' ? 'active' : ''} type="button" onClick={() => setView('engines')}>Engines</button>
              <button className={view === 'track' ? 'active' : ''} type="button" onClick={() => setView('track')}>Track</button>
              <button className={view === 'events' ? 'active' : ''} type="button" onClick={() => setView('events')}>Events</button>
            </nav>
            {view === 'engines' ? (
              <div className="demo-bbx-engines">
                <div className="demo-bbx-engine">
                  <header><b>ENG 1</b><span className="demo-run-pill">RUN</span></header>
                  <Gauge value={21.1} label="N1" unit="%" />
                  <div className="demo-bbx-engine-rows">
                    <div><span>N1</span><div className="demo-bar"><i style={{ width: '21%' }} /></div><b>21.1%</b></div>
                    <div><span>EGT</span><div className="demo-bar"><i style={{ width: '62%' }} /></div><b>475°C</b></div>
                    <div><span>FUEL FLOW</span><div className="demo-bar"><i style={{ width: '34%' }} /></div><b>341 PPH</b></div>
                    <div><span>LEVER</span><div className="demo-bar"><i style={{ width: '9%' }} /></div><b>1%</b></div>
                  </div>
                </div>
                <div className="demo-bbx-engine">
                  <header><b>ENG 2</b><span className="demo-run-pill">RUN</span></header>
                  <Gauge value={21.1} label="N1" unit="%" />
                  <div className="demo-bbx-engine-rows">
                    <div><span>N1</span><div className="demo-bar"><i style={{ width: '21%' }} /></div><b>21.1%</b></div>
                    <div><span>EGT</span><div className="demo-bar"><i style={{ width: '62%' }} /></div><b>475°C</b></div>
                    <div><span>FUEL FLOW</span><div className="demo-bar"><i style={{ width: '34%' }} /></div><b>341 PPH</b></div>
                    <div><span>LEVER</span><div className="demo-bar"><i style={{ width: '9%' }} /></div><b>1%</b></div>
                  </div>
                </div>
              </div>
            ) : view === 'flight' ? (
              <div className="demo-bbx-stats">
                {[['ALTITUDE', '37,000 FT'], ['IAS', '284 KT'], ['G-LOAD', '1.02 G'], ['V/S @ TD', '-184 FPM'], ['PITCH', '2.4°'], ['BANK', '0.1°']].map(([l, v]) => (
                  <div key={l}><span>{l}</span><b>{v}</b></div>
                ))}
              </div>
            ) : view === 'track' ? (
              <div className="demo-bbx-stats">
                {[['PLANNED ROUTE', '8 WP'], ['ACTUAL TRACK', 'MATCHED'], ['CROSS-TRACK', '0.3 NM'], ['WAYPOINTS', '8 / 8']].map(([l, v]) => (
                  <div key={l}><span>{l}</span><b>{v}</b></div>
                ))}
              </div>
            ) : (
              <div className="demo-bbx-events">
                <div><time>00:04</time><b>ENGINES RUNNING</b><span>RECORDING STARTED</span></div>
                <div><time>00:41</time><b>LIFTOFF</b><span>V2 148 KT · ROTATION 2.1°</span></div>
                <div><time>01:52</time><b>CRUISE</b><span>FL370 · MACH 0.838</span></div>
                <div><time>02:09</time><b>TURBULENCE</b><span>MODERATE · 30 SECONDS</span></div>
              </div>
            )}
            <input className="demo-bbx-timeline" type="range" min="0" max="100" defaultValue="38" aria-label="Replay timeline" />
            <div className="demo-bbx-controls">
              <button className="demo-ctl demo-primary" type="button">PLAY REVIEW</button>
              <button className="demo-ctl" type="button">STOP</button>
              <label>SPEED<select defaultValue="1"><option>0.25×</option><option>0.5×</option><option selected>1×</option><option>2×</option><option>4×</option></select></label>
              <label className="demo-check"><input type="checkbox" /> LOOP</label>
              <button className="demo-ctl" type="button">START IN-SIM REPLAY</button>
            </div>
          </Panel>
        </div>
      </div>
    </section>
  );
}

/* ---------------- FINANCES ---------------- */
function FinancesPage() {
  return (
    <section className="demo-page active">
      <PageHeading title="Finance & career">
        <span className="demo-readout">Ready</span>
      </PageHeading>
      <div className="demo-finance-layout">
        <Panel title="Latest flight and balances" right="Finance & career" className="demo-finance-hero">
          <div className="demo-finance-summary">
            <div><span>BALANCE</span><b>€ 18,420</b></div>
            <div><span>PAY THIS FLIGHT</span><b>€ 1,244</b></div>
            <div><span>OPERATING COST</span><b>€ 7,812</b></div>
            <div><span>FLIGHTS</span><b>214</b></div>
          </div>
        </Panel>
        <Panel title="Preflight estimate" right="Expected revenue and operating cost" className="demo-finance-estimate">
          <div className="demo-finance-summary">
            <div><span>EST. REVENUE</span><b>€ 9,056</b></div>
            <div><span>EST. COST</span><b>€ 7,812</b></div>
            <div><span>EST. NET</span><b>€ 1,244</b></div>
          </div>
        </Panel>
        <Panel title="Pilot record" right="Sectors and block hours" className="demo-finance-rank">
          <div className="demo-finance-rank-current"><span>RANK</span><b>CAPTAIN</b><span>SECTORS</span><b>214</b><span>BLOCK HOURS</span><b>412.6</b></div>
          <div className="demo-rank-list"><span>NEXT RANK: SENIOR CAPTAIN AT 260 SECTORS</span></div>
        </Panel>
        <Panel title="Finance assumptions" right="Currency EUR" className="demo-finance-assumptions">
          <div className="demo-finance-form">
            <label>Currency<select defaultValue="EUR"><option>EUR</option><option>USD</option><option>GBP</option></select></label>
            <label>Career pace<select defaultValue="standard"><option>Relaxed</option><option selected>Standard</option><option>Realistic</option></select></label>
            <label className="demo-check"><input type="checkbox" defaultChecked /> AUTOMATIC FARES</label>
            <label>ECONOMY CABIN %<input defaultValue="90" /></label>
            <label>BUSINESS CABIN %<input defaultValue="10" /></label>
            <label>OPERATION TYPE<select defaultValue="passenger"><option>Auto detect</option><option selected>Passenger</option><option>Freighter</option></select></label>
            <div className="demo-inline-actions"><button className="demo-ctl demo-primary" type="button">SAVE ASSUMPTIONS</button><button className="demo-ctl demo-danger" type="button">Reset career</button></div>
          </div>
        </Panel>
        <Panel title="Recent flight statements" right="Completed flights" className="demo-finance-ledger">
          <div className="demo-ledger">
            <div><span>10 AUG</span><b>EGLL → JFK</b><small>€ 1,244</small></div>
            <div><span>08 AUG</span><b>EDDF → KJFK</b><small>€ 1,102</small></div>
            <div><span>05 AUG</span><b>LFPG → EGLL</b><small>€ 421</small></div>
            <div><span>02 AUG</span><b>OMDB → LFPG</b><small>€ 1,312</small></div>
          </div>
        </Panel>
      </div>
    </section>
  );
}

/* ---------------- OBS TOOLS ---------------- */
function ObsPage() {
  return (
    <section className="demo-page active">
      <PageHeading kicker="CONTROL POSITION 13" title="OBS overlay studio">
        <span className="demo-readout">Browser source setup</span>
      </PageHeading>
      <div className="demo-obs-layout">
        <Panel title="Overlay setup" right="LOCAL" className="demo-obs-panel">
          <div className="demo-obs-form">
            <label>OVERLAY TYPE<select><option>Flight strip</option><option>Telemetry panel</option><option>Route progress</option><option>Flight phase badge</option><option>ATC / Hoppie messages</option><option>Landing result</option></select></label>
            <label>LAYOUT<select><option>Wide strip</option><option>Lower third</option><option>Metric cards</option><option>Compact</option></select></label>
            <label>SCREEN POSITION<select><option>Centre</option><option>Top left</option><option>Top centre</option><option>Bottom left</option><option>Bottom centre</option></select></label>
            <label>WIDTH<input type="number" defaultValue="1280" /></label>
            <label>HEIGHT<input type="number" defaultValue="260" /></label>
            <label>ACCENT<input type="color" defaultValue="#efbd47" /></label>
            <label>BACKGROUND OPACITY<input type="range" min="0" max="100" defaultValue="94" /><output>94%</output></label>
            <label>TEXT SCALE<input type="range" min="70" max="160" defaultValue="100" /><output>100%</output></label>
          </div>
          <div className="demo-obs-toggles">
            <label className="demo-check"><input type="checkbox" defaultChecked /> TRANSPARENT CANVAS</label>
            <label className="demo-check"><input type="checkbox" defaultChecked /> SHOW FIELD LABELS</label>
            <label className="demo-check"><input type="checkbox" /> SHOW BRANDING</label>
            <label>BRANDING<select><option>Active airline</option><option>Custom logo</option><option>OPS ROOM</option></select></label>
          </div>
          <div className="demo-obs-fields">
            <b>VISIBLE DATA</b>
            <div>
              {['Route', 'Callsign', 'Aircraft', 'Altitude', 'AGL', 'Groundspeed', 'Vertical speed', 'Heading', 'Phase', 'Distance remaining', 'ETA', 'Fuel remaining', 'Wind', 'Autopilot', 'UTC clock'].map((f, i) => (
                <label key={f} className="demo-check"><input type="checkbox" defaultChecked={[0, 1, 3, 5, 8].includes(i)} /> {f}</label>
              ))}
            </div>
          </div>
          <div className="demo-obs-actions">
            <button className="demo-ctl demo-primary" type="button">COPY SOURCE URL</button>
            <button className="demo-ctl" type="button">REFRESH PREVIEW</button>
            <button className="demo-ctl" type="button">OPEN SOURCE</button>
          </div>
          <div className="demo-obs-instructions"><b>OBS SETUP</b><p>Add a Browser Source, paste the generated URL, then use the displayed width and height. All customization is encoded in the URL, while the uploaded logo remains stored locally by the OPS ROOM Host.</p></div>
        </Panel>
        <Panel title="Live preview" right="FLIGHT STRIP" className="demo-obs-preview">
          <div className="demo-obs-stage">
            <div className="demo-obs-strip">
              <div className="demo-obs-strip-main">
                <span className="demo-obs-airline">BA</span>
                <b>BAW118</b>
                <span className="demo-obs-route">EGLL → JFK</span>
                <span className="demo-obs-ac">A350-1000</span>
              </div>
              <div className="demo-obs-strip-data">
                <span>FL370</span><span>284 KT</span><span>GS 442</span><span>ETA 15:42Z</span><span>PHASE CRZ</span>
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </section>
  );
}

/* ---------------- SYSTEM / SETTINGS ---------------- */
function SystemPage() {
  const version = useLatestVersion();
  return (
    <section className="demo-page active">
      <PageHeading kicker="CONTROL POSITION 14" title="Settings">
        <span className="demo-readout">Host managed</span>
      </PageHeading>
      <div className="demo-system-grid">
        <Panel title="Accounts and integrations" right="OPS ROOM host" className="demo-system-wide">
          <div className="demo-host-notice">
            <span className="demo-host-symbol">H</span>
            <div><strong>ACCOUNTS AND INTEGRATIONS ARE MANAGED ON THE HOST PC</strong><p>VATSIM CID, SimBrief identity, Hoppie code, GSX path, LAN access and server port are configured in the OPS ROOM desktop host.</p></div>
          </div>
          <div className="demo-host-rows">
            <div><span className="demo-lamp lamp-green"></span><span><b>VATSIM CID</b><small>1422001</small></span></div>
            <div><span className="demo-lamp lamp-green"></span><span><b>SIMBRIEF PILOT ID</b><small>exzonom</small></span></div>
            <div><span className="demo-lamp lamp-green"></span><span><b>HOPPIE LOGON</b><small>configured</small></span></div>
            <div><span className="demo-lamp lamp-green"></span><span><b>GSX PATH</b><small>MSFS / community</small></span></div>
          </div>
        </Panel>
        <Panel title="This display" right="Device settings">
          <div className="demo-settings-form">
            <label>DISPLAY SIZE<select><option>Automatic</option><option>Standard</option><option>Large</option><option>TV / Long Distance</option></select></label>
            <label>HOME STYLE<select><option>EFB / iPad Launcher</option><option>Classic Console</option></select></label>
            <label className="demo-check"><input type="checkbox" defaultChecked /> AUTO-FETCH OFP ON START / REFRESH</label>
            <div className="demo-inline-actions"><button className="demo-ctl" type="button">Fullscreen</button></div>
          </div>
        </Panel>
        <Panel title="Finance & career" right="Optional">
          <label className="demo-check"><input type="checkbox" defaultChecked /> ENABLE FINANCE & CAREER</label>
          <p className="demo-field-note">Turning this off hides the Finances module and removes finance, balances, rank and pilot-pay sections from new PIREPs.</p>
        </Panel>
        <Panel title="Airline branding" right="Optional">
          <label className="demo-check"><input type="checkbox" defaultChecked /> ENABLE AIRLINE LOGOS</label>
          <p className="demo-field-note">Automatic branding uses the SimBrief airline first, then the callsign and packaged airline database.</p>
        </Panel>
        <Panel title="Visible modules" right="Display layout" className="demo-system-wide">
          <div className="demo-module-visibility">
            {NAV.filter((n) => n.id !== 'modules').slice(0, 10).map((n) => (
              <label key={n.id} className="demo-check"><input type="checkbox" defaultChecked /> {n.label}</label>
            ))}
          </div>
        </Panel>
        <Panel title="Local access" right="Show address">
          <div className="demo-server-urls"><span>AVAILABLE ADDRESSES</span><b>192.168.1.42:5757 · tablet.opsroom.local</b></div>
        </Panel>
        <Panel title="APP UPDATES & LOCAL STORAGE" right="Up to date" className="demo-system-wide">
          <div className="demo-maintenance-box"><b>Software updates</b><p>Update checks use the public OpsRoomApp GitHub release manifest. Source code is not downloaded or published.</p></div>
          <div className="demo-maintenance-box"><b>Local storage</b><p>Logs 2.4 MB · Cache 18 MB · Cleared 2 days ago</p></div>
          <div className="demo-inline-actions"><button className="demo-ctl" type="button">Check for updates</button><button className="demo-ctl" type="button">Clear logs</button><button className="demo-ctl" type="button">Clear logs and cache</button></div>
        </Panel>
        <Panel title="Startup log" right="Refresh" className="demo-system-wide">
          <pre className="demo-console-log">{`[10:03:12] OPS ROOM ${version} starting\n[10:03:13] FSUIPC7 connected\n[10:03:13] SimConnect connected\n[10:03:14] vPilot bridge detected\n[10:03:15] SimBrief OFP loaded (BAW118)\n[10:03:16] Hoppie polling started\n[10:03:17] System normal`}</pre>
        </Panel>
      </div>
    </section>
  );
}

/* ---------------- MODULES LAUNCHER ---------------- */
function ModulesPage({ onNav }) {
  return (
    <section className="demo-page active">
      <div className="demo-page-heading">
        <div><span className="demo-kicker">REMOTE OPERATIONS TERMINAL</span><h1>Modules</h1></div>
        <span className="demo-readout">Choose a module</span>
      </div>
      <div className="demo-module-grid">
        {NAV.filter((n) => n.id !== 'modules').map((n) => (
          <button className="demo-module-tile" type="button" key={n.id} onClick={() => onNav(n.id)}>
            <span className="demo-module-icon"><Icon d={TILE_ICONS[n.id] || TILE_ICONS.modules} size={34} /></span>
            <b>{n.label}</b>
            <small>OPS ROOM MODULE</small>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ---------------- APP FRAME ---------------- */
function AppFrame() {
  const [active, setActive] = useState('status');
  const clock = useUtcClock();
  const sim = useSim();
  const page = useMemo(() => {
    switch (active) {
      case 'modules': return <ModulesPage onNav={setActive} />;
      case 'status': return <StatusPage sim={sim} />;
      case 'fids': return <FidsPage />;
      case 'dispatch': return <DispatchPage />;
      case 'briefing': return <BriefingPage />;
      case 'scratchpad': return <ScratchpadPage />;
      case 'watch': return <WatchPage sim={sim} />;
      case 'performance': return <PerformancePage />;
      case 'raas': return <RaasPage />;
      case 'network': return <NetworkPage />;
      case 'map': return <MapPage sim={sim} />;
      case 'datalink': return <DatalinkPage />;
      case 'ground': return <GroundPage />;
      case 'announcer': return <AnnouncerPage />;
      case 'procedures': return <ProceduresPage />;
      case 'log': return <LogbookPage />;
      case 'blackbox': return <BlackBoxPage />;
      case 'finances': return <FinancesPage />;
      case 'obs': return <ObsPage />;
      case 'system': return <SystemPage />;
      default: return <ModulesPage onNav={setActive} />;
    }
  }, [active, sim]);

  return (
    <div className="demo-app">
      <Masthead clock={clock.clock} date={clock.date} />
      <div className="demo-app-body">
        <Rail active={active} onNav={setActive} />
        <main className="demo-workspace">{page}</main>
      </div>
      <footer className="demo-status-strip">
        <div className="demo-strip-item"><Lamp tone="green" /><span><b>VATSIM CID SET</b><small>1422001</small></span></div>
        <div className="demo-strip-item"><Lamp tone="green" /><span><b>SIMBRIEF OFP LOADED</b><small>EGLL → JFK</small></span></div>
        <div className="demo-strip-item"><Lamp tone="green" /><span><b>HOPPIE CONNECTED</b><small>CPDLC LINK</small></span></div>
        <div className="demo-strip-item"><Lamp tone="green" /><span><b>GSX RUNNING</b><small>GROUND SERVICES</small></span></div>
        <div className="demo-strip-item"><Lamp tone="amber" /><span><b>SIM STANDBY</b><small>PRE-FLIGHT</small></span></div>
        <div className="demo-strip-item"><Lamp tone="red" /><span><b>EFB KEEP AWAKE OFF</b><small>BATTERY</small></span></div>
        <div className="demo-strip-end" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></svg>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-5 14c0-4 2-7 5-8" /></svg>
        </div>
      </footer>
      <div className="demo-credit">Made for the community with <span aria-hidden="true">♥</span> by Exzonom</div>
    </div>
  );
}

export default function Demo() {
  return (
    <>
      <SEO
        title="OPS ROOM Live Demo: try the MSFS cockpit ops suite in your browser"
        description="Try OPS ROOM free in your browser: an interactive demo of the MSFS cockpit ops suite with dispatch, Flight Watch, Black Box, RAAS and 20 modules."
        path="/demo"
      />
    <div className="demo-page-wrap">
      <section className="demo-intro">
        <span className="demo-intro-kicker">INTERACTIVE DEMO</span>
        <h1>See OPS ROOM before you install it.</h1>
        <p>This is a working mockup of the real interface with simulated data. Click through the module rail: every one of the 20 modules is rendered here, from the status board to the black box, exactly as it looks in the desktop app.</p>
        <Link to="/download" className="demo-cta">DOWNLOAD THE REAL THING</Link>
      </section>
      <AppFrame />
    </div>
    </>
  );
}
