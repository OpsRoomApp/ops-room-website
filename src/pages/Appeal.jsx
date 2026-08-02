import { useState } from 'react';
import SEO from '../components/SEO.jsx';

const ACTION_TYPES = [
  { value: '', label: 'Unknown / Other' },
  { value: 'ban', label: 'Ban' },
  { value: 'timeout', label: 'Timeout' },
  { value: 'mute', label: 'Mute' },
  { value: 'warn', label: 'Warning' },
];

export default function Appeal() {
  const [form, setForm] = useState({ identity: '', action_type: '', statement: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { ok, message }
  const [serverError, setServerError] = useState('');

  const validate = () => {
    const next = {};
    if (!form.identity.trim()) next.identity = 'Please provide your Discord username or user ID.';
    if (form.statement.trim().length < 10) next.statement = 'Please describe your situation (minimum 10 characters).';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');
    if (!validate()) return;
    setSubmitting(true);
    try {
      const isId = /^\d{15,20}$/.test(form.identity.trim());
      const payload = {
        user_id: isId ? form.identity.trim() : null,
        username: isId ? '' : form.identity.trim(),
        action_type: form.action_type,
        statement: form.statement.trim(),
      };
      const resp = await fetch('/api/v1/appeals/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setServerError(body.detail || `Submission failed (HTTP ${resp.status}). Please try again later.`);
        return;
      }
      setResult(body);
    } catch {
      setServerError('Network error while submitting. Please try again later.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = {
    width: '100%', fontFamily: 'var(--font-mono)', fontSize: '14px', padding: '0.55rem 0.7rem',
    background: 'var(--bg-inset, rgba(255,255,255,0.03))', border: '1px solid var(--line-strong)',
    color: 'var(--fg)', borderRadius: '6px', letterSpacing: '0.03em',
  };

  return (
    <>
      <SEO title="Appeal a Moderation Action" description="Submit an appeal if you believe a moderation action was applied in error." path="/appeal" />

      <section className="section">
        <div className="container" style={{ maxWidth: '720px' }}>
          <div className="section-head">
            <span className="section-eyebrow">/ APPEAL</span>
            <h1 className="section-title">Appeal a moderation action.</h1>
            <p className="section-subtitle">
              If you believe a warning, timeout, mute, or ban was applied in error, submit an appeal
              here. Our moderation team reviews every submission. Please include enough detail for us
              to investigate.
            </p>
          </div>

          {result?.ok ? (
            <div style={{
              padding: '1.5rem', background: 'rgba(0,200,83,0.06)', border: '1px solid rgba(0,200,83,0.3)',
              borderRadius: '8px', color: 'var(--fg)',
            }}>
              <b>Appeal submitted.</b>
              <p style={{ marginTop: '0.5rem', color: 'var(--fg-soft)', fontSize: '13px' }}>
                {result.message || 'Staff will review it shortly. You will be contacted via Discord if more information is needed.'}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {serverError && (
                <div style={{ padding: '0.9rem 1rem', background: 'rgba(255,59,48,0.07)', border: '1px solid rgba(255,59,48,0.35)', borderRadius: '6px', color: '#ff8a80', fontSize: '13px' }}>
                  {serverError}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.08em', color: 'var(--fg-muted)', textTransform: 'uppercase' }}>
                  Discord username or user ID
                </label>
                <input
                  style={inputStyle}
                  value={form.identity}
                  onChange={(e) => setForm({ ...form, identity: e.target.value })}
                  placeholder="e.g. pilot1234 or 123456789012345678"
                />
                {errors.identity && <span style={{ color: '#ff8a80', fontSize: '12px' }}>{errors.identity}</span>}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.08em', color: 'var(--fg-muted)', textTransform: 'uppercase' }}>
                  Action being appealed (if known)
                </label>
                <select
                  style={inputStyle}
                  value={form.action_type}
                  onChange={(e) => setForm({ ...form, action_type: e.target.value })}
                >
                  {ACTION_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.08em', color: 'var(--fg-muted)', textTransform: 'uppercase' }}>
                  Your statement
                </label>
                <textarea
                  style={{ ...inputStyle, minHeight: '140px', resize: 'vertical', lineHeight: 1.5 }}
                  value={form.statement}
                  onChange={(e) => setForm({ ...form, statement: e.target.value })}
                  placeholder="Explain what happened and why you believe the action was incorrect..."
                />
                {errors.statement && <span style={{ color: '#ff8a80', fontSize: '12px' }}>{errors.statement}</span>}
              </div>

              <div>
                <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: '100%' }}>
                  {submitting ? 'Submitting…' : 'Submit Appeal'}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </>
  );
}
