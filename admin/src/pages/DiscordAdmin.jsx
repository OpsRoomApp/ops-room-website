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

export default function DiscordAdmin() {
  const [status, setStatus] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [tickets, setTickets] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [annForm, setAnnForm] = useState({ title: '', content: '', channel_id: '' });
  const [annStatus, setAnnStatus] = useState('');

  const fetchApi = async (path, opts = {}) => {
    const resp = await fetch(`${API}${path}`, {
      headers: HEADERS,
      credentials: 'include',
      ...opts,
    });
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
    ])
      .then(([s, a, t]) => {
        setStatus(s);
        setAnalytics(a);
        setTickets(t);
      })
      .catch((e) => setError(`Connection error: ${e.message}`))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadAll(); }, []);

  const handleAnnounce = async (e) => {
    e.preventDefault();
    setAnnStatus('Sending...');
    try {
      const data = await fetchApi('/announcement', {
        method: 'POST',
        body: JSON.stringify(annForm),
      });
      setAnnStatus(`Announcement #${data.id} scheduled.`);
      setAnnForm({ title: '', content: '', channel_id: '' });
    } catch (e) {
      setAnnStatus(`Error: ${e.message}`);
    }
  };

  if (loading) return <div className="loading-state">Connecting to Discord bot database...</div>;

  return (
    <div>
      <h1 className="page-title">/ DISCORD ADMINISTRATION</h1>

      {error && (
        <div className="card mb-2" style={{ borderColor: 'rgba(255,59,48,0.3)', background: 'rgba(255,59,48,0.05)' }}>
          <span style={{ color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{error}</span>
        </div>
      )}

      {/* Status Row */}
      {status && (
        <div className="grid-4 mb-2">
          <StatCard label="BOT STATUS" value={<span className="badge badge-ok">ONLINE</span>} sub={status.timestamp?.slice(0, 19)} />
          <StatCard label="REGISTERED USERS" value={status.users} />
          <StatCard label="OPEN TICKETS" value={status.open_tickets} />
          <StatCard label="FLIGHTS LOGGED" value={status.flights_logged} />
        </div>
      )}

      {/* Detail Row */}
      {status && (
        <div className="grid-4 mb-2">
          <StatCard label="LOG ENTRIES" value={status.log_entries} />
          <StatCard label="BUGS REPORTED" value={status.bugs_reported} />
          <StatCard label="ACTIVE NOTAMS" value={status.active_notams} />
          <StatCard label="UPTIME" value="--" sub="Check bot console" />
        </div>
      )}

      {/* Analytics */}
      {analytics && (
        <div className="card mb-2">
          <div className="card-head">COMMAND ANALYTICS</div>
          <div className="stat-value" style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
            {analytics.total_events} total events
          </div>
          <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {analytics.command_usage?.map((cmd, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.2rem 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.75rem' }}>
                <span className="mono-dim">{cmd.command}</span>
                <span className="dim">{cmd.count}</span>
              </div>
            ))}
          </div>
          {analytics.recent_api_failures?.length > 0 && (
            <div className="mt-1">
              <div className="card-head" style={{ marginTop: '0.5rem', color: 'var(--red)' }}>RECENT API FAILURES</div>
              {analytics.recent_api_failures.map((f, i) => (
                <div key={i} className="mono-dim" style={{ fontSize: '0.7rem', padding: '0.15rem 0' }}>
                  [{f.time?.slice(0, 19)}] {f.detail?.slice(0, 120)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Schedule Announcement */}
      <div className="card mb-2">
        <div className="card-head">CREATE ANNOUNCEMENT</div>
        <form onSubmit={handleAnnounce} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <input
            className="input"
            placeholder="Title"
            value={annForm.title}
            onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })}
            required
          />
          <textarea
            className="input"
            placeholder="Content"
            rows={4}
            value={annForm.content}
            onChange={(e) => setAnnForm({ ...annForm, content: e.target.value })}
            required
          />
          <input
            className="input"
            placeholder="Discord Channel ID"
            value={annForm.channel_id}
            onChange={(e) => setAnnForm({ ...annForm, channel_id: e.target.value })}
            required
          />
          <button type="submit" className="btn btn-primary">Schedule Announcement</button>
        </form>
        {annStatus && <div className="dim mt-1" style={{ fontSize: '0.8rem' }}>{annStatus}</div>}
      </div>

      {/* Tickets & Bugs */}
      {tickets && (
        <div className="grid-2 mb-2">
          <div className="card">
            <div className="card-head">OPEN TICKETS ({tickets.tickets?.length || 0})</div>
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {tickets.tickets?.map((t) => (
                <div key={t.id} style={{ padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.75rem' }}>
                  <span className="mono-dim">#{t.id}</span> <span>{t.user}</span>
                  <span className="badge" style={{ marginLeft: '0.5rem' }}>{t.category}</span>
                  <div className="dim" style={{ fontSize: '0.7rem' }}>{t.description?.slice(0, 150)}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-head">OPEN BUGS ({tickets.bugs?.length || 0})</div>
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {tickets.bugs?.map((b) => (
                <div key={b.id} style={{ padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.75rem' }}>
                  <span className="mono-dim">#{b.id}</span> <span>{b.reporter}</span>
                  <span className="badge" style={{ marginLeft: '0.5rem' }}>{b.module}</span>
                  <span className="dim" style={{ marginLeft: '0.5rem' }}>v{b.version}</span>
                  <div className="dim" style={{ fontSize: '0.7rem' }}>{b.description?.slice(0, 120)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
