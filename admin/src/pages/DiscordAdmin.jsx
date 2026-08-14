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
    <div style={{ display: 'flex', gap: '0', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
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

// Dependency-free horizontal bar chart (divs only) for time-series data.
function SimpleBarChart({ data, labelKey, valueKey, accent = 'var(--acc)' }) {
  const max = Math.max(1, ...(data || []).map((d) => Number(d[valueKey]) || 0));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
      {(data || []).map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="mono-dim" style={{ width: '72px', flexShrink: 0, fontSize: '0.65rem', textAlign: 'right' }}>{d[labelKey]}</span>
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: '2px', height: '14px', overflow: 'hidden' }}>
            <div style={{ width: `${((Number(d[valueKey]) || 0) / max) * 100}%`, background: accent, height: '100%', borderRadius: '2px' }} />
          </div>
          <span className="dim" style={{ width: '34px', fontSize: '0.65rem' }}>{d[valueKey]}</span>
        </div>
      ))}
      {(!data || data.length === 0) && <div className="dim" style={{ fontSize: '0.75rem' }}>No data yet.</div>}
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
  // C2 additions
  const [ticketAnalytics, setTicketAnalytics] = useState(null);
  const [modCases, setModCases] = useState(null);
  const [automodRules, setAutomodRules] = useState([]);
  const [appeals, setAppeals] = useState([]);
  const [allowlist, setAllowlist] = useState([]);
  const [modFilterUser, setModFilterUser] = useState('');
  const [appealResolution, setAppealResolution] = useState({});
  const [allowlistForm, setAllowlistForm] = useState({ provider: 'github', identifier: '', display: '' });
  const [automodSaving, setAutomodSaving] = useState('');
  const [allowlistStatus, setAllowlistStatus] = useState('');

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

  const loadC2 = () => {
    Promise.all([
      fetchApi('/analytics/tickets').catch(() => null),
      fetchApi('/moderation-cases').catch(() => null),
      fetchApi('/automod-config').catch(() => null),
      fetchApi('/appeals').catch(() => null),
      fetchApi('/staff-allowlist').catch(() => null),
    ]).then(([ta, mc, ar, ap, al]) => {
      setTicketAnalytics(ta); setModCases(mc); setAutomodRules(ar?.rules || []); setAppeals(ap?.appeals || []); setAllowlist(al?.entries || []);
    }).catch(() => {});
  };

  useEffect(() => { loadAll(); loadC2(); }, []);

  const handleAutomodSave = async (rule) => {
    setAutomodSaving(rule.rule_key);
    try {
      await fetchApi(`/automod-config/${rule.rule_key}`, { method: 'PUT', body: JSON.stringify(rule) });
      loadC2();
    } catch (e) { alert(`Automod save failed: ${e.message}`); }
    finally { setAutomodSaving(''); }
  };

  const handleAppealReview = async (appealId, decision) => {
    const resolution = (appealResolution[appealId] || '').trim();
    if (decision === 'approved' && !resolution) {
      alert('Please enter a resolution note before approving.');
      return;
    }
    try {
      await fetchApi(`/appeals/${appealId}/review`, { method: 'POST', body: JSON.stringify({ decision, resolution }) });
      loadC2();
    } catch (e) { alert(`Review failed: ${e.message}`); }
  };

  const handleAllowlistAdd = async (e) => {
    e.preventDefault();
    if (!allowlistForm.identifier.trim()) return;
    try {
      await fetchApi('/staff-allowlist', { method: 'POST', body: JSON.stringify(allowlistForm) });
      setAllowlistForm({ provider: 'github', identifier: '', display: '' });
      setAllowlistStatus('Added.');
      loadC2();
    } catch (e) { setAllowlistStatus(`Error: ${e.message}`); }
  };

  const handleAllowlistRemove = async (provider, identifier) => {
    if (!confirm(`Remove ${provider}: ${identifier} from the allowlist?`)) return;
    try {
      await fetchApi('/staff-allowlist', { method: 'DELETE', body: JSON.stringify({ provider, identifier }) });
      setAllowlistStatus('Removed.');
      loadC2();
    } catch (e) { setAllowlistStatus(`Error: ${e.message}`); }
  };

  const loadModCases = (userId) => {
    setModFilterUser(userId || '');
    const q = userId ? `?user_id=${userId}` : '';
    fetchApi(`/moderation-cases${q}`).then(setModCases).catch(() => {});
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
    { key: 'moderation', label: 'MODERATION' },
    { key: 'automod', label: 'AUTOMOD' },
    { key: 'appeals', label: 'APPEALS' },
    { key: 'allowlist', label: 'ALLOWLIST' },
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

          <div className="grid-2">
            <div className="card">
              <div className="card-head">BOT ACTIVITY (30d)</div>
              <SimpleBarChart data={analytics.command_timeline} labelKey="day" valueKey="count" />
            </div>
            <div className="card">
              <div className="card-head">TICKET VOLUME (14d)</div>
              <SimpleBarChart data={ticketAnalytics?.volume_by_day} labelKey="day" valueKey="count" accent="var(--amber)" />
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                <div className="dim" style={{ fontSize: '0.7rem' }}>Avg claim: <b style={{ color: 'var(--text)' }}>{ticketAnalytics?.avg_time_to_claim_minutes ?? '-'} min</b></div>
                <div className="dim" style={{ fontSize: '0.7rem' }}>Avg close: <b style={{ color: 'var(--text)' }}>{ticketAnalytics?.avg_time_to_close_minutes ?? '-'} min</b></div>
                <div className="dim" style={{ fontSize: '0.7rem' }}>Closed w/ reason: <b style={{ color: 'var(--text)' }}>{ticketAnalytics?.closed_with_reason ?? 0}</b></div>
              </div>
            </div>
          </div>

          <div className="card mt-2">
            <div className="card-head">TICKET VOLUME BY PRIORITY</div>
            <SimpleBarChart
              data={Object.entries(ticketAnalytics?.volume_by_priority || {}).map(([p, c]) => ({ priority: p, count: c }))}
              labelKey="priority" valueKey="count" accent="var(--green)"
            />
          </div>
        </>
      )}

      {/* ================================================================ */}
      {/* MODERATION */}
      {/* ================================================================ */}
      {tab === 'moderation' && (
        <>
          <div className="card mb-2">
            <div className="card-head">MODERATION CASE HISTORY</div>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <input
                className="input"
                placeholder="Filter by Discord user ID"
                value={modFilterUser}
                onChange={(e) => setModFilterUser(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') loadModCases(modFilterUser.trim()); }}
                style={{ width: '220px', fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
              />
              <button className="btn btn-sm" onClick={() => loadModCases(modFilterUser.trim())}>Apply</button>
              {modFilterUser && <button className="btn btn-sm" onClick={() => loadModCases('')}>Clear</button>}
              <span className="dim" style={{ alignSelf: 'center', fontSize: '0.7rem', marginLeft: 'auto' }}>{modCases?.total ?? 0} cases</span>
            </div>
            <div style={{ maxHeight: '480px', overflowY: 'auto' }}>
              {(modCases?.cases || []).map((c) => (
                <div key={c.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.75rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="mono-dim">#{c.id}</span>
                    <span style={{ color: 'var(--acc)' }}>{c.action_type}</span>
                    <span className="dim">user: {c.user_id}</span>
                    <span className="dim">mod: {c.moderator_id}</span>
                    <span className={`badge badge-${c.active ? 'warn' : 'dim'}`}>{c.active ? 'ACTIVE' : 'RESOLVED'}</span>
                    <span className="dim" style={{ marginLeft: 'auto' }}>{c.created_at?.slice(0, 19)}</span>
                  </div>
                  <div className="dim" style={{ fontSize: '0.7rem', marginTop: '0.2rem' }}>{c.reason || '(no reason)'}{c.expires_at ? ` · expires ${c.expires_at.slice(0, 16)}` : ''}</div>
                </div>
              ))}
              {(!modCases?.cases || modCases.cases.length === 0) && <div className="dim" style={{ padding: '0.5rem 0', fontSize: '0.75rem' }}>No moderation cases recorded.</div>}
            </div>
          </div>
        </>
      )}

      {/* ================================================================ */}
      {/* AUTOMOD */}
      {/* ================================================================ */}
      {tab === 'automod' && (
        <div className="card">
          <div className="card-head">AUTOMOD RULES</div>
          <p className="dim" style={{ fontSize: '0.75rem', marginBottom: '0.75rem' }}>
            Rules are stored in the bot database (automod_config) and read live by the bot. Enabled rules with a 'warn' action log a case to the mod log; 'timeout' applies a 15-minute timeout; 'delete' removes the message.
          </p>
          {(automodRules || []).map((rule) => (
            <div key={rule.rule_key} style={{ padding: '0.75rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="mono-dim" style={{ minWidth: '170px', color: 'var(--acc)' }}>{rule.rule_key}</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem' }}>
                <input
                  type="checkbox"
                  checked={!!rule.enabled}
                  onChange={(e) => handleAutomodSave({ ...rule, enabled: e.target.checked })}
                  disabled={automodSaving === rule.rule_key}
                />
                Enabled
              </label>
              <select
                className="input"
                value={rule.action || 'warn'}
                onChange={(e) => handleAutomodSave({ ...rule, action: e.target.value })}
                disabled={automodSaving === rule.rule_key}
                style={{ width: '110px', fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}
              >
                <option value="warn">warn</option>
                <option value="timeout">timeout</option>
                <option value="delete">delete</option>
                <option value="log">log</option>
              </select>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem' }} className="dim">
                Threshold:
                <input
                  className="input"
                  type="number"
                  step="0.1"
                  value={rule.threshold ?? ''}
                  onChange={(e) => handleAutomodSave({ ...rule, threshold: e.target.value === '' ? null : Number(e.target.value) })}
                  disabled={automodSaving === rule.rule_key}
                  style={{ width: '70px', fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}
                />
              </div>
              {automodSaving === rule.rule_key && <span className="dim" style={{ fontSize: '0.65rem' }}>saving…</span>}
            </div>
          ))}
          {(automodRules || []).length === 0 && (
            <div className="dim" style={{ padding: '0.5rem 0', fontSize: '0.75rem' }}>
              No rules found. Rules are created when the bot first triggers an automod check; defaults are: spam (5/5s), excessive_mentions (8), excessive_caps (0.7).
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* APPEALS */}
      {/* ================================================================ */}
      {tab === 'appeals' && (
        <>
          <div className="card mb-2">
            <div className="card-head">APPEAL REVIEW QUEUE ({appeals.length})</div>
            <p className="dim" style={{ fontSize: '0.75rem', marginBottom: '0.75rem' }}>
              Approving an appeal enqueues a moderation_reverse action that the bot dispatcher picks up to unban / clear the timeout on Discord.
            </p>
            <div style={{ maxHeight: '480px', overflowY: 'auto' }}>
              {(appeals || []).map((a) => (
                <div key={a.id} style={{ padding: '0.7rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.78rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="mono-dim">#{a.id}</span>
                    <span>{a.username || a.user_id || 'unknown'}</span>
                    {a.action_type && <span className="badge">{a.action_type}</span>}
                    <span className={`badge badge-${a.status === 'pending' ? 'warn' : a.status === 'approved' ? 'ok' : 'err'}`}>{a.status}</span>
                    <span className="dim" style={{ marginLeft: 'auto' }}>{a.created_at?.slice(0, 19)}</span>
                  </div>
                  <div className="dim" style={{ fontSize: '0.72rem', marginTop: '0.3rem' }}>{a.statement}</div>
                  {a.status === 'pending' ? (
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        className="input"
                        placeholder="Resolution note (required to approve)"
                        value={appealResolution[a.id] || ''}
                        onChange={(e) => setAppealResolution({ ...appealResolution, [a.id]: e.target.value })}
                        style={{ flex: 1, minWidth: '200px', fontSize: '0.7rem', padding: '0.25rem 0.5rem' }}
                      />
                      <button className="btn btn-sm" style={{ color: 'var(--green)' }} onClick={() => handleAppealReview(a.id, 'approved')}>Approve</button>
                      <button className="btn btn-sm" style={{ color: 'var(--red)' }} onClick={() => handleAppealReview(a.id, 'denied')}>Deny</button>
                    </div>
                  ) : (
                    <div className="dim" style={{ fontSize: '0.7rem', marginTop: '0.3rem' }}>
                      Reviewed {a.reviewed_at?.slice(0, 19)}{a.resolution ? ` - ${a.resolution}` : ''}
                    </div>
                  )}
                </div>
              ))}
              {(appeals || []).length === 0 && <div className="dim" style={{ padding: '0.5rem 0', fontSize: '0.75rem' }}>No appeals submitted.</div>}
            </div>
          </div>
        </>
      )}

      {/* ================================================================ */}
      {/* ALLOWLIST */}
      {/* ================================================================ */}
      {tab === 'allowlist' && (
        <>
          <div className="card mb-2">
            <div className="card-head">STAFF ALLOWLIST</div>
            <p className="dim" style={{ fontSize: '0.75rem', marginBottom: '0.75rem' }}>
              This is the source of truth checked by auth at login time (GitHub usernames and Discord user IDs).
            </p>
            <form onSubmit={handleAllowlistAdd} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <select className="input" value={allowlistForm.provider} onChange={(e) => setAllowlistForm({ ...allowlistForm, provider: e.target.value })} style={{ width: '110px', fontSize: '0.75rem', padding: '0.3rem 0.5rem' }}>
                <option value="github">github</option>
                <option value="discord">discord</option>
              </select>
              <input className="input" placeholder={allowlistForm.provider === 'github' ? 'GitHub username' : 'Discord user ID'} value={allowlistForm.identifier} onChange={(e) => setAllowlistForm({ ...allowlistForm, identifier: e.target.value })} style={{ width: '220px', fontSize: '0.75rem', padding: '0.3rem 0.5rem' }} required />
              <input className="input" placeholder="Display name (optional)" value={allowlistForm.display} onChange={(e) => setAllowlistForm({ ...allowlistForm, display: e.target.value })} style={{ width: '180px', fontSize: '0.75rem', padding: '0.3rem 0.5rem' }} />
              <button className="btn btn-sm btn-primary" type="submit">Add</button>
              {allowlistStatus && <span className="dim" style={{ fontSize: '0.7rem' }}>{allowlistStatus}</span>}
            </form>
          </div>
          <div className="card">
            <div className="card-head">CURRENT ENTRIES ({allowlist.length})</div>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {(allowlist || []).map((e) => (
                <div key={`${e.provider}-${e.identifier}`} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.75rem' }}>
                  <span className={`badge badge-${e.provider === 'github' ? 'stable' : 'warn'}`}>{e.provider}</span>
                  <span className="mono-dim">{e.identifier}</span>
                  {e.display && <span className="dim">({e.display})</span>}
                  <span className="dim" style={{ marginLeft: 'auto' }}>{e.added_at?.slice(0, 19)}</span>
                  <button className="btn btn-sm" style={{ color: 'var(--red)' }} onClick={() => handleAllowlistRemove(e.provider, e.identifier)}>Remove</button>
                </div>
              ))}
              {(allowlist || []).length === 0 && <div className="dim" style={{ padding: '0.5rem 0', fontSize: '0.75rem' }}>Allowlist is empty - env vars (APPROVED_GITHUB_USERS / APPROVED_DISCORD_USERS) seed it on first boot.</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
