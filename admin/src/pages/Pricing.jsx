import { useState, useEffect } from 'react';

const PRICING_API = '/api/pricing';

export default function Pricing() {
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);

  const load = () => {
    fetch(PRICING_API, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => { setTiers(data.tiers || []); })
      .catch(() => setError('Failed to load pricing data'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSave = (tier) => {
    fetch(`${PRICING_API}/${tier.id || 'new'}`, {
      method: tier.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(tier),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(() => { setEditing(null); load(); })
      .catch(() => setError('Failed to save tier'));
  };

  const handleDelete = (id) => {
    if (!confirm('Delete this pricing tier?')) return;
    fetch(`${PRICING_API}/${id}`, { method: 'DELETE', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(() => load())
      .catch(() => setError('Failed to delete'));
  };

  if (loading) return <div className="loading-state">Loading pricing data...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>/ PRICING & LICENSING</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({ id: null, name: '', price: '', type: 'one-time', features: [] })}>
          Add Tier
        </button>
      </div>

      {error && <div className="mb-1"><span className="badge badge-err">ERROR</span> {error}</div>}

      <div className="card mb-2" style={{ borderColor: 'rgba(255,171,0,0.25)', background: 'rgba(255,171,0,0.03)' }}>
        <div className="card-head">STATUS</div>
        <div className="mono-dim" style={{ fontSize: '0.8rem' }}>
          <span className="tag-dot--amber" style={{ width: '6px', height: '6px', borderRadius: '50%', display: 'inline-block', marginRight: '0.35rem', background: 'var(--amber)', boxShadow: '0 0 6px var(--amber)' }} />
          Payment integration is disabled. Enable PAYMENT_ENABLED=true to activate Stripe checkout, license key generation and customer portal.
        </div>
      </div>

      <table className="data-table">
        <thead>
          <tr><th>Name</th><th>Type</th><th>Price (USD)</th><th>Features</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {tiers.length === 0 && (
            <tr><td colSpan="5" className="empty-state">No pricing tiers defined. Add one to get started.</td></tr>
          )}
          {tiers.map((t) => (
            <tr key={t.id} style={{ transition: 'background 0.12s' }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,188,212,0.04)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
              <td className="mono-dim" style={{ fontSize: '0.8rem', color: 'var(--text)' }}>{t.name}</td>
              <td><span className={`badge badge-${t.type === 'subscription' ? 'warn' : 'stable'}`}>{t.type}</span></td>
              <td className="mono-dim">{t.price}</td>
              <td className="dim" style={{ fontSize: '0.75rem', maxWidth: '240px' }}>
                {(t.features || []).slice(0, 3).join(', ')}{(t.features || []).length > 3 ? ` +${t.features.length - 3} more` : ''}
              </td>
              <td>
                <button className="btn btn-sm" onClick={() => setEditing(t)}>Edit</button>
                <button className="btn btn-sm btn-danger" style={{ marginLeft: '0.4rem' }} onClick={() => handleDelete(t.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing !== null && (
        <div className="card mt-1" style={{ borderColor: 'var(--acc)' }}>
          <div className="card-head">{editing.id ? 'Edit Tier' : 'New Tier'}</div>
          <PricingForm
            tier={editing}
            onSave={handleSave}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}
    </div>
  );
}

function PricingForm({ tier, onSave, onCancel }) {
  const [form, setForm] = useState({ ...tier, features: tier.features || [] });
  const [featureInput, setFeatureInput] = useState('');

  const addFeature = () => {
    if (featureInput.trim()) {
      setForm({ ...form, features: [...form.features, featureInput.trim()] });
      setFeatureInput('');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>Name</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Price (USD)</label>
          <input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="e.g. 29.99" />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Type</label>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="one-time">One-Time</option>
            <option value="subscription">Subscription</option>
            <option value="free">Free</option>
          </select>
        </div>
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>Features</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input value={featureInput} onChange={(e) => setFeatureInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addFeature())} placeholder="Add feature..." />
          <button className="btn btn-sm" type="button" onClick={addFeature}>Add</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.5rem' }}>
          {form.features.map((f, i) => (
            <span key={i} className="badge badge-stable" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', cursor: 'default' }}>
              {f}
              <span style={{ cursor: 'pointer', fontSize: '0.65rem' }} onClick={() => setForm({ ...form, features: form.features.filter((_, j) => j !== i) })}>&times;</span>
            </span>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <button className="btn btn-primary btn-sm" onClick={() => onSave(form)} disabled={!form.name.trim() || !form.price.trim()}>
          Save Tier
        </button>
        <button className="btn btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
