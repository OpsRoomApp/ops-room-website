import SEO from '../components/SEO.jsx';
import { PAGE_TITLES } from '../config/seo.js';

const GUIDES = [
  {
    id: 'install',
    eyebrow: 'GUIDE / 01',
    title: 'Install OPS ROOM',
    summary: 'From the installer on disk to a running OPS ROOM with MSFS connected.',
    steps: [
      {
        h: 'Step 0 · Verify the box can run it',
        body: 'OPS ROOM is built for Windows 10 (1909+) and Windows 11. You need at least 4 GB of free RAM and 350 MB of disk space for the install, more for Black Box recordings. Microsoft Flight Simulator 2020 or 2024 must be installed before launch. Administrator rights are not required for the portable build.',
      },
      {
        h: 'Step 1 · Download the installer',
        body: 'Grab the build from the Downloads page. The installer file is a single OPS ROOM.exe; the portable build is a .zip. Pick the installer if you can, the portable build if your work account does not allow admin elevation.',
      },
      {
        h: 'Step 2 · Install (or unzip)',
        body: 'Run the installer as a standard user. Default install location is in your user profile, not in Program Files, so no admin elevation is needed. For the portable build, unzip anywhere you can write to and double click OPS ROOM.exe.',
      },
      {
        h: 'Step 3 · First launch',
        body: 'The first launch creates a local data directory under your user profile and proposes the install of Microsoft WebView2 if not already on the box. Sit through the prompts; they only run once.',
      },
      {
        h: 'Step 4 · Open Settings and put in your identifiers',
        body: 'From the OPS ROOM sidebar, open Settings and fill in your SimBrief Pilot ID, your VATSIM credentials (if you fly on the network) and your Hoppie logon code. Each value is stored locally; nothing is sent to a third party.',
      },
      {
        h: 'Step 5 · Start MSFS and verify telemetry',
        body: 'Launch Microsoft Flight Simulator and load into a flight. OPS ROOM auto-detects the running simulator and reports telemetry state in the Status Board module. A green TELEMETRY 24 Hz indicator means everything is wired up.',
      },
    ],
  },
  {
    id: 'first-flight',
    eyebrow: 'GUIDE / 02',
    title: 'Your first flight',
    summary: 'A pre-flight to debrief walkthrough using the OPS ROOM workflow.',
    steps: [
      {
        h: 'Step 1 · Import your OFP',
        body: 'Open Dispatch and click LATEST OFP. OPS ROOM will pull the most recent SimBrief plan for the identifier stored in Settings. The plan populates Briefing, Fuel Watch and the Kneeboard at once.',
      },
      {
        h: 'Step 2 · Sign the briefing',
        body: 'In Briefing, review the route, weather pack, charts and alternate. Click SIGN BRIEFING. The dispatch record is locked; downstream modules operate against a stable plan and cannot drift.',
      },
      {
        h: 'Step 3 · Walk through GSX ground services',
        body: 'Open Ground Control. The GSX Pro menu integration is driven by OPS ROOM; toggle boarding, fueling and pushback and the timestamps are logged against your dispatch ETD.',
      },
      {
        h: 'Step 4 · Engine start, pushback, taxi',
        body: 'Watch Flight Watch react to phase changes live. The status pill flips from STD to TAXOUT to RWY at the right moments without manual input. The Black Box is already recording.',
      },
      {
        h: 'Step 5 · Taxi, takeoff, climb',
        body: 'Runway Awareness will give you aural cues if you cross a hold-short without clearance. Dat streams uplink messages over Hoppie. Black Box captures every parameter at 24 Hz.',
      },
      {
        h: 'Step 6 · Cruise and descent',
        body: 'Flight Watch continues to compare planned vs. actual fuel burn. The Live Map shows your ownship, surrounding traffic and the route over navaids. CPDLC Datalink exchanges messages with ATC via Hoppie.',
      },
      {
        h: 'Step 7 · Landing',
        body: 'On touchdown, Flight Analysis grades vertical speed, G-force, centreline deviation and stabilised gate 1000. The logbook entry is finalised automatically with a hash and route.',
      },
      {
        h: 'Step 8 · Debrief',
        body: 'Open Black Box → Replay and scrub the captured flight. Hard-landing markers and overspeed flags drop onto the timeline at the exact sample they occurred. Export the .opsroom bundle for future reference.',
      },
    ],
  },
  {
    id: 'aircraft',
    eyebrow: 'GUIDE / 03',
    title: 'Aircraft setup',
    summary: 'Per-aircraft adapter hooks in OPS ROOM. Native for the four used in production, generic SimConnect for everything else.',
    steps: [
      {
        h: 'Fenix A320',
        body: 'FSUIPC 7 or 8 with the Fenix adapter enabled. Sidestick, rudder pedals, FCU and MCP bindings are exposed at 24 Hz. Telemetry export must be enabled in the Fenix configuration page.',
      },
      {
        h: 'PMDG 737 / 777',
        body: 'FSUIPC 7 or 8 with the PMDG adapter. Full MCP, EFIS, yoke and tiller bindings. The 777 SDK has its own EULA acceptance; you must opt in once before the adapter activates.',
      },
      {
        h: 'iniBuilds A300 / A320',
        body: 'FCU, MCP and fly-by-wire bindings via FSUIPC. No additional licence step required.',
      },
      {
        h: 'FBW A320',
        body: 'FCU, MCP, sidestick bindings via FSUIPC. The FBW community fork is fully supported.',
      },
      {
        h: 'Generic (any MSFS aircraft)',
        body: 'SimConnect basics always work; you give up the per-aircraft MCP / sidestick bindings but keep position, attitude, airspeed, vertical speed, heading, altitude and fuel state.',
      },
    ],
  },
  {
    id: 'integrations',
    eyebrow: 'GUIDE / 04',
    title: 'Integrations',
    summary: 'Each integration is opt-in. Tokens live in your local OPS ROOM profile.',
    steps: [
      {
        h: 'VATSIM',
        body: 'Put your VATSIM CID and password in Settings. The FIDS module, the Map traffic overlay and the Phase tracker all read from the same VTAB feed.',
      },
      {
        h: 'SimBrief',
        body: 'Put your Pilot ID in Settings. The Dispatch module auto-fetches the latest OFP. Briefing parses both HTML and text OFP variants.',
      },
      {
        h: 'GSX Pro',
        body: 'GSX Pro must be running on the same box. OPS ROOM drives menu actions via its COM bridge. No login steps.',
      },
      {
        h: 'Hoppie CPDLC',
        body: 'Put your Hoppie logon code in Settings. CPDLC Datalink opens the ACARS session as soon as you connect on a Hoppie-compatible callsign.',
      },
      {
        h: 'ChartFox',
        body: 'Opt in from Briefing → Charts → CONNECT. The OAuth dialog uses PKCE on a public client; the refresh token stays in your local profile. The Diagnostics endpoint in Settings exposes connection state for debugging.',
      },
      {
        h: 'Navigraph',
        body: 'Drop your Navigraph data into the OPS ROOM charts directory. OPS ROOM picks them up automatically when charts are needed.',
      },
    ],
  },
  {
    id: 'charts',
    eyebrow: 'GUIDE / 05',
    title: 'Charts & procedures',
    summary: 'How OPS ROOM serves charts and indexed procedures.',
    steps: [
      {
        h: 'Inside Briefing',
        body: 'Charts are grouped by ICAO. Click any airport to expand SID / STAR / APPROACH / AIRPORT GROUND categories. Each chart opens in the local PDF viewer inside OPS ROOM with zoom, pan, rotate and page navigation.',
      },
      {
        h: 'Procedures',
        body: 'The Procedures module reads an indexed copy of your airline SOP pack. Pick the active aircraft and the right checklist appears, with non-normal condition branches.',
      },
    ],
  },
  {
    id: 'troubleshoot',
    eyebrow: 'GUIDE / 06',
    title: 'Troubleshooting',
    summary: 'Quickest paths to a working OPS ROOM when something is off.',
    steps: [
      {
        h: 'Simulator not detected',
        body: 'Confirm FSUIPC 7 or 8 is installed and recognised in your Sim folder. Run OPS ROOM after the simulator is in a flight; the Status Board module tells you exactly what telemetry layer is alive.',
      },
      {
        h: 'Telemetry at single-digit Hz',
        body: 'OPS ROOM prefers exclusive FSUIPC access. Close other tools that share the offset table. The Status Board will reflect the negotiated rate.',
      },
      {
        h: 'Fenix adapter silent',
        body: 'Inside Fenix configuration, telemetry export must be on. Restart OPS ROOM after changing Fenix settings.',
      },
      {
        h: 'ChartFox charts missing',
        body: 'Open Briefing → Charts and confirm the integration is connected. If a sub-scope is missing under Settings → Diagnostics / ChartFox, reconnect with the missing scope and the affected charts will re-sync on the next request.',
      },
      {
        h: 'CPDLC logon failing',
        body: 'Hoppie logon codes rotate; put the current one in Settings. The Datalink module surfaces the raw failure with the upstream return code.',
      },
    ],
  },
];

