import SEO from '../components/SEO.jsx';
import { PAGE_TITLES } from '../config/seo.js';

export default function Support() {
  const tiles = [
    {
      title: 'Email Support',
      lbl: 'SUPPORT',
      val: 'support@opsroom.live',
      desc: 'Response typical within 24 hours for installer, telemetry, or adapter issues.',
    },
    {
      title: 'Community',
      lbl: 'DISCORD',
      val: 'discord.gg/opsroom',
      desc: 'Real-time help from other OPS ROOM operators. Bug reports welcome.',
    },
    {
      title: 'Documentation',
      lbl: 'DOCS',
      val: '/documentation',
      desc: 'Installation, aircraft adapters, integrations, troubleshooting.',
    },
    {
      title: 'Service Status',
      lbl: 'STATUS',
      val: 'operational',
      desc: 'Release channel, telemetry fallback indicators, and known issues.',
    },
  ];
  return (
    <>
      <SEO title={PAGE_TITLES.contact} description="OPS ROOM support: email, community, documentation, service status." path="/support" />

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">/ SUPPORT</span>
            <h1 className="section-title">Get help with OPS ROOM.</h1>
            <p className="section-subtitle">
              Open a ticket, talk to other operators, or check the documentation first.
              Service status is published when telemetry fallbacks are activated.
            </p>
          </div>

          <div className="status-row" style={{ marginBottom: '1.5rem' }}>
            <span className="ok-dot" />
            <span>CHANNEL: STABLE</span>
            <span className="note">·</span>
            <span className="ok-dot" />
            <span>SERVICE: OPERATIONAL</span>
          </div>

          <div className="support-grid">
            {tiles.map((t) => (
              <div key={t.title} className="support-tile">
                <h3>{t.title}</h3>
                <p>{t.desc}</p>
                <span className="lbl">{t.lbl}</span><br />
                <span className="val">{t.val}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
