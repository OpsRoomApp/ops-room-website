import { useState } from 'react';

const API = '/api/discord';
const HEADERS = { 'Content-Type': 'application/json' };

export default function BetaTesters() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showBetaOnly, setShowBetaOnly] = useState(false);

  const fetchApi = async (path, opts = {}) => {
    const resp = await fetch(`${API}${path}`, { headers: HEADERS, credentials: 'include', ...opts });
    if (!resp.ok) throw new Error(`${resp.status}: ${resp.statusText}`);
    return resp.json();
  };

  const doSearch = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchApi(`/beta-testers?search=${encodeURIComponent(search)}${showBetaOnly ? '&beta_only=true' : ''}`);
      setResults(data);
    } catch (e) {
      setError(`Search failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (discordId, action) => {
    try {
      await fetchApi(`/beta-testers/${discordId}`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      doSearch();
    } catch (e) {
      alert(`Action failed: ${e.message}`);
    }
  };

  return (
    <div>
      <h1 className="page-title">/ BETA TESTER MANAGEMENT</h1>

      <div className="card mb-2">
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label className="dim" style={{ fontSize: '0.7rem', display: 'block', marginBottom: '0.25rem' }}>Search Discord Username</label>
            <input
              className="input"
              placeholder="Username or display name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doSearch(); }}
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={showBetaOnly} onChange={(e) => setShowBetaOnly(e.target.checked)} />
            Beta Only
          </label>
          <button className="btn btn-primary" onClick={doSearch} disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>

      {error && (
        <div className="card mb-2" style={{ borderColor: 'rgba(255,59,48,0.3)', background: 'rgba(255,59,48,0.05)' }}>
          <span style={{ color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{error}</span>
        </div>
      )}

      <div className="card">
        <div className="card-head">RESULTS ({results.length})</div>
        <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
          {results.map((r) => (
            <div key={r.discord_id} style={{ padding: '0.6rem 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.8rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.25rem' }}>
                <span className="mono-dim">{r.discord_id}</span>
                <span>{r.display_name || r.username}</span>
                <span className={`badge ${r.beta_status ? 'badge-ok' : ''}`}>
                  {r.beta_status ? 'VERIFIED TESTER' : 'Not a tester'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.7rem', marginBottom: '0.25rem' }}>
                <span className="dim">Sim: {r.simulator || '-'}</span>
                <span className="dim">Net: {r.network || '-'}</span>
                <span className="dim">Ver: {r.opsroom_version || '-'}</span>
              </div>
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                {r.beta_status ? (
                  <>
                    <button className="btn btn-sm" onClick={() => handleUpdate(r.discord_id, 'remove_verified')} style={{ color: 'var(--red)' }}>
                      Remove Verified Tester
                    </button>
                    <button className="btn btn-sm" onClick={() => handleUpdate(r.discord_id, 'remove_beta')} style={{ color: 'var(--red)' }}>
                      Remove Public Beta
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-sm" onClick={() => handleUpdate(r.discord_id, 'add_verified')}>
                      Add Verified Tester
                    </button>
                    <button className="btn btn-sm" onClick={() => handleUpdate(r.discord_id, 'add_beta')}>
                      Add Public Beta
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