export default function Documentation() {
  return (
    <>
      <SEO
        title={PAGE_TITLES.documentation}
        description="OPS ROOM installation guide, first flight walkthrough, aircraft setup, integrations, charts, procedures and troubleshooting."
        path="/documentation"
      />

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">/ DOCUMENTATION</span>
            <h1 className="section-title">Guides.</h1>
            <p className="section-subtitle">
              Six field-tested guides. Pick the one that matches the question you are
              trying to answer right now. System requirements are folded into the
              install guide at Step 0.
            </p>
          </div>

          <nav className="docs-toc" aria-label="Guide index">
            {GUIDES.map((g) => (
              <a key={g.id} href={`#${g.id}`} className="docs-toc-link">
                <span className="docs-toc-eyebrow">{g.eyebrow}</span>
                <span className="docs-toc-title">{g.title}</span>
              </a>
            ))}
          </nav>
        </div>
      </section>

      {GUIDES.map((g) => (
        <section key={g.id} className="section" id={g.id}>
          <div className="container">
            <div className="section-head">
              <span className="section-eyebrow">{g.eyebrow}</span>
              <h2 className="section-title">{g.title}</h2>
              <p className="section-subtitle">{g.summary}</p>
            </div>

            <div className="guide-steps">
              {g.steps.map((s, i) => (
                <article key={i} className="guide-step">
                  <h3>{s.h}</h3>
                  <p>{s.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      ))}
    </>
  );
}
