import { useState, useCallback, useEffect } from 'react';

const API = '/api/v1/roadmap';

const STATUS_LABELS = { planned: 'PLANNED', in_progress: 'IN PROGRESS', completed: 'COMPLETED' };
const STATUS_BADGE = { planned: 'badge-warn', in_progress: 'badge-stable', completed: 'badge-ok' };

function statusBadge(status) {
  return <span className={`badge ${STATUS_BADGE[status] || 'badge-warn'}`}>{STATUS_LABELS[status] || String(status || '?').toUpperCase()}</span>;
}

export default function Roadmap() {
  const [data, setData] = useState({ current_sprint: '', revision: 0, items: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [sprint, setSprint] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newStatus, setNewStatus] = useState('planned');
  const [publishStatus, setPublishStatus] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(API, { credentials: 'include' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const body = await resp.json();
      if (!body.ok) throw new Error(body.message || 'Failed to load roadmap');
      setData(body);
      setSprint(body.current_sprint || '');
    } catch (err) {
      console.error('Roadmap load failed:', err);
      setError(err?.message || 'Failed to load roadmap');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const api = async (path, options = {}) => {
    const resp = await fetch(`${API}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const body = await resp.json();
    if (!body.ok) throw new Error(body.message || 'Request failed');
    return body;
  };

  const addItem = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api('/items', { method: 'POST', body: JSON.stringify({ title: newTitle, status: newStatus }) });
      setNewTitle('');
      setNewStatus('planned');
      await load();
    } catch (err) {
      setError(err?.message || 'Failed to add item');
    } finally {
      setSaving(false);
    }
  };

  const updateItem = async (id, patch) => {
    setError('');
    try {
      await api(`/items/${id}`, { method: 'PUT', body: JSON.stringify(patch) });
      await load();
    } catch (err) {
      setError(err?.message || 'Failed to update item');
    }
  };

  const deleteItem = async (id) => {
    if (!confirm(`Delete this roadmap item?`)) return;
    setError('');
    try {
      await api(`/items/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err?.message || 'Failed to delete item');
    }
  };

  const saveSprint = async () => {
    setError('');
    setSaving(true);
    try {
      await api('/meta', { method: 'PUT', body: JSON.stringify({ current_sprint: sprint }) });
      await load();
    } catch (err) {
      setError(err?.message || 'Failed to save sprint');
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    setError('');
    setPublishStatus('Publishing...');
    try {
      const body = await api('/publish', { method: 'POST', body: JSON.stringify({}) });
      setPublishStatus(body.queued ? `Queued for Discord (queue #${body.queue_id}).` : `Discord unavailable: ${body.message || 'not queued'}`);
    } catch (err) {
      setPublishStatus(`Error: ${err?.message}`);
    }
  };

  const orderItems = (status) => data.items.filter((i) => i.status === status);

  const renderGroup = (status) => (
    <div className="card">
      <div className="card-head">{STATUS_LABELS[status]} ({orderItems(status).length})</div>
      {orderItems(status).length === 0 ? (
        <p style={{ opacity: 0.6 }}>No items.</p>
      ) : (
        orderItems(status).map((item) => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.45rem 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ flex: 1 }}>{item.title}</span>
            {item.sprint && <span className="badge badge-stable">{item.sprint}</span>}
            <select
              value={item.status}
              onChange={(e) => updateItem(item.id, { status: e.target.value })}
              style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: '0.2rem 0.4rem' }}
            >
              {Object.keys(STATUS_LABELS).map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
            <button className="btn btn-sm" title="Move up" onClick={() => updateItem(item.id, { sort_order: (item.sort_order || 0) - 1 })}>▲</button>
            <button className="btn btn-sm" title="Move down" onClick={() => updateItem(item.id, { sort_order: (item.sort_order || 0) + 1 })}>▼</button>
            <button className="btn btn-sm btn-danger" onClick={() => deleteItem(item.id)}>Delete</button>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div>
      <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>ROADMAP (revision {data.revision})</span>
        <button className="btn btn-primary btn-sm" onClick={publish} disabled={saving}>PUBLISH TO DISCORD</button>
      </div>
      {publishStatus && <p style={{ color: 'var(--amber)' }}>{publishStatus}</p>}
      {error && <p style={{ color: 'var(--red)' }}>{error}</p>}
      {loading ? <p>Loading...</p> : (
        <>
          <div className="card">
            <div className="card-head">CURRENT SPRINT</div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                value={sprint}
                onChange={(e) => setSprint(e.target.value)}
                placeholder="e.g. v0.26 Development"
                style={{ flex: 1, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: '0.45rem 0.6rem' }}
              />
              <button className="btn btn-sm" onClick={saveSprint} disabled={saving}>SAVE SPRINT</button>
            </div>
          </div>

          <div className="card">
            <div className="card-head">ADD ITEM</div>
            <form onSubmit={addItem} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Item title"
                required
                style={{ flex: 1, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: '0.45rem 0.6rem' }}
              />
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: '0.45rem 0.4rem' }}
              >
                {Object.keys(STATUS_LABELS).map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
              <button className="btn btn-primary btn-sm" type="submit" disabled={saving}>ADD</button>
            </form>
          </div>

          {renderGroup('planned')}
          {renderGroup('in_progress')}
          {renderGroup('completed')}
        </>
      )}
    </div>
  );
}
