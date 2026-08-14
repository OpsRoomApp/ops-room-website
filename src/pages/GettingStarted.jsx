import { useState } from 'react';
import { Link } from 'react-router-dom';
import SEO from '../components/SEO.jsx';
import { PAGE_TITLES } from '../config/seo.js';

/*
 * Getting Started / Install & Setup.
 * Four lean steps that mirror the OPS ROOM desktop app, including an
 * interactive replica of the first-run onboarding wizard (the same 6-step
 * flow the app shows new users).
 */

function Lamp({ tone }) {
  return <i className={`demo-lamp lamp-${tone}`} aria-hidden="true" />;
}

/* ---------- host console mockup (first launch) ---------- */

const CONNECTIONS = [
  ['FSUIPC 7', 'Connected', 'green'],
  ['SimConnect', 'Connected', 'green'],
  ['vPilot 3.0', 'Connected', 'green'],
  ['SimBrief OFP', 'Loaded', 'green'],
  ['Hoppie CPDLC', 'Connected', 'green'],
  ['GSX Pro', 'Running', 'green'],
];

function HostConsole() {
  return (
    <div className="setup-host">
      <div className="setup-host-masthead">
        <div className="setup-host-title">
          <img src="/opsroom-mark.svg" alt="" width="26" height="26" />
          <strong>OPS ROOM</strong>
          <strong className="setup-host-build">0.25.0</strong>
          <span>HOST AND INTEGRATION CONSOLE</span>
        </div>
        <div className="setup-host-clock">
          <b>10:03:12 UTC</b>
          <span><Lamp tone="green" />SYSTEM NORMAL</span>
        </div>
      </div>
      <div className="setup-host-tabs">
        <button className="active" type="button">01 STATUS</button>
        <button type="button">02 SYSTEM SETUP</button>
      </div>
      <div className="setup-host-body">
        <div className="setup-host-banner">
          <div><span>LOCAL SERVICE</span><strong>RUNNING</strong></div>
          <div><span>VERSION</span><strong>0.25.0</strong></div>
          <div><span>ROLE</span><strong>HOST / BRIDGE</strong></div>
        </div>
        <div className="setup-host-grid">
          <section className="demo-panel">
            <header><span>SYSTEM CONNECTIONS</span></header>
            <div className="setup-host-conns">
              {CONNECTIONS.map(([name, state, tone]) => (
                <div className="setup-host-conn" key={name}>
                  <Lamp tone={tone} />
                  <span>{name}</span>
                  <b>{state}</b>
                </div>
              ))}
            </div>
          </section>
          <section className="demo-panel">
            <header><span>TABLET AND LAN ACCESS</span><span>CONNECTED</span></header>
            <div className="setup-host-access">
              <div className="setup-qr" />
              <div className="setup-host-access-main">
                <span>PREFERRED ADDRESS</span>
                <div className="setup-host-addr"><b>192.168.1.42:5757</b><button className="demo-ctl" type="button">SHOW</button></div>
                <p>Scan this code from any device on the same network.</p>
              </div>
            </div>
          </section>
        </div>
        <div className="setup-host-actions-row">
          <button className="demo-ctl demo-primary" type="button">OPEN OPS ROOM</button>
          <button className="demo-ctl" type="button">SYSTEM SETUP</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- first-run onboarding wizard mockup ---------- */

const WIZARD_STEPS = 6;

function OnbField({ label, optional, children }) {
  return (
    <label className="setup-onb-field">
      {label} {optional && <span className="setup-onb-optional">OPTIONAL</span>}
      {children}
    </label>
  );
}

function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const last = WIZARD_STEPS - 1;

  const statusRows = [
    ['Simulator', 'Not detected', false],
    ['SimBrief', 'Not set', false],
    ['VATSIM', 'Not set', false],
    ['Hoppie', 'Not set', false],
    ['Discord', 'Not connected', false],
    ['Announcements', 'Not set', false],
  ];

  return (
    <div className="setup-onb" role="dialog" aria-label="First-run setup">
      <header className="setup-onb-head">
        <div className="setup-onb-title">
          <span>HOST SETUP</span>
          <strong>OPS ROOM</strong>
        </div>
        <div className="setup-onb-dots" aria-hidden="true">
          {Array.from({ length: WIZARD_STEPS }).map((_, i) => (
            <button
              key={i}
              type="button"
              className={`setup-onb-dot${i === step ? ' active' : ''}`}
              aria-label={`Step ${i + 1}`}
              onClick={() => setStep(i)}
            />
          ))}
        </div>
        <button className="setup-onb-close" type="button" aria-label="Close setup">&times;</button>
      </header>

      <div className="setup-onb-body">
        {step === 0 && (
          <div className="setup-onb-step">
            <h2>Welcome</h2>
            <p className="setup-onb-sub">Link flight planning and audio in a few steps, or skip and fly now. Everything can be changed later in Host Setup.</p>
            <h3>Current setup</h3>
            <div className="setup-onb-status">
              {statusRows.map(([name, val, ok]) => (
                <div className="setup-onb-status-row" key={name}>
                  <i className={ok ? 'setup-onb-ok' : 'setup-onb-warn'} />
                  <span>{name}</span>
                  <small>{val}</small>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="setup-onb-step">
            <h2>Flight planning</h2>
            <p className="setup-onb-sub">SimBrief loads your flight plan and fills the Performance page automatically.</p>
            <OnbField label="SIMBRIEF PILOT ID OR USERNAME">
              <input placeholder="Pilot ID or username" />
            </OnbField>
            <OnbField label="VATSIM CID" optional>
              <input placeholder="1234567" />
            </OnbField>
          </div>
        )}

        {step === 2 && (
          <div className="setup-onb-step">
            <h2>Datalink</h2>
            <p className="setup-onb-sub">Hoppie adds CPDLC and PDC clearances. Request a free logon code at <a href="https://www.hoppie.nl/acars/system/register.html" target="_blank" rel="noopener noreferrer">hoppie.nl</a>.</p>
            <OnbField label="HOPPIE LOGON CODE" optional>
              <input type="password" placeholder="Leave blank to skip" />
            </OnbField>
          </div>
        )}

        {step === 3 && (
          <div className="setup-onb-step">
            <h2>Audio</h2>
            <OnbField label="ANNOUNCEMENTS FOLDER">
              <span className="setup-onb-folder-row">
                <input placeholder="Path to announcements" />
                <button className="setup-onb-btn" type="button">BROWSE</button>
              </span>
            </OnbField>
            <OnbField label="RAAS VOICE PACK FOLDER">
              <span className="setup-onb-folder-row">
                <input placeholder="Path to RAAS voice pack" />
                <button className="setup-onb-btn" type="button">BROWSE</button>
              </span>
            </OnbField>
          </div>
        )}

        {step === 4 && (
          <div className="setup-onb-step">
            <h2>Community</h2>
            <p className="setup-onb-sub">Connect Discord to post takeoff and landing events and appear on the leaderboard. Flight data only, always opt-in.</p>
            <div className="setup-onb-actions">
              <button className="setup-onb-btn primary" type="button">CONNECT DISCORD</button>
              <span className="setup-onb-state">NOT CONNECTED</span>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="setup-onb-step">
            <h2>Preferences</h2>
            <OnbField label="WEIGHT UNIT">
              <select defaultValue="KILOGRAMS (KG)">
                <option>KILOGRAMS (KG)</option>
                <option>POUNDS (LB)</option>
              </select>
            </OnbField>
            <label className="setup-onb-check">
              <input type="checkbox" defaultChecked /> ALLOW LAN / TABLET ACCESS
            </label>
          </div>
        )}
      </div>

      <footer className="setup-onb-foot">
        <button className="setup-onb-btn" type="button" onClick={() => setStep(0)}>SKIP ALL</button>
        <span className="setup-onb-spacer" />
        {step > 0 && (
          <button className="setup-onb-btn" type="button" onClick={() => setStep(step - 1)}>BACK</button>
        )}
        <button className="setup-onb-btn primary" type="button" onClick={() => setStep(Math.min(last, step + 1))}>
          {step === last ? 'FINISH' : 'CONTINUE'}
        </button>
      </footer>
    </div>
  );
}

/* ---------- page ---------- */

export default function GettingStarted() {
  return (
    <>
      <SEO
        title={PAGE_TITLES.gettingStarted}
        description="Install and set up OPS ROOM in four steps: download, first launch, first-run setup and your first flight."
        path="/getting-started"
      />

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">/ INSTALL & SETUP</span>
            <h1 className="section-title">Set up OPS ROOM in four steps.</h1>
            <p className="section-subtitle">
              The same screens you will see in the app, in order.
            </p>
          </div>
        </div>
      </section>

      {/* 1 download */}
      <section className="section" id="download">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">STEP 1 · DOWNLOAD</span>
            <h2 className="section-title">One installer, no admin rights.</h2>
          </div>
          <article className="setup-dl">
            <div className="setup-dl-head">
              <span className="tag"><span className="tag-dot" /> WINDOWS</span>
              <h3>OPS ROOM.exe</h3>
            </div>
            <p>
              Runs as a standard user, installs into your profile, and updates itself on startup.
              Grab it from the <Link to="/download">Downloads</Link> page.
            </p>
            <ul className="setup-dl-list">
              <li>SHA256-verified before install</li>
              <li>Installs WebView2 automatically if missing</li>
              <li>All data stays on your machine</li>
            </ul>
          </article>
        </div>
      </section>

      {/* 2 first launch */}
      <section className="section" id="first-launch">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">STEP 2 · FIRST LAUNCH</span>
            <h2 className="section-title">The host console opens.</h2>
            <p className="section-subtitle">
              One screen manages every connection. From here you also reach the app on a
              tablet, iPad or another computer on the same network.
            </p>
          </div>
          <div className="setup-shell"><HostConsole /></div>
        </div>
      </section>

      {/* 3 first-run setup */}
      <section className="section" id="setup">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">STEP 3 · FIRST-RUN SETUP</span>
            <h2 className="section-title">Six questions, one time.</h2>
            <p className="section-subtitle">
              On first launch the app walks you through setup one screen at a time. Try it:
              click through the same wizard below.
            </p>
          </div>
          <div className="setup-shell"><OnboardingWizard /></div>
        </div>
      </section>

      {/* 4 done */}
      <section className="section" id="done">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">STEP 4 · YOU'RE SET</span>
            <h2 className="section-title">Start MSFS and fly.</h2>
            <p className="section-subtitle">
              Load into a flight and the Status Board lights up green on its own:
              telemetry, FIDS and the Live Map.
            </p>
          </div>
          <div className="setup-done">
            <span className="setup-done-pill"><i />TELEMETRY 24 HZ</span>
            <p>
              From here, the full workflow lives in the{' '}
              <Link to="/documentation#first-flight">first flight walkthrough</Link>. Stuck at any
              point? <Link to="/support">Support</Link> or{' '}
              <a href="https://discord.gg/Dv6fNAjhAt" target="_blank" rel="noopener noreferrer">Discord</a>.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
