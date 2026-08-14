import { useState } from 'react';
import SEO from '../components/SEO.jsx';
import { PAGE_TITLES } from '../config/seo.js';

const DISCORD_INVITE = 'https://discord.gg/Dv6fNAjhAt';

const TILES = [
  {
    title: 'Email Support',
    lbl: 'SUPPORT',
    val: 'support@opsroom.live',
    desc: 'Response typical within 24 hours for installer, telemetry, or adapter issues.',
  },
  {
    title: 'Documentation',
    lbl: 'DOCS',
    val: '/documentation',
    desc: 'Installation, aircraft adapters, integrations, troubleshooting.',
    link: '/documentation',
  },
];

export default function Support() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null); // { ok, message } | null

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    setStatus(null);
    try {
      const resp = await fetch('/api/v1/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.ok !== true) {
        setStatus({ ok: false, message: data?.error || `Request failed (HTTP ${resp.status}).` });
      } else {
        setStatus({ ok: true, message: 'Message sent. We will get back to you at the email you provided.' });
        setForm({ name: '', email: '', subject: '', message: '' });
      }
    } catch (err) {
      setStatus({ ok: false, message: 'Could not reach the support service. Try again shortly, or email support@opsroom.live.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <SEO title={PAGE_TITLES.contact} description="OPS ROOM support: submit a message, join the Discord community, or check the documentation." path="/support" />

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">/ SUPPORT</span>
            <h1 className="section-title">Get help with OPS ROOM.</h1>
            <p className="section-subtitle">
              Submit a support message, ask the community on Discord, or check the documentation first.
            </p>
          </div>

          <div className="support-grid" style={{ marginBottom: '1.5rem' }}>
            {TILES.map((t) => (
              <div key={t.title} className="support-tile">
                <h3>{t.title}</h3>
                <p>{t.desc}</p>
                <span className="lbl">{t.lbl}</span><br />
                {t.link ? (
                  <a className="val" href={t.link}>{t.val}</a>
                ) : (
                  <a className="val" href={`mailto:${t.val}`}>{t.val}</a>
                )}
              </div>
            ))}
            <div className="support-tile">
              <h3>Community</h3>
              <p>Real-time help from other OPS ROOM operators. Bug reports welcome.</p>
              <a className="btn btn-primary" href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer">
                Join the Discord
              </a>
            </div>
          </div>

          <div className="doc-section" style={{ maxWidth: '720px' }}>
            <h2>Send us a message</h2>
            <p>
              For anything that does not belong on a public Discord thread - installer or licensing
              issues, adapter problems, or private questions - use the form below. It lands directly
              in the OPS ROOM support inbox.
            </p>

            {status && (
              <div
                style={{
                  padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.85rem',
                  border: `1px solid ${status.ok ? 'var(--nominal)' : 'var(--alert)'}`,
                  color: status.ok ? 'var(--nominal)' : 'var(--alert)',
                  background: status.ok ? 'rgba(0,229,255,0.04)' : 'rgba(255,23,68,0.05)',
                }}
              >
                {status.message}
              </div>
            )}

            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.9rem' }}>
                <div>
                  <label className="form-label" htmlFor="sup-name" style={{ display: 'block', marginBottom: '0.3rem', fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-muted)' }}>
                    Name
                  </label>
                  <input
                    id="sup-name" type="text" value={form.name} onChange={update('name')} required
                    placeholder="Your name or VATSIM callsign"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="sup-email" style={{ display: 'block', marginBottom: '0.3rem', fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-muted)' }}>
                    Email
                  </label>
                  <input
                    id="sup-email" type="email" value={form.email} onChange={update('email')} required
                    placeholder="you@example.com"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              <div>
                <label className="form-label" htmlFor="sup-subject" style={{ display: 'block', marginBottom: '0.3rem', fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-muted)' }}>
                  Subject
                </label>
                <input
                  id="sup-subject" type="text" value={form.subject} onChange={update('subject')} required
                  placeholder="Brief summary of your issue"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="sup-message" style={{ display: 'block', marginBottom: '0.3rem', fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-muted)' }}>
                  Message
                </label>
                <textarea
                  id="sup-message" rows={6} value={form.message} onChange={update('message')} required
                  placeholder="Describe the issue, what you expected, and what you tried."
                  style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button className="btn btn-primary" type="submit" disabled={sending}>
                  {sending ? 'Sending…' : 'Send message'}
                </button>
                <span className="mono" style={{ color: 'var(--fg-muted)', fontSize: '0.75rem' }}>
                  Usually answered within 24 hours.
                </span>
              </div>
            </form>
          </div>
        </div>
      </section>
    </>
  );
}
