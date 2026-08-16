import { Link } from 'react-router-dom';
import SEO from '../components/SEO.jsx';
import { PAGE_TITLES } from '../config/seo.js';

const FAQS = [
  {
    q: 'Do I need FSUIPC to run OPS ROOM?',
    a: 'FSUIPC 7 or 8 is required for telemetry and aircraft data. OPS ROOM reads FSUIPC offsets at up to 60 Hz. SimConnect is available as a fallback for basic data, but FSUIPC provides the full feature set including Fenix, PMDG, iniBuilds, and FBW aircraft bindings.'
  },
  {
    q: 'Which aircraft are supported?',
    a: 'Fenix A320, PMDG 737 / 777, iniBuilds A300 / A320neo / A330 / A350, FlyByWire A32NX, Headwind A330-900, and any default MSFS aircraft. Each aircraft has a custom adapter that maps sim variables to OPS ROOM telemetry channels.'
  },
  {
    q: 'Does OPS ROOM work on Xbox or cloud streaming?',
    a: 'No. OPS ROOM is a Windows desktop application that requires FSUIPC or SimConnect running on the same machine as Microsoft Flight Simulator. Xbox, cloud streaming, and remote installations are not supported.'
  },
  {
    q: 'Why does Windows Defender flag the installer?',
    a: 'OPS ROOM is built with PyInstaller, which bundles a Python interpreter and dependencies into a single executable. This is a known false positive common to PyInstaller-packaged applications. The source code is public on GitHub. Submit the file to Microsoft for analysis if you prefer, or use the portable build which does not require installation.'
  },
  {
    q: 'How do I connect SimBrief?',
    a: 'Go to Settings > Integrations > SimBrief and enter your SimBrief username or numeric pilot ID. OPS ROOM will fetch your latest OFP, weather, and NOTAMs. You can also import a specific flight by OFP ID from the Dispatch module.'
  },
  {
    q: 'How does the Black Box recorder work?',
    a: 'The Black Box continuously records telemetry at the configured sample rate. Recordings are stored as local SQLite databases. You can replay any recorded flight from the Flight Analysis module with a scrubbable timeline. Black Box data is never uploaded anywhere.'
  },
  {
    q: 'Can I use OPS ROOM without VATSIM?',
    a: 'Yes. VATSIM integration is optional. The FIDS module shows VATSIM traffic when connected, but every other module works independently of any online network. The Live Map module shows your ownship position regardless of VATSIM connection.'
  },
  {
    q: 'Does OPS ROOM require an internet connection?',
    a: 'An internet connection is needed for SimBrief fetching, ChartFox/Navigraph charts, VATSIM data, CPDLC, and update checks. Core telemetry, Black Box recording, logbook, and analysis work fully offline. You can disable online features in Settings.'
  },
  {
    q: 'How do I update OPS ROOM?',
    a: 'OPS ROOM checks opsroom.live for new versions on startup. When an update is available, you will see a notification in the status bar. Download the new installer or portable ZIP from the Download page. The updater validates SHA256 checksums before installing.'
  },
  {
    q: 'Where are my flight records stored?',
    a: 'All data is stored locally in the OPS ROOM application data folder: %APPDATA%/OPS ROOM/. This includes flight recordings, logbook entries, PIREPs, financial data, configuration, and cached charts. Nothing is synced to any cloud service.'
  },
  {
    q: 'How do I report a bug?',
    a: 'Join our Discord server or email support@opsroom.live. Include your OPS ROOM version, aircraft, simulator version, FSUIPC version, and a description of the issue. Log files from the app data folder are helpful for diagnostics.'
  },
  {
    q: 'How do I get a flight recorder and landing replay in MSFS?',
    a: 'MSFS has no built-in flight replay tool, so the common solution is a third-party flight recorder. OPS ROOM Black Box continuously records every flight as a local SQLite database and replays it in the Flight Analysis module with a scrubbable timeline, landing analysis, G-loading and CSV, GPX and KML export. It works with MSFS 2020 and MSFS 2024.'
  },
  {
    q: 'Is there a free MSFS flight tracker?',
    a: 'Yes. OPS ROOM is free during public beta and tracks every flight automatically through the Black Box recorder. Your flights appear on the community Live Map and leaderboard if you opt into public visibility, with flight hours, landing rate and best landing tracked across pilots.'
  },
  {
    q: 'How do I get a dispatch OFP in Microsoft Flight Simulator?',
    a: 'OPS ROOM Dispatch pulls your latest OFP from SimBrief, then scores routes against your aircraft type and ATC, cross-checks fuel and alternates, and gives you a signed loadsheet workflow before departure. The briefing module renders the full OFP with charts, weather, METAR and TAF in one signed view.'
  },
  {
    q: 'What is the best MSFS 2024 EFB app?',
    a: 'For a full cockpit ops suite, OPS ROOM runs as a native app inside the MSFS 2024 EFB and as a toolbar panel in both MSFS 2020 and 2024. It covers dispatch, FIDS, Black Box, RAAS, announcements and GSX automation. See the best MSFS 2024 EFB apps guide on this site for a comparison with Navigraph, Sky4Sim and the others.'
  },
  {
    q: 'Is OPS ROOM free?',
    a: 'OPS ROOM is currently available as a free public release. Future licensing is under consideration. All current features will remain available to existing users.'
  }
];

export default function FAQ() {
  return (
    <>
      <SEO title={PAGE_TITLES.faq} description="Frequently asked questions about OPS ROOM. Installation, aircraft support, integrations, Black Box, and troubleshooting." path="/faq" />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: FAQS.map((item) => ({
              '@type': 'Question',
              name: item.q,
              acceptedAnswer: { '@type': 'Answer', text: item.a },
            })),
          }),
        }}
      />

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">/ FAQ</span>
            <h1 className="section-title">Frequently asked questions.</h1>
            <p className="section-subtitle">
              Common questions from OPS ROOM operators. If you do not find what you need here, check the <Link to="/documentation">Documentation</Link> or join the <a href="https://discord.gg/Dv6fNAjhAt" target="_blank" rel="noopener noreferrer">Discord</a>.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {FAQS.map((item, i) => (
              <details key={i} className="doc-section" style={{ marginBottom: '0', borderBottom: i < FAQS.length - 1 ? 'none' : undefined }}>
                <summary style={{ cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '13px', letterSpacing: '0.06em', color: 'var(--fg)', padding: '0.25rem 0' }}>
                  {item.q}
                </summary>
                <p style={{ marginTop: '0.75rem', color: 'var(--fg-soft)', lineHeight: 1.6 }}>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
