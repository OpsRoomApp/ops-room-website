import SEO from '../components/SEO.jsx';

export default function Privacy() {
  return (
    <>
      <SEO title="Privacy Policy: OPS ROOM" description="OPS ROOM privacy policy - what the desktop app and website collect, store, and transmit, and the rights you have over your data." path="/privacy" />

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">/ LEGAL</span>
            <h1 className="section-title">Privacy Policy</h1>
            <p className="section-subtitle">Last updated: August 2026</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            <div className="doc-section">
              <h2>1. Who we are</h2>
              <p>
                This policy explains how OPS ROOM ("we", "us", "our") collects, uses, stores and protects
                information when you use the OPS ROOM desktop application ("the app") or the public website
                at <code>opsroom.live</code> ("the website"). We are the data controller for the purposes of
                the UK GDPR and the EU General Data Protection Regulation.
              </p>
              <p>
                Contact: <code>support@opsroom.live</code>. We will respond to privacy requests within
                30 days.
              </p>
            </div>

            <div className="doc-section">
              <h2>2. The short version</h2>
              <ul>
                <li>OPS ROOM is a <strong>local-first</strong> application. Your flight data, logbook,
                  recordings, and configuration live on your machine - not on our servers.</li>
                <li>We do not sell, rent or trade personal data. We do not run advertising.</li>
                <li>We collect only what is needed to run the service: bug reports you choose to send,
                  support messages you submit, and aggregated download statistics.</li>
                <li>Third-party integrations (VATSIM, SimBrief, Hoppie, and others) are all <strong>opt-in</strong>.</li>
              </ul>
            </div>

            <div className="doc-section">
              <h2>3. The desktop application</h2>
              <p>
                The app runs entirely on your Windows machine and reads simulator data directly from
                FSUIPC and SimConnect. <strong>Flight data, telemetry, logbook entries, Black Box
                recordings, and settings are stored locally</strong> in the OPS ROOM application data
                directory and are never uploaded automatically.
              </p>
              <p>
                Removing the application data folder (or uninstalling with the "remove data" option)
                deletes this local data. We do not keep a copy.
              </p>
            </div>

            <div className="doc-section">
              <h2>4. What the app transmits</h2>
              <h3 style={{ marginTop: '1rem' }}>4.1 Update checks</h3>
              <p>
                On startup, the app checks <code>opsroom.live/api/update.json</code> for a new version.
                This is a standard HTTP request that may expose your IP address to us (or to our hosting
                provider) and, if our server is unreachable, to GitHub as a fallback. No identifying
                information beyond the request itself is sent. Update checks can be disabled in Settings.
              </p>
              <h3 style={{ marginTop: '1rem' }}>4.2 Bug reports</h3>
              <p>
                When you voluntarily use the in-app "Report a bug" flow, the app sends the report text
                you provide and - if you choose to attach it - a diagnostics archive to our server
                (<code>admin.opsroom.live</code>). The diagnostics archive may contain versions, module
                names, installed add-ons, and configuration excerpts needed to diagnose the issue. It is
                stored for the purpose of fixing bugs and is not used for any other purpose.
              </p>
              <h3 style={{ marginTop: '1rem' }}>4.3 Community flight feed</h3>
              <p>
                If you connect your Discord account and enable public flight sharing, limited live flight
                information (callsign, position, route, aircraft, phase) is published to the public
                community feed on the website. This is <strong>opt-in and off by default</strong>. You can
                set your visibility to private at any time, which stops new data from being published;
                previously published live data expires automatically when the flight ends.
              </p>
              <h3 style={{ marginTop: '1rem' }}>4.4 Integrations</h3>
              <p>
                Each integration below is opt-in and disabled until you configure it:
              </p>
              <ul>
                <li><strong>VATSIM</strong> - the app reads public VATSIM traffic data for the FIDS and
                  Live Map modules. When you fly on VATSIM, your simulator connects directly to the
                  VATSIM network; OPS ROOM does not transmit your position to VATSIM itself.</li>
                <li><strong>SimBrief</strong> - the app fetches your flight plan, weather, and NOTAMs
                  from SimBrief using the pilot ID or username you provide. Credentials are stored
                  locally, not on our servers.</li>
                <li><strong>Hoppie CPDLC</strong> - CPDLC messages are routed through the Hoppie ACARS
                  network using your logon code.</li>
                <li><strong>ChartFox / Navigraph</strong> - if connected, the app fetches charts from
                  these services using OAuth. Credentials are never stored by OPS ROOM.</li>
                <li><strong>GSX Pro, FSUIPC, SimConnect, MSFS</strong> - all local, no data leaves your
                  machine.</li>
              </ul>
            </div>

            <div className="doc-section">
              <h2>5. The website</h2>
              <p>
                The public website at <code>opsroom.live</code> is a static site. It uses
                <strong> no tracking cookies, no advertising, and no analytics scripts</strong>.
                It loads the Google Fonts stylesheet and map tiles from third-party CDNs; those services
                may log standard request data (including your IP address) under their own privacy
                policies.
              </p>
              <h3 style={{ marginTop: '1rem' }}>5.1 Support form</h3>
              <p>
                The /support form collects your <strong>name, email address, subject and message</strong>.
                We use this only to respond to your enquiry. Messages are stored in a protected database,
                reviewed by our team, and retained while the enquiry is being handled (typically up to
                12 months after it is closed). We will never use your email for marketing unless you
                separately opt in.
              </p>
              <h3 style={{ marginTop: '1rem' }}>5.2 Download statistics</h3>
              <p>
                We collect aggregate download counts to understand which versions are in use. IP
                addresses are hashed with a server-side secret before storage and are never published
                or used to identify individuals.
              </p>
            </div>

            <div className="doc-section">
              <h2>6. Cookies</h2>
              <p>
                The public website sets <strong>no cookies</strong>. The admin panel (a separate,
                access-controlled tool at <code>admin.opsroom.live</code>) uses a session cookie after
                you sign in with GitHub or Discord OAuth; it is strictly necessary for authentication
                and is limited to that subdomain.
              </p>
            </div>

            <div className="doc-section">
              <h2>7. Legal bases</h2>
              <p>We process personal data under the following lawful bases:</p>
              <ul>
                <li><strong>Contract / service provision</strong> - operating the services you use
                  (update checks, bug reports, support, community feed).</li>
                <li><strong>Legitimate interest</strong> - security, abuse prevention, and keeping
                  service statistics. We balance these against your rights and minimise what we keep.</li>
                <li><strong>Consent</strong> - for anything that is not strictly necessary, such as
                  public flight sharing.</li>
              </ul>
            </div>

            <div className="doc-section">
              <h2>8. Data retention</h2>
              <ul>
                <li>Bug reports and support messages: retained while being worked on, then for up to
                  12 months after closure.</li>
                <li>Community feed data: live only; expires when the flight ends.</li>
                <li>Download analytics: aggregated and retained for 90 days.</li>
                <li>Local app data: retained on your machine until you delete it.</li>
              </ul>
            </div>

            <div className="doc-section">
              <h2>9. Your rights</h2>
              <p>You have the right to:</p>
              <ul>
                <li><strong>Access</strong> - ask for a copy of the personal data we hold about you.</li>
                <li><strong>Rectification</strong> - correct inaccurate data.</li>
                <li><strong>Erasure</strong> - ask us to delete your data, subject to legal or
                  security retention requirements.</li>
                <li><strong>Restrict or object</strong> - limit how we process your data.</li>
                <li><strong>Portability</strong> - receive your data in a machine-readable form.</li>
                <li><strong>Withdraw consent</strong> - at any time, for consent-based processing such
                  as public flight sharing.</li>
              </ul>
              <p>
                To exercise any of these rights, email <code>support@opsroom.live</code> with the
                subject line "Privacy request". We verify the requester's identity before acting and
                respond within 30 days. You may also lodge a complaint with your local data protection
                authority (in the UK, the Information Commissioner's Office).
              </p>
            </div>

            <div className="doc-section">
              <h2>10. Security</h2>
              <p>
                Server-side data (bug reports, support messages) is stored on protected infrastructure,
                access-controlled to the operations team, and transmitted only over TLS. We apply
                rate limiting and abuse protections to public endpoints. No system is completely
                secure, but we follow reasonable industry practices.
              </p>
            </div>

            <div className="doc-section">
              <h2>11. Changes to this policy</h2>
              <p>
                We may update this policy as the service evolves. Material changes will be noted on
                this page with an updated date, and where required, surfaced in the app.
              </p>
            </div>

            <div className="doc-section">
              <h2>12. Contact</h2>
              <p>
                Questions about this policy: <code>support@opsroom.live</code>, subject line
                "Privacy request".
              </p>
            </div>

          </div>
        </div>
      </section>
    </>
  );
}
