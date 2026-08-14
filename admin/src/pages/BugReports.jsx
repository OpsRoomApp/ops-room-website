import { useState, useCallback, useEffect } from 'react';

const API = '/api/v1/bug-reports';

const STATUS_LABELS = { new: 'NEW', open: 'OPEN', closed: 'CLOSED' };
const STATUS_BADGE = { new: 'badge-err', open: 'badge-warn', closed: 'badge-ok' };

function statusBadge(status) {
  return <span className={`badge ${STATUS_BADGE[status] || 'badge-warn'}`}>{STATUS_LABELS[status] || String(status || '?').toUpperCase()}</span>;
}

export default function BugReports() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ new: 0, open: 0, closed: 0, total: 0 });
  const [filters, setFilters] = useState({ status: '', module: '', version: '', q: '', limit: 50, offset: 0 });
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
      if (!next.status && !next.module && !next.version && !next.q) {
        const s = await fetch(`${API}/stats`, { credentials: 'include' }).then((r) => r.json());
        if (s.ok) setCounts(s.counts || counts);
      }
    } catch (err) {
      console.error('Bug reports load failed:', err);
      setError(err?.message || 'Failed to load bug reports');
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
      setError(err?.message || 'Failed to load report detail');
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
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || `HTTP ${resp.status}`);
      setSelected(data.item);
      setNotes(data.item.notes || '');
      setStatus(data.item.status || 'new');
      load();
    } catch (err) {
      setError(err?.message || 'Failed to save report');
    } finally {
      setSaving(false);
    }
  };

  const clearFilters = () => {
    setFilters({ status: '', module: '', version: '', q: '', limit: 50, offset: 0 });
    load({ status: '', module: '', version: '', q: '', limit: 50, offset: 0 });
  };

  const detail = selected;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>/ BUG REPORTS</h1>
        <button className="btn btn-sm" onClick={() => load()} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="card mb-2" style={{ borderColor: 'rgba(255,23,68,0.3)', background: 'rgba(255,23,68,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="badge badge-err">ERROR</span>
            <span className="mono-dim" style={{ fontSize: '0.8rem' }}>{error}</span>
          </div>
        </div>
      )}

      <div className="grid-4 mb-2">
        {[['New', counts.new, 'badge-err'], ['Open', counts.open, 'badge-warn'], ['Closed', counts.closed, 'badge-ok'], ['Total', counts.total, '']].map(([label, value, badge]) => (
          <div className="card" key={label}>
            <div className="card-head" style={{ marginBottom: '0.25rem' }}>{label.toUpperCase()}</div>
            <div className="stat-value" style={{ fontSize: '1.1rem' }}>
              {badge ? <span className={`badge ${badge}`}>{value}</span> : value}
            </div>
          </div>
        ))}
      </div>

      <div className="card mb-2">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end' }}>
          <div style={{ minWidth: '120px', flex: 1 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Status</label>
              <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value, offset: 0 })}>
                <option value="">All</option>
                <option value="new">New</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>
          <div style={{ minWidth: '140px', flex: 1 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Module</label>
              <input value={filters.module} placeholder="e.g. Dispatch" onChange={(e) => setFilters({ ...filters, module: e.target.value, offset: 0 })} />
            </div>
          </div>
          <div style={{ minWidth: '110px', flex: 1 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Version</label>
              <input value={filters.version} placeholder="e.g. 0.25.79" onChange={(e) => setFilters({ ...filters, version: e.target.value, offset: 0 })} />
            </div>
          </div>
          <div style={{ minWidth: '160px', flex: 2 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Search</label>
              <input value={filters.q} placeholder="Report ID, description, contact..." onChange={(e) => setFilters({ ...filters, q: e.target.value, offset: 0 })} />
            </div>
          </div>
          <div style={{ minWidth: '90px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Per page</label>
              <select value={filters.limit} onChange={(e) => setFilters({ ...filters, limit: Number(e.target.value), offset: 0 })}>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-sm btn-primary" onClick={() => load()} disabled={loading}>Apply</button>
            <button className="btn btn-sm" onClick={clearFilters} disabled={loading}>Clear</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="mono-dim" style={{ fontSize: '0.7rem', marginBottom: '0.5rem' }}>
          {total} report{total === 1 ? '' : 's'}
        </div>
        {loading && !items.length && <div className="loading-state">Loading bug reports...</div>}
        {!loading && !items.length && <div className="empty-state">No bug reports match the current filters.</div>}
        {items.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Received (UTC)</th>
                <th>Status</th>
                <th>Report ID</th>
                <th>Version</th>
                <th>Module</th>
                <th>Aircraft</th>
                <th>Airport</th>
                <th>Contact</th>
                <th>Description</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.report_id}>
                  <td className="mono-dim" style={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                    {String(item.received_at || '').slice(0, 16).replace('T', ' ')}
                  </td>
                  <td>{statusBadge(item.status)}</td>
                  <td className="mono-dim" style={{ fontSize: '0.7rem' }}>{item.report_id}</td>
                  <td className="mono-dim" style={{ fontSize: '0.7rem' }}>{item.version || '-'}</td>
                  <td style={{ fontSize: '0.75rem' }}>{item.module || '-'}</td>
                  <td style={{ fontSize: '0.75rem' }}>{item.aircraft || '-'}</td>
                  <td style={{ fontSize: '0.75rem' }}>{item.airport || '-'}</td>
                  <td style={{ fontSize: '0.75rem' }}>{item.contact || '-'}</td>
                  <td className="dim" style={{ fontSize: '0.75rem', maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.user_description || '-'}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-sm" onClick={() => openDetail(item.report_id)}>View</button>
                    {item.diagnosticsIncluded && (
                      <a className="btn btn-sm" style={{ marginLeft: '0.25rem' }}
                        href={`${API}/${encodeURIComponent(item.report_id)}/download`} download>
                        ZIP
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {total > (filters.limit || 50) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem' }}>
            <span className="mono-dim" style={{ fontSize: '0.7rem' }}>
              {filters.offset + 1}-{Math.min(filters.offset + (filters.limit || 50), total)} of {total}
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-sm" disabled={!filters.offset} onClick={() => load({ ...filters, offset: Math.max(0, filters.offset - (filters.limit || 50)) })}>
                Prev
              </button>
              <button className="btn btn-sm" disabled={filters.offset + (filters.limit || 50) >= total}
                onClick={() => load({ ...filters, offset: filters.offset + (filters.limit || 50) })}>
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {detail && (
        <div className="card mb-2" style={{ marginTop: '1.25rem', borderColor: 'rgba(0,188,212,0.25)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div className="card-head" style={{ marginBottom: 0 }}>REPORT {detail.report_id}</div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {detail.diagnosticsIncluded && (
                <a className="btn btn-sm" href={`${API}/${encodeURIComponent(detail.report_id)}/download`} download>
                  Download diagnostics ZIP
                </a>
              )}
              <button className="btn btn-sm" onClick={closeDetail}>Close</button>
            </div>
          </div>

          <div className="grid-2 mb-2">
            <div>
              <div className="section-label" style={{ marginTop: 0 }}>REPORT</div>
              <div className="mono-dim" style={{ fontSize: '0.75rem' }}>
                received = {detail.received_at}<br />
                timestamp = {detail.timestamp_utc || '-'}<br />
                version = {detail.version || '-'} ({detail.build || '-'})<br />
                codename = {detail.codename || '-'}<br />
                module = {detail.module || '-'}<br />
                simulator = {detail.simulator || '-'}<br />
                aircraft = {detail.aircraft || '-'}<br />
                airport = {detail.airport || '-'}<br />
                route = {detail.route || '-'}<br />
                addons = {detail.addons || '-'}<br />
                error = {detail.error_summary || '-'}<br />
                contact = {detail.contact || '-'}<br />
                integration = {detail.integration_summary || '-'}<br />
                zip = {detail.diagnosticsIncluded ? `${detail.zip_filename} (${detail.zip_size_bytes || 0} bytes)` : 'none'}
              </div>
            </div>
            <div>
              <div className="section-label" style={{ marginTop: 0 }}>WHAT HAPPENED</div>
              <div className="dim" style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>{detail.user_description || '-'}</div>
              <div className="section-label">EXPECTED RESULT</div>
              <div className="dim" style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>{detail.expected_result || '-'}</div>
              <div className="section-label">STEPS TO REPRODUCE</div>
              <div className="dim" style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>{detail.steps_to_reproduce || '-'}</div>
            </div>
          </div>

          <div className="section-label">FULL REPORT TEXT</div>
          <pre className="manifest-preview">{detail.report_text || '(no report text)'}</pre>

          <div className="grid-2" style={{ marginTop: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="new">New</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Notes</label>
              <textarea value={notes} rows={4} placeholder="Internal notes about this report..." onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-sm btn-primary" onClick={saveDetail} disabled={saving}>
              {saving ? 'Saving...' : 'Save status & notes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
