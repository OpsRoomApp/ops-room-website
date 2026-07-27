import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import useVatsimData from '../hooks/useVatsimData.js';

const PRESET_AIRPORTS = ['EGLL', 'KORD', 'EHAM', 'KATL', 'KJFK', 'EDDF', 'LFPG', 'OMDB', 'WSSS', 'RJTT', 'KBOS', 'KLAX'];

function zuluNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
}

function altitudeStr(alt) {
  if (!alt || alt <= 0) return '----';
  if (alt < 100) return String(Math.round(alt)).padStart(3, '0');
  if (alt >= 18000) return `FL${String(Math.round(alt / 100)).padStart(3, '0')}`;
  return String(Math.round(alt));
}

function speedStr(gs) {
  if (!gs || gs <= 0) return '----';
  return `${gs} KT`;
}

function acShort(ac) {
  if (!ac) return '----';
  return ac.length <= 4 ? ac : ac.slice(0, 5);
}

export default function VatsimFIDS({ defaultAirport = 'EGLL' }) {
  const [airport, setAirport] = useState(defaultAirport);
  const [tab, setTab] = useState('departures');
  const [clock, setClock] = useState(zuluNow());
  const [searchVal, setSearchVal] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const inputRef = useRef(null);
  const suggestionTimer = useRef(null);

  const feed = useVatsimData(airport);

  useEffect(() => {
    const id = setInterval(() => setClock(zuluNow()), 1000);
    return () => clearInterval(id);
  }, []);

  // Airport search: combine presets with airports found in VATSIM data
  const handleSearchInput = useCallback((val) => {
    setSearchVal(val);
    if (suggestionTimer.current) clearTimeout(suggestionTimer.current);
    if (val.length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    suggestionTimer.current = setTimeout(() => {
      const upper = val.toUpperCase();
      // Build suggestion list from presets + airports with active traffic in the feed
      const fromFeed = new Set();
      if (!feed.loading) {
        [...feed.departures, ...feed.arrivals, ...feed.prefiles].forEach((p) => {
          const fp = p.flight_plan || {};
          if (fp.departure) fromFeed.add(fp.departure);
          if (fp.arrival) fromFeed.add(fp.arrival);
        });
      }
      const allAirports = [...new Set([...PRESET_AIRPORTS, ...fromFeed])];
      const matches = allAirports
        .filter((a) => a.startsWith(upper))
        .slice(0, 8);
      setSuggestions(matches);
      setShowSuggestions(matches.length > 0);
    }, 100);
  }, [feed]);

  const selectAirport = useCallback((icao) => {
    setAirport(icao);
    setSearchVal('');
    setShowSuggestions(false);
    setSuggestions([]);
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      const v = (e.target.value || '').toUpperCase().trim();
      if (v.length === 4) selectAirport(v);
    }
  }, [selectAirport]);

  // Build table rows from real data
  const rows = useMemo(() => {
    if (feed.loading) return [];
    const list = tab === 'departures' ? feed.departures
              : tab === 'arrivals'   ? feed.arrivals
              : feed.prefiles;
    return list.map((p) => {
      const fp = p.flight_plan || {};
      const ac = acShort(fp.aircraft || p.planned_aircraft || '');
      const dest = fp.arrival || p.planned_destairport || '----';
      const orig = fp.departure || p.planned_depairport || '----';
      const phase = (() => {
        const alt = p.altitude || 0;
        const gs = p.groundspeed || 0;
        if (gs < 5 && alt < 50) return 'STD';
        if (gs < 30 && alt < 500) return 'TAXOUT';
        if (alt > 0 && alt < 10000) return 'CLB';
        if (alt >= 10000) return 'CRZ';
        return 'STD';
      })();
      const status = (() => {
        const alt = p.altitude || 0;
        const gs = p.groundspeed || 0;
        if (alt >= 10000 && gs > 100) return 'AIRBORNE';
        if (gs < 5 && alt < 50) return 'PREFILE';
        if (gs < 30 && alt < 500) return 'TAXI';
        if (alt < 3000 && gs > 0) return 'CLIMB';
        return 'AIRBORNE';
      })();
      return {
        cs: p.callsign || '----',
        ac,
        dest,
        orig,
        etd: fp.deptime ? fp.deptime.slice(0, 4) + 'Z' : '----',
        eta: fp.eet ? 'ETA' : '----',
        flt: phase,
        status,
        alt: altitudeStr(p.altitude),
        spd: speedStr(p.groundspeed),
      };
    });
  }, [feed, tab]);

  const counts = {
    departures: feed.departures.length,
    arrivals: feed.arrivals.length,
    prefiles: feed.prefiles.length,
  };

  const cols = useMemo(() => {
    if (tab === 'departures') return [
      { key: 'cs',     label: 'CALLSIGN' },
      { key: 'ac',     label: 'ACFT' },
      { key: 'dest',   label: 'DEST' },
      { key: 'etd',    label: 'ETD' },
      { key: 'flt',    label: 'PHASE' },
      { key: 'alt',    label: 'ALT' },
      { key: 'spd',    label: 'SPD' },
      { key: 'status', label: 'STATUS' },
    ];
    if (tab === 'arrivals') return [
      { key: 'cs',     label: 'CALLSIGN' },
      { key: 'ac',     label: 'ACFT' },
      { key: 'orig',   label: 'ORIGIN' },
      { key: 'eta',    label: 'ETA' },
      { key: 'flt',    label: 'PHASE' },
      { key: 'alt',    label: 'ALT' },
      { key: 'spd',    label: 'SPD' },
      { key: 'status', label: 'STATUS' },
    ];
    return [
      { key: 'cs',   label: 'CALLSIGN' },
      { key: 'ac',   label: 'ACFT' },
      { key: 'dest', label: 'DEST' },
      { key: 'etd',  label: 'ETD' },
    ];
  }, [tab]);

  return (
    <div className="fids">
      <div className="fids-topbar">
        <div className="fids-eyebrow">
          <span className="tag-dot" /> OPS ROOM / VATSIM FIDS
        </div>
        <div className="fids-clock">
          <span className="clock-label">AGE {feed.age}s</span>
          <span className="clock-value">{clock}</span>
        </div>
      </div>

      <div className="fids-airport">
        <div className="fids-airport-flap">{airport}</div>
        <div className="fids-airport-name">
          {feed.loading ? 'LOADING...' : `${counts.departures + counts.arrivals} ACFT`}
        </div>
      </div>

      <div className="fids-metar">
        <span className="metar-label">ATIS</span>
        <span className="metar-line">
          {feed.metar
            ? feed.metar.slice(0, 120)
            : feed.loading
              ? 'FETCHING...'
              : 'NO ATIS AVAILABLE'}
        </span>
      </div>

      <div className="fids-atis">
        <span className="atis-cell"><b>DEP</b> {feed.atis.dep || 'NO ATIS AVAILABLE'}</span>
        <span className="atis-cell"><b>ARR</b> {feed.atis.arr || 'NO ATIS AVAILABLE'}</span>
      </div>

      <div className="fids-search" style={{ position: 'relative' }}>
        <label htmlFor="fids-airport-input" className="lbl">AIRPORT</label>
        <input
          id="fids-airport-input"
          ref={inputRef}
          type="text"
          spellCheck={false}
          autoComplete="off"
          maxLength={4}
          value={searchVal}
          placeholder={airport}
          onChange={(e) => handleSearchInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          aria-label="Airport ICAO code"
        />
        {showSuggestions && suggestions.length > 0 && (
          <div className="fids-suggestions" style={{
            position: 'absolute', top: '100%', right: '0.95rem',
            background: 'var(--bg-elevated)', border: '1px solid var(--line-strong)',
            zIndex: 10, minWidth: '100px', fontFamily: 'var(--font-mono)', fontSize: '12px',
          }}>
            {suggestions.map((s) => (
              <div
                key={s}
                onMouseDown={(e) => { e.preventDefault(); selectAirport(s); }}
                style={{ padding: '0.4rem 0.7rem', cursor: 'pointer', color: 'var(--fg-soft)', borderBottom: '1px solid var(--line-inset)' }}
              >
                {s}
              </div>
            ))}
          </div>
        )}
        <div className="fids-search-help">TYPE ICAO AND PRESS ENTER TO LOAD</div>
      </div>

      <nav className="fids-tabs" aria-label="Traffic tabs">
        {[
          { id: 'departures', label: 'Departures', n: counts.departures },
          { id: 'arrivals',   label: 'Arrivals',   n: counts.arrivals },
          { id: 'prefiles',   label: 'Prefiles',   n: counts.prefiles },
        ].map((t) => (
          <button
            key={t.id}
            className={`fids-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
            type="button"
          >
            {t.label} <span className="fids-tab-n">{t.n}</span>
          </button>
        ))}
      </nav>

      <div className="fids-table-wrap">
        {feed.loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
            FETCHING VATSIM DATA...
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
            NO TRAFFIC FOR {airport}
          </div>
        ) : (
          <table className="fids-table">
            <thead>
              <tr>{cols.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const accentState = (() => {
                  const s = r.status || '';
                  if (/AIRBORNE|TAXI|CLIMB/.test(s)) return 'ok';
                  return 'muted';
                })();
                return (
                  <tr key={`${r.cs}-${i}`}>
                    {cols.map((c, j) => {
                      const value = String(r[c.key] ?? '----');
                      const mono = j === 0 ? 'mono-bold' : '';
                      const acc = j === cols.length - 1 ? `cell-${accentState}` : '';
                      return <td key={c.key} className={`${mono} ${acc}`}>{value}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="fids-footer">
        <span><span className="tag-dot" /> LIVE VATSIM DATA</span>
        <span>SOURCE · VATSIM NETWORK</span>
        <span className="muted">SIMULATION USE ONLY</span>
      </div>
    </div>
  );
}
