import { useState, useEffect } from 'react';

const API = '/api/discord';
const HEADERS = { 'Content-Type': 'application/json' };

function StatCard({ label, value, sub }) {
  return (
    <div className="card" style={{ minWidth: 0 }}>
      <div className="card-head">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-label">{sub}</div>}
    </div>
  );
}

function TabBar({ tabs, active, onSelect }) {
  return (
    <div style={{ display: 'flex', gap: '0', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onSelect(t.key)}
          style={{
            padding: '0.5rem 1.2rem',
            background: 'transparent',
            border: 'none',
            borderBottom: active === t.key ? '2px solid var(--acc)' : '2px solid transparent',
            color: active === t.key ? 'var(--acc)' : 'var(--dim)',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            textTransform: 'uppercase',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export default function DiscordAdmin() {
  const [tab, setTab] = useState('dashboard');
  const [status, setStatus] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [tickets, setTickets] = useState(null);
  const [ticketFilter, setTicketFilter] = useState('open');
  const [announcements, setAnnouncements] = useState([]);
  const [pendingActions, setPendingActions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [annForm, setAnnForm] = useState({ title: '', content: '', channel_id: '', embed_color: '#3498db', image_url: '', scheduled_at: '' });
  const [annStatus, setAnnStatus] = useState('');
  const [assignId, setAssignId] = useState('');

  const fetchApi = async (path, opts = {}) => {
    const resp = await fetch(`${API}${path}`, { headers: HEADERS, credentials: 'include', ...opts });
    if (!resp.ok) throw new Error(`${resp.status}: ${resp.statusText}`);
    return resp.json();
  };

  const loadAll = () => {
    setLoading(true);
    setError('');
    Promise.all([
      fetchApi('/status'),
      fetchApi('/analytics'),
      fetchApi('/tickets?status=open'),
      fetchApi('/announcements'),
      fetchApi('/pending-actions'),
    ])
      .then(([s, a, t, ann, pa]) => { setStatus(s); setAnalytics(a); setTickets(t); setAnnouncements(ann); setPendingActions(pa); })
      .catch((e) => setError(`Connection error: ${e.message}`))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadAll(); }, []);

  const loadTickets = (filter) => {
    setTicketFilter(filter);
    fetchApi(`/tickets?status=${filter}`).then(setTickets).catch(() => {});
  };

  const handleAnnounce = async (e) => {
    e.preventDefault();
    setAnnStatus('Sending...');
    try {
      const data = await fetchApi('/announcement', { method: 'POST', body: JSON.stringify(annForm) });
      setAnnStatus(`Announcement #${data.id} scheduled.`);
      setAnnForm({ title: '', content: '', channel_id: '', embed_color: '#3498db', image_url: '', scheduled_at: '' });
      loadAll();
    } catch (e) {
      setAnnStatus(`Error: ${e.message}`);
    }
  };

  const handleAssign = async (ticketId) => {
    const uid = parseInt(assignId, 10);
    if (!uid) return;
    try {
      await fetchApi(`/tickets/${ticketId}/assign`, { method: 'POST', body: JSON.stringify({ assigned_to: uid }) });
      loadTickets(ticketFilter);
      setAssignId('');
    } catch (e) {
      alert(`Assign failed: ${e.message}`);
    }
  };

  const handleClose = async (ticketId) => {
    try {
      await fetchApi(`/tickets/${ticketId}/close`, { method: 'POST' });
      loadTickets(ticketFilter);
    } catch (e) {
      alert(`Close failed: ${e.message}`);
    }
  };

  const handleReopen = async (ticketId) => {
    try {
      await fetchApi(`/tickets/${ticketId}/reopen`, { method: 'POST' });
      loadTickets(ticketFilter);
    } catch (e) {
      alert(`Reopen failed: ${e.message}`);
    }
  };

  const tabs = [
    { key: 'dashboard', label: 'DASHBOARD' },
    { key: 'tickets', label: 'TICKETS' },
    { key: 'announcements', label: 'ANNOUNCEMENTS' },
    { key: 'analytics', label: 'ANALYTICS' },
  ];

  if (loading) return <div className="loading-state">Connecting to Discord bot database...</div>;

  return (
    <div>
      <h1 className="page-title">/ DISCORD OPERATIONS</h1>

      {error && (
        <div className="card mb-2" style={{ borderColor: 'rgba(255,59,48,0.3)', background: 'rgba(255,59,48,0.05)' }}>
          <span style={{ color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{error}</span>
        </div>
      )}

      <TabBar tabs={tabs} active={tab} onSelect={setTab} />

      {/* ================================================================ */}
      {/* DASHBOARD */}
      {/* ================================================================ */}
      {tab === 'dashboard' && status && (
        <>
          <div className="grid-4 mb-2">
            <StatCard label="BOT STATUS" value={<span className="badge badge-ok">ONLINE</span>} sub={status.timestamp?.slice(0, 19)} />
            <StatCard label="REGISTERED USERS" value={status.users} />
            <StatCard label="OPEN TICKETS" value={status.open_tickets} sub={`${status.closed_tickets} closed`} />
            <StatCard label="FLIGHTS LOGGED" value={status.flights_logged} />
          </div>
          <div className="grid-4 mb-2">
            <StatCard label="BETA TESTERS" value={status.beta_testers} />
            <StatCard label="BUGS REPORTED" value={status.bugs_reported} />
            <StatCard label="ACTIVE NOTAMS" value={status.active_notams} />
            <StatCard label="ANNOUNCEMENTS" value={status.announcements_sent} sub={`${status.simbrief_linked} SimBrief linked`} />
          </div>
        </>
      )}

      {/* ================================================================ */}
      {/* TICKETS */}
      {/* ================================================================ */}
      {tab === 'tickets' && tickets && (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            {['open', 'closed', 'all'].map((f) => (
              <button key={f} className={`btn btn-sm ${ticketFilter === f ? 'btn-primary' : ''}`} onClick={() => loadTickets(f)}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="card mb-2">
            <div className="card-head">SUPPORT TICKETS ({tickets.tickets?.length || 0})</div>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {tickets.tickets?.map((t) => (
                <div key={`t-${t.id}`} style={{ padding: '0.6rem 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <span className="mono-dim">#{t.id}</span>
                    <span>{t.username}</span>
                    <span className={`badge badge-${t.priority === 'Critical' ? 'err' : t.priority === 'High' ? 'warn' : 'dim'}`}>{t.priority}</span>
                    <span className="badge">{t.category}</span>
                    <span className="badge" style={{ background: t.status === 'open' ? 'rgba(0,200,83,0.15)' : 'rgba(255,255,255,0.05)', color: t.status === 'open' ? 'var(--green)' : 'var(--dim)' }}>{t.status}</span>
                    {t.assigned_to && <span className="dim" style={{ fontSize: '0.7rem' }}>Assign: {t.assigned_to}</span>}
                  </div>
                  <div className="dim" style={{ marginBottom: '0.25rem' }}><strong>{t.subject}</strong></div>
                  <div className="dim" style={{ fontSize: '0.7rem', marginBottom: '0.25rem' }}>{t.description?.slice(0, 200)}</div>
                  <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                    {t.channel_id && <span className="dim" style={{ fontSize: '0.65rem' }}>Channel: {t.channel_id}</span>}
                    <span className="dim" style={{ fontSize: '0.65rem' }}>{t.created_at?.slice(0, 19)}</span>
                    {t.status === 'open' && (
                      <>
                        <input className="input" placeholder="Assign user ID" value={assignId === `t-${t.id}` ? undefined : ''} onChange={(e) => {}} onFocus={() => setAssignId(`t-${t.id}`)} onKeyDown={(e) => { if (e.key === 'Enter') handleAssign(t.id); }} style={{ width: '120px', fontSize: '0.7rem', padding: '0.1rem 0.3rem' }} />
                        <button className="btn btn-sm" onClick={() => handleAssign(t.id)}>Assign</button>
                        <button className="btn btn-sm" onClick={() => handleClose(t.id)} style={{ color: 'var(--red)' }}>Close</button>
                      </>
                    )}
                    {t.status !== 'open' && (
                      <button className="btn btn-sm" onClick={() => handleReopen(t.id)}>Reopen</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-head">BUG REPORTS ({tickets.bugs?.length || 0})</div>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {tickets.bugs?.map((b) => (
                <div key={`b-${b.id}`} style={{ padding: '0.6rem 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <span className="mono-dim">#{b.id}</span>
                    <span>{b.username}</span>
                    <span className="badge">{b.module}</span>
                    <span className="dim">v{b.version}</span>
                    <span className="badge" style={{ background: b.status === 'open' ? 'rgba(0,200,83,0.15)' : 'rgba(255,255,255,0.05)', color: b.status === 'open' ? 'var(--green)' : 'var(--dim)' }}>{b.status}</span>
                  </div>
                  <div className="dim" style={{ marginBottom: '0.25rem' }}><strong>{b.subject}</strong></div>
                  <div className="dim" style={{ fontSize: '0.7rem', marginBottom: '0.25rem' }}>{b.description?.slice(0, 200)}</div>
                  <div style={{ display: 'flex', gap: '0.3rem' }}>
                    <span className="dim" style={{ fontSize: '0.65rem' }}>{b.created_at?.slice(0, 19)}</span>
                    {b.status === 'open' && (
                      <button className="btn btn-sm" onClick={async () => { try { await fetchApi(`/bugs/${b.id}/close`, { method: 'POST' }); loadTickets(ticketFilter); } catch(e) { alert(e.message); } }} style={{ color: 'var(--red)' }}>Close</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ================================================================ */}
      {/* ANNOUNCEMENTS */}
      {/* ================================================================ */}
      {tab === 'announcements' && (
        <>
          <div className="card mb-2">
            <div className="card-head">DISPATCH QUEUE STATUS</div>
            <div className="grid-4">
              {['pending', 'scheduled', 'processing', 'completed', 'failed'].map((s) => (
                <StatCard key={s} label={s.toUpperCase()} value={pendingActions?.counts?.[s] ?? 0} />
              ))}
            </div>
          </div>

          <div className="card mb-2">
            <div className="card-head">PENDING ACTIONS</div>
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {(pendingActions?.actions || []).slice(0, 20).map((a) => (
                <div key={a.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.75rem' }}>
                  <span className="mono-dim">#{a.id}</span>
                  <span style={{ color: 'var(--acc)' }}>{a.action_type}</span>
                  <span className={`badge badge-${a.status === 'completed' ? 'ok' : a.status === 'failed' ? 'err' : a.status === 'processing' ? 'warn' : 'dim'}`}>{a.status}</span>
                  <span className="dim">attempts: {a.attempts}</span>
                  <span className="dim" style={{ marginLeft: 'auto' }}>{a.created_at?.slice(0, 19)}</span>
                </div>
              ))}
              {(!pendingActions?.actions || pendingActions.actions.length === 0) && (
                <div className="dim" style={{ padding: '0.5rem 0', fontSize: '0.75rem' }}>Queue is empty.</div>
              )}
            </div>
          </div>

          <div className="card mb-2">
            <div className="card-head">CREATE ANNOUNCEMENT</div>
            <form onSubmit={handleAnnounce} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <input className="input" placeholder="Title" value={annForm.title} onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })} required />
              <textarea className="input" placeholder="Content (Markdown supported)" rows={4} value={annForm.content} onChange={(e) => setAnnForm({ ...annForm, content: e.target.value })} required />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <input className="input" placeholder="Embed Color (hex)" value={annForm.embed_color} onChange={(e) => setAnnForm({ ...annForm, embed_color: e.target.value })} />
                <input className="input" placeholder="Discord Channel ID" value={annForm.channel_id} onChange={(e) => setAnnForm({ ...annForm, channel_id: e.target.value })} required />
              </div>
              <input className="input" placeholder="Image URL (optional)" value={annForm.image_url} onChange={(e) => setAnnForm({ ...annForm, image_url: e.target.value })} />
              <input className="input" placeholder="Schedule (ISO timestamp, optional)" value={annForm.scheduled_at} onChange={(e) => setAnnForm({ ...annForm, scheduled_at: e.target.value })} />
              <button type="submit" className="btn btn-primary">Schedule Announcement</button>
            </form>
            {annStatus && <div className="dim mt-1" style={{ fontSize: '0.8rem' }}>{annStatus}</div>}
          </div>

          <div className="card">
            <div className="card-head">PREVIOUS ANNOUNCEMENTS ({announcements.length})</div>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {announcements.map((a) => (
                <div key={a.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.75rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span className="mono-dim">#{a.id}</span>
                    <span style={{ color: 'var(--acc)' }}>{a.title}</span>
                    <span className={`badge badge-${(a.queue_status || a.status) === 'completed' || a.status === 'sent' ? 'ok' : (a.queue_status || a.status) === 'failed' ? 'err' : 'warn'}`}>{a.queue_status || a.status}</span>
                    {a.queue_status && a.queue_status !== a.status && a.status !== 'completed' && (
                      <span className="dim" style={{ fontSize: '0.65rem' }}>record: {a.status}</span>
                    )}
                    <span className="dim">Channel: {a.channel_id}</span>
                  </div>
                  <div className="dim" style={{ fontSize: '0.7rem', marginTop: '0.2rem' }}>
                    {a.content?.slice(0, 150)}
                    {a.scheduled_at && <span style={{ marginLeft: '0.5rem' }}>Scheduled: {a.scheduled_at.slice(0, 19)}</span>}
                    {a.announced_at && <span style={{ marginLeft: '0.5rem' }}>Sent: {a.announced_at.slice(0, 19)}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ================================================================ */}
      {/* ANALYTICS */}
      {/* ================================================================ */}
      {tab === 'analytics' && analytics && (
        <>
          <div className="grid-2 mb-2">
            <div className="card">
              <div className="card-head">COMMAND USAGE</div>
              <div className="stat-value" style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>{analytics.total_events} total events</div>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {analytics.command_usage?.map((cmd, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.2rem 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.75rem' }}>
                    <span className="mono-dim">{cmd.command}</span>
                    <span className="dim">{cmd.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-head">ACTIVE USERS (7d)</div>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {analytics.active_users?.map((u, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.2rem 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.75rem' }}>
                    <span>{u.username}</span>
                    <span className="dim">{u.actions} actions</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
