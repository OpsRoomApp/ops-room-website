import { useState, useEffect } from 'react';

const API = '/api/discord';
const HEADERS = { 'Content-Type': 'application/json' };

export default function DiscordAudit() {
  const [logs, setLogs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [userIdFilter, setUserIdFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [types, setTypes] = useState([]);
  const [offset, setOffset] = useState(0);

  const fetchApi = async (path, opts = {}) => {
    const resp = await fetch(`${API}${path}`, { headers: HEADERS, credentials: 'include', ...opts });
    if (!resp.ok) throw new Error(`${resp.status}: ${resp.statusText}`);
    return resp.json();
  };

  useEffect(() => {
    fetchApi('/audit-logs/types').then(setTypes).catch(() => {});
  }, []);

  const loadLogs = (newOffset = 0) => {
    setLoading(true);
    setError('');
    setOffset(newOffset);
    const params = new URLSearchParams({ limit: '50', offset: newOffset.toString() });
    if (eventFilter) params.set('event_type', eventFilter);
    if (userIdFilter) params.set('user_id', userIdFilter);
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    fetchApi(`/audit-logs?${params}`)
      .then(setLogs)
      .catch((e) => setError(`Load failed: ${e.message}`))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadLogs(); }, []); // eslint-disable-line

  const getTypeColor = (type) => {
    if (type === 'command' || type === 'ofp') return 'var(--acc)';
    if (type === 'join' || type === 'welcome') return 'var(--green)';
    if (type === 'error' || type === 'api_failure') return 'var(--red)';
    if (type === 'ticket' || type === 'ticket_created' || type === 'ticket_closed' || type === 'ticket_claimed') return '#8B5CF6';
    if (type === 'bug') return '#F59E0B';
    if (type === 'announce') return '#2563EB';
    if (type === 'betatester' || type === 'beta_tester') return '#0EA5E9';
    if (type === 'purge') return '#EF4444';
    return 'var(--dim)';
  };

  return (
    <div>
      <h1 className="page-title">/ DISCORD AUDIT LOG</h1>

      <div className="card mb-2">
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ minWidth: '150px' }}>
            <label className="dim" style={{ fontSize: '0.7rem', display: 'block', marginBottom: '0.2rem' }}>Event Type</label>
            <select className="input" value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} style={{ fontSize: '0.8rem' }}>
              <option value="">All Types</option>
              {types.map((t) => (
                <option key={t.event_type} value={t.event_type}>{t.event_type} ({t.count})</option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: '130px' }}>
            <label className="dim" style={{ fontSize: '0.7rem', display: 'block', marginBottom: '0.2rem' }}>User ID</label>
            <input className="input" placeholder="Discord user ID" value={userIdFilter} onChange={(e) => setUserIdFilter(e.target.value)} style={{ fontSize: '0.8rem' }} />
          </div>
          <div style={{ minWidth: '130px' }}>
            <label className="dim" style={{ fontSize: '0.7rem', display: 'block', marginBottom: '0.2rem' }}>From Date</label>
            <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ fontSize: '0.8rem' }} />
          </div>
          <div style={{ minWidth: '130px' }}>
            <label className="dim" style={{ fontSize: '0.7rem', display: 'block', marginBottom: '0.2rem' }}>To Date</label>
            <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ fontSize: '0.8rem' }} />
          </div>
          <button className="btn btn-primary" onClick={() => loadLogs(0)} disabled={loading}>Filter</button>
        </div>
      </div>

      {error && (
        <div className="card mb-2" style={{ borderColor: 'rgba(255,59,48,0.3)', background: 'rgba(255,59,48,0.05)' }}>
          <span style={{ color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{error}</span>
        </div>
      )}

      {logs && (
        <>
          <div className="dim mb-1" style={{ fontSize: '0.75rem' }}>
            {logs.total} events total | Showing {logs.offset + 1}-{Math.min(logs.offset + logs.events.length, logs.total)}
          </div>

          <div className="card">
            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
              {logs.events.map((ev) => (
                <div key={ev.id} style={{ padding: '0.4rem 0.5rem', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.72rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.15rem' }}>
                    <span style={{ color: getTypeColor(ev.event_type), fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{ev.event_type}</span>
                    <span className="dim">{ev.created_at?.slice(0, 19)}</span>
                    {ev.username && <span>{ev.username}</span>}
                    {ev.user_id && <span className="mono-dim" style={{ fontSize: '0.65rem' }}>ID:{ev.user_id}</span>}
                  </div>
                  {ev.detail && <div className="dim" style={{ fontSize: '0.7rem' }}>{ev.detail.slice(0, 200)}</div>}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '0.75rem' }}>
            <button className="btn btn-sm" disabled={offset === 0} onClick={() => loadLogs(Math.max(0, offset - 50))}>
              Prev
            </button>
            <span className="dim" style={{ fontSize: '0.8rem' }}>Page {Math.floor(offset / 50) + 1}</span>
            <button className="btn btn-sm" disabled={logs.events.length < 50} onClick={() => loadLogs(offset + 50)}>
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
