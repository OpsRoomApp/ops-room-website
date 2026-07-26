import { Link } from 'react-router-dom';
import SEO from '../components/SEO.jsx';

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
    q: 'Is OPS ROOM free?',
    a: 'OPS ROOM is currently available as a free public release. Future licensing is under consideration. All current features will remain available to existing users.'
  }
];

export default function FAQ() {
  return (
    <>
      <SEO title="FAQ: OPS ROOM" description="Frequently asked questions about OPS ROOM. Installation, aircraft support, integrations, Black Box, and troubleshooting." path="/faq" />

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
