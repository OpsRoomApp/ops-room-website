import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import SEO from '../components/SEO.jsx';

function MessageRow({ msg }) {
  return (
    <div style={{
      display: 'flex', gap: '0.75rem', padding: '0.9rem 1rem',
      background: 'var(--bg-inset, rgba(255,255,255,0.03))',
      border: '1px solid var(--line)', borderRadius: '8px', marginBottom: '0.65rem',
    }}>
      <div style={{ minWidth: '150px', flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--acc)', fontWeight: 600 }}>{msg.author || 'Unknown'}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--fg-muted)', marginTop: '0.15rem' }}>{msg.timestamp || ''}</div>
      </div>
      <div style={{ flex: 1, color: 'var(--fg)', fontSize: '13px', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {msg.content || <i style={{ color: 'var(--fg-muted)' }}>(no text)</i>}
        {(msg.attachments || []).map((url, i) => (
          <div key={i} style={{ marginTop: '0.3rem' }}>
            <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--acc)' }}>Attachment: {url}</a>
          </div>
        ))}
        {(msg.embeds || []).map((e, i) => (
          <div key={i} style={{ borderLeft: '3px solid var(--acc)', paddingLeft: '0.6rem', marginTop: '0.3rem', color: 'var(--fg-soft)' }}>
            <b>{e.title || 'Embed'}</b>{e.description ? ` — ${e.description}` : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

function MetaItem({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.08em', color: 'var(--fg-muted)', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: '13px', color: 'var(--fg)' }}>{value || '—'}</span>
    </div>
  );
}

export default function Transcript() {
  const { ticketId } = useParams();
  const [state, setState] = useState({ loading: true, expired: false, error: '', data: null });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/transcripts/view/${ticketId}`)
      .then(async (resp) => {
        const body = await resp.json().catch(() => null);
        if (cancelled) return;
        if (!resp.ok || !body?.ok) {
          setState({ loading: false, expired: !!body?.expired, error: body?.message || `Transcript could not be loaded (HTTP ${resp.status}).`, data: null });
          return;
        }
        setState({ loading: false, expired: false, error: '', data: body });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, expired: false, error: 'Network error while loading the transcript.', data: null });
      });
    return () => { cancelled = true; };
  }, [ticketId]);

  const { loading, expired, error, data } = state;
  const expiryNote = data ? `This transcript link expires ${14} days after the ticket was closed.` : '';

  return (
    <>
      <SEO title={data ? `Transcript #${data.ticket_number || ticketId}` : 'Transcript'} description="Closed OPS ROOM support ticket transcript." path={`/transcripts/${ticketId}`} />

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">/ TRANSCRIPT</span>
            <h1 className="section-title">
              {loading ? 'Loading transcript…' : expired ? 'This transcript has expired.' : data ? `Ticket #${data.ticket_number || ticketId}` : 'Transcript unavailable'}
            </h1>
            <p className="section-subtitle">
              {expired
                ? 'Closed-ticket transcripts are retained for 14 days, after which the public link is removed for privacy. If you need a copy of this conversation, please open a new support ticket.'
                : error
                  ? error
                  : loading
                    ? 'Retrieving the archived conversation…'
                    : expiryNote}
            </p>
          </div>

          {!loading && !expired && data && (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.25rem' }}>
                <a className="btn" href={`/api/v1/transcripts/${ticketId}/pdf`} target="_blank" rel="noopener noreferrer">
                  Download PDF
                </a>
              </div>

              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem',
                padding: '1.25rem', background: 'var(--bg-inset, rgba(255,255,255,0.03))',
                border: '1px solid var(--line)', borderRadius: '8px', marginBottom: '1.5rem',
              }}>
                <MetaItem label="Subject" value={data.subject} />
                <MetaItem label="Creator" value={data.creator_name} />
                <MetaItem label="Priority" value={data.priority} />
                <MetaItem label="Assigned" value={data.assigned_staff || 'None'} />
                <MetaItem label="Opened" value={data.opened_at} />
                <MetaItem label="Closed" value={data.closed_at} />
                <MetaItem label="Closed By" value={data.closed_by} />
                <MetaItem label="Close Reason" value={data.close_reason} />
              </div>

              {(data.messages || []).length === 0 ? (
                <p style={{ color: 'var(--fg-muted)' }}>No messages were recorded for this ticket.</p>
              ) : (
                <div>
                  {(data.messages || []).map((m, i) => <MessageRow key={i} msg={m} />)}
                </div>
              )}
            </>
          )}

          {!loading && (expired || error) && !data && (
            <div style={{ marginTop: '1rem' }}>
              <Link to="/" className="btn">Return to OPS ROOM</Link>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
