import { useState } from 'react';

const API = '/api/discord';
const HEADERS = { 'Content-Type': 'application/json' };

export default function DiscordUsers() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState(null);

  const fetchApi = async (path, opts = {}) => {
    const resp = await fetch(`${API}${path}`, { headers: HEADERS, credentials: 'include', ...opts });
    if (!resp.ok) throw new Error(`${resp.status}: ${resp.statusText}`);
    return resp.json();
  };

  const doSearch = async () => {
    setLoading(true);
    setError('');
    setProfile(null);
    try {
      const data = await fetchApi(`/users?search=${encodeURIComponent(search)}`);
      setResults(data);
    } catch (e) {
      setError(`Search failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const viewProfile = async (discordId) => {
    setLoading(true);
    try {
      const [data, modData] = await Promise.all([
        fetchApi(`/users/${discordId}`),
        fetchApi(`/moderation-cases?user_id=${discordId}`).catch(() => null),
      ]);
      setProfile({ ...data, moderation_cases: modData?.cases || [] });
    } catch (e) {
      setError(`Profile load failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">/ USER MANAGEMENT</h1>

      <div className="card mb-2">
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <input
              className="input"
              placeholder="Search username or display name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doSearch(); }}
            />
          </div>
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

      <div className="grid-2 mb-2">
        <div className="card">
          <div className="card-head">SEARCH RESULTS ({results.length})</div>
          <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
            {results.map((r) => (
              <div key={r.discord_id} style={{ padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.8rem', cursor: 'pointer' }} onClick={() => viewProfile(r.discord_id)}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span className="mono-dim">{r.discord_id}</span>
                  <span>{r.display_name || r.username}</span>
                  <span className={`badge ${r.beta_status ? 'badge-ok' : ''}`}>{r.beta_status ? 'BETA' : ''}</span>
                  <span className={`badge ${r.is_active ? 'badge-ok' : 'badge-warn'}`}>{r.is_active ? 'Active' : 'Inactive'}</span>
                </div>
                <div style={{ fontSize: '0.7rem' }} className="dim">
                  {r.simulator || 'No sim'} | {r.network || 'No network'} | v{r.opsroom_version || '-'}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head">PROFILE</div>
          {profile ? (
            <div style={{ fontSize: '0.8rem' }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <div className="dim">Discord ID</div>
                <div className="mono-dim">{profile.discord_id}</div>
              </div>
              <div style={{ marginBottom: '0.5rem' }}>
                <div className="dim">Username</div>
                <div>{profile.username}</div>
              </div>
              {profile.display_name && profile.display_name !== profile.username && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <div className="dim">Display Name</div>
                  <div>{profile.display_name}</div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <div><div className="dim">Simulator</div><div>{profile.simulator || '-'}</div></div>
                <div><div className="dim">Network</div><div>{profile.network || '-'}</div></div>
                <div><div className="dim">OPS ROOM Version</div><div>{profile.opsroom_version || '-'}</div></div>
                <div><div className="dim">Beta Tester</div><div><span className={`badge ${profile.beta_status ? 'badge-ok' : ''}`}>{profile.beta_status ? 'YES' : 'NO'}</span></div></div>
              </div>
              <div style={{ marginBottom: '0.5rem' }}>
                <div className="dim">First Seen</div><div>{profile.first_joined?.slice(0, 19)}</div>
              </div>
              <div style={{ marginBottom: '0.5rem' }}>
                <div className="dim">Last Seen</div><div>{profile.last_seen?.slice(0, 19)}</div>
              </div>
              <div style={{ marginBottom: '0.5rem' }}>
                <div className="dim">Flights Logged</div><div>{profile.flights_logged}</div>
              </div>
              {profile.simbrief && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <div className="dim">SimBrief</div><div>{profile.simbrief.username || '-'}</div>
                </div>
              )}
              {profile.recent_tickets?.length > 0 && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <div className="dim">Recent Tickets</div>
                  {profile.recent_tickets.map((t) => (
                    <div key={t.id} style={{ fontSize: '0.7rem' }} className="mono-dim">#{t.id} {t.subject} [{t.status}]</div>
                  ))}
                </div>
              )}
              {profile.moderation_cases?.length > 0 && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <div className="dim" style={{ marginBottom: '0.25rem' }}>Moderation History ({profile.moderation_cases.length})</div>
                  {profile.moderation_cases.map((c) => (
                    <div key={c.id} style={{ fontSize: '0.7rem', padding: '0.25rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <span className="mono-dim" style={{ color: 'var(--acc)' }}>{c.action_type}</span>
                      <span className="dim"> · {c.created_at?.slice(0, 16)}</span>
                      {c.active ? <span className="badge badge-warn" style={{ marginLeft: '0.4rem' }}>ACTIVE</span> : null}
                      <div className="dim" style={{ fontSize: '0.65rem' }}>{c.reason || ''}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="dim" style={{ fontSize: '0.8rem' }}>Click a user from search results to view profile.</div>
          )}
        </div>
      </div>
    </div>
  );
}
