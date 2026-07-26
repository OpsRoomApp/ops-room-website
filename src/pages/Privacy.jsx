import SEO from '../components/SEO.jsx';

export default function Privacy() {
  return (
    <>
      <SEO title="Privacy Policy: OPS ROOM" description="OPS ROOM privacy policy. Local-first architecture. No telemetry leaves your machine without opt-in." path="/privacy" />

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">/ LEGAL</span>
            <h1 className="section-title">Privacy Policy</h1>
            <p className="section-subtitle">Last updated: July 2026</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            <div className="doc-section">
              <h2>Summary</h2>
              <p>OPS ROOM is a <strong>local-first desktop application</strong>. It does not send telemetry, usage data, or personal information to any server unless you explicitly opt into specific integrations.</p>
              <p>No account is required. No analytics are collected by default. The application runs entirely on your Windows machine.</p>
            </div>

            <div className="doc-section">
              <h2>What OPS ROOM does NOT collect</h2>
              <ul>
                <li>Flight data or telemetry</li>
                <li>Simulator usage patterns</li>
                <li>Hardware information</li>
                <li>IP address or location</li>
                <li>Keyboard, mouse, or controller input</li>
                <li>Any information about other software on your system</li>
              </ul>
            </div>

            <div className="doc-section">
              <h2>Opt-in integrations that transmit data</h2>
              <p>OPS ROOM can connect to third-party services. Each one is <strong>opt-in</strong> and disabled by default. Data is only sent when you choose to enable the integration:</p>
              <ul>
                <li><strong>VATSIM</strong> — Your simulator sends position data to the VATSIM network when you connect. OPS ROOM reads VATSIM traffic data for the FIDS and Live Map modules. No data is sent to VATSIM by OPS ROOM itself.</li>
                <li><strong>SimBrief</strong> — OPS ROOM fetches your OFP, weather, and NOTAMs from SimBrief using your SimBrief username or pilot ID. No flight data is sent back.</li>
                <li><strong>Hoppie CPDLC</strong> — CPDLC messages are routed through the Hoppie ACARS network using your Hoppie logon code. Message content is determined by your simulator and the ATC network.</li>
                <li><strong>GSX Pro</strong> — OPS ROOM controls GSX ground services locally through the GSX menu system. No data leaves your machine.</li>
                <li><strong>ChartFox</strong> — If you connect a ChartFox account, OPS ROOM authenticates via OAuth and fetches chart PDFs for display. Your ChartFox credentials are never stored by OPS ROOM.</li>
                <li><strong>Navigraph</strong> — If you connect a Navigraph account, OPS ROOM fetches Jeppesen charts for display. Your Navigraph credentials are never stored by OPS ROOM.</li>
              </ul>
            </div>

            <div className="doc-section">
              <h2>Update checks</h2>
              <p>OPS ROOM checks <code>opsroom.live/api/update.json</code> for new versions. This is a standard HTTP GET request. No identifying information is sent. If opsroom.live is unreachable, it falls back to the GitHub releases manifest.</p>
              <p>You can disable update checks in Settings.</p>
            </div>

            <div className="doc-section">
              <h2>opsroom.live website</h2>
              <p>The public website at opsroom.live uses no tracking cookies, no analytics scripts, and no third-party embeds beyond Google Fonts (which may log font requests per their own privacy policy).</p>
              <p>No user accounts exist on the public website.</p>
            </div>

            <div className="doc-section">
              <h2>Data storage</h2>
              <p>All OPS ROOM data (flight records, logbook, Black Box recordings, configuration) is stored locally on your machine in the OPS ROOM application data directory. No data is synced to any cloud service.</p>
              <p>You can delete all OPS ROOM data by removing the application data folder. The installer provides an option to remove this during uninstallation.</p>
            </div>

            <div className="doc-section">
              <h2>Contact</h2>
              <p>Questions about this policy: <code>support@opsroom.live</code></p>
            </div>

          </div>
        </div>
      </section>
    </>
  );
}
