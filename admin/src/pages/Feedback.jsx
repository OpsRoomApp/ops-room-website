import { useState, useCallback, useEffect } from 'react';

const API = '/api/v1/feedback';

const STATUS_LABELS = { new: 'NEW', open: 'OPEN', accepted: 'ACCEPTED', planned: 'PLANNED', closed: 'CLOSED' };
const STATUS_BADGE = { new: 'badge-err', open: 'badge-warn', accepted: 'badge-ok', planned: 'badge-stable', closed: 'badge' };
const KIND_LABELS = { feedback: 'FEEDBACK', feature_request: 'FEATURE', bug: 'BUG' };

function statusBadge(status) {
  return <span className={`badge ${STATUS_BADGE[status] || 'badge-warn'}`}>{STATUS_LABELS[status] || String(status || '?').toUpperCase()}</span>;
}

export default function Feedback() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ new: 0, open: 0, accepted: 0, planned: 0, closed: 0, total: 0 });
  const [filters, setFilters] = useState({ status: '', kind: '', q: '', limit: 50, offset: 0 });
  const [selected, setSelected] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('new');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (next = filters) => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    Object.entries(next).forEach(([k, v]) => {
      if (v !== '' && v !== undefined && v !== null) params.set(k, v);
    });
    try {
      const resp = await fetch(`${API}?${params.toString()}`, { credentials: 'include' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
      setFilters(next);
      if (!next.status && !next.kind && !next.q) {
        const s = await fetch(`${API}/stats`, { credentials: 'include' }).then((r) => r.json());
        if (s.ok) setCounts(s.counts || counts);
      }
    } catch (err) {
      console.error('Feedback load failed:', err);
      setError(err?.message || 'Failed to load feedback');
    } finally {
      setLoading(false);
    }
  }, [counts]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const openDetail = async (id) => {
    setSelectedId(id);
    setError('');
    try {
      const resp = await fetch(`${API}/${encodeURIComponent(id)}`, { credentials: 'include' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const item = data.item;
      setSelected(item);
      setNotes(item.notes || '');
      setStatus(item.status || 'new');
    } catch (err) {
      setError(err?.message || 'Failed to load detail');
    }
  };

  const closeDetail = () => { setSelected(null); setSelectedId(''); };

  const saveDetail = async () => {
    setSaving(true);
    setError('');
    try {
      const resp = await fetch(`${API}/${encodeURIComponent(selectedId)}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (!data.ok) throw new Error(data.detail || 'Save failed');
      setSelected(data.item);
      await load();
    } catch (err) {
      setError(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="card-head">FEEDBACK &amp; FEATURE REQUESTS ({counts.total} total, {counts.new} new)</div>
      {error && <p style={{ color: 'var(--red)' }}>{error}</p>}

      <div className="card">
        <div className="card-head">FILTERS</div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={filters.status}
            onChange={(e) => load({ ...filters, status: e.target.value, offset: 0 })}
            style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: '0.4rem' }}
          >
            <option value="">ALL STATUSES</option>
            {Object.keys(STATUS_LABELS).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
          <select
            value={filters.kind}
            onChange={(e) => load({ ...filters, kind: e.target.value, offset: 0 })}
            style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: '0.4rem' }}
          >
            <option value="">ALL KINDS</option>
            {Object.keys(KIND_LABELS).map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
          </select>
          <input
            value={filters.q}
            onChange={(e) => load({ ...filters, q: e.target.value, offset: 0 })}
            placeholder="Search title / description / contact"
            style={{ flex: 1, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: '0.4rem 0.6rem' }}
          />
        </div>
      </div>

      {loading ? <p>Loading...</p> : (
        <div className="card">
          {items.length === 0 ? (
            <p style={{ opacity: 0.6 }}>No feedback matching the filters.</p>
          ) : (
            items.map((item) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.45rem 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => openDetail(item.id)}>
                <span className="badge badge-stable">{KIND_LABELS[item.kind] || String(item.kind || '?').toUpperCase()}</span>
                {statusBadge(item.status)}
                <span style={{ flex: 1 }}>{item.title}</span>
                <small style={{ opacity: 0.6 }}>{item.id} · {(item.received_at || '').slice(0, 16).replace('T', ' ')}Z</small>
              </div>
            ))
          )}
        </div>
      )}

      {selected && (
        <div className="card">
          <div className="card-head">{selected.id} — {selected.title}</div>
          <p>{selected.description}</p>
          <p style={{ opacity: 0.6 }}>Kind: {KIND_LABELS[selected.kind] || selected.kind} · Source: {selected.source} · Contact: {selected.contact || '—'} · Received: {selected.received_at}</p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.5rem' }}>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: '0.4rem' }}
            >
              {Object.keys(STATUS_LABELS).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes"
              style={{ flex: 1, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: '0.4rem 0.6rem' }}
            />
            <button className="btn btn-primary btn-sm" onClick={saveDetail} disabled={saving}>SAVE</button>
            <button className="btn btn-sm" onClick={closeDetail}>CLOSE</button>
          </div>
        </div>
      )}
    </div>
  );
}
