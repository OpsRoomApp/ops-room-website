import { useEffect, useMemo, useRef, useState } from 'react';

/* Realistic VATSIM feed used to populate the widget on the homepage.
   Callsigns, aircraft types, ICAO pairs and statuses are the real ones
   the source OPS ROOM FIDS module renders; values are static here. */
const FEEDS = {
  EGLL: {
    name: 'London Heathrow',
    metar: 'EGLL 140950Z 24008KT 9999 FEW040 BKN180 14/08 Q1015',
    atis: { dep: 'INFO C  RWY 27L  QNH 1015  VIS 10KM', arr: 'INFO C  RWY 27L  QNH 1015  VIS 10KM' },
    departures: [
      { cs: 'BAW472',  ac: 'B77W', dest: 'KJFK', etd: '14:20Z', flt: 'CRZ',   status: 'AIRBORNE',  alt: 'FL360', spd: '487 KT' },
      { cs: 'BAW274',  ac: 'A35K', dest: 'KBOS', etd: '14:35Z', flt: 'CRZ',   status: 'AIRBORNE',  alt: 'FL370', spd: '492 KT' },
      { cs: 'VIR25X',  ac: 'A35K', dest: 'KBOS', etd: '15:05Z', flt: 'TAXOUT', status: 'PUSHBACK', alt: '----',  spd: '----' },
      { cs: 'BAW117',  ac: 'B789', dest: 'KSFO', etd: '15:30Z', flt: 'STD',   status: 'BOARDING', alt: '----',  spd: '----' },
      { cs: 'AAL100',  ac: 'B789', dest: 'KORD', etd: '16:10Z', flt: 'STD',   status: 'PREFILE',  alt: '----',  spd: '----' },
      { cs: 'BAW215',  ac: 'B789', dest: 'CYEG', etd: '17:00Z', flt: 'STD',   status: 'PREFILE',  alt: '----',  spd: '----' },
    ],
    arrivals: [
      { cs: 'UAE237',  ac: 'B388', orig: 'OMDB', eta: '12:55Z', flt: 'DSC',  status: 'APPROACH',  alt: '040',   spd: '168 KT' },
      { cs: 'KLM643',  ac: 'B789', orig: 'EHAM', eta: '13:42Z', flt: 'ARR',  status: 'TAXI IN',   alt: '----',  spd: '----' },
      { cs: 'SIA308',  ac: 'A35K', orig: 'WSSS', eta: '14:08Z', flt: 'DSC',  status: 'FINAL',     alt: '018',   spd: '152 KT' },
      { cs: 'QFA011',  ac: 'B789', orig: 'YSSY', eta: '14:18Z', flt: 'DSC',  status: 'APPROACH',  alt: '060',   spd: '232 KT' },
      { cs: 'BAW178',  ac: 'B77W', orig: 'KORD', eta: '14:31Z', flt: 'CRZ',  status: 'INBOUND',   alt: 'FL240', spd: '420 KT' },
      { cs: 'DLH906',  ac: 'A359', orig: 'EDDF', eta: '15:02Z', flt: 'CRZ',  status: 'INBOUND',   alt: 'FL260', spd: '438 KT' },
    ],
    prefiles: [
      { cs: 'BAW84R', ac: 'A35K', dest: 'LIRA', etd: '16:55Z' },
      { cs: 'BAW88T', ac: 'B77W', dest: 'OMDB', etd: '21:30Z' },
      { cs: 'BAW46E', ac: 'B789', dest: 'KSFO', etd: '22:10Z' },
      { cs: 'VIR12A', ac: 'A35K', dest: 'KBOS', etd: '17:25Z' },
      { cs: 'VIR84Q', ac: 'B789', dest: 'KJFK', etd: '19:45Z' },
    ],
  },
  EHAM: {
    name: 'Amsterdam Schiphol',
    metar: 'EHAM 140955Z 27012KT 9999 SCT035 BKN090 13/07 Q1014',
    atis: { dep: 'INFO B  RWY 18R  QNH 1014  VIS 10KM', arr: 'INFO B  RWY 18R  QNH 1014  VIS 10KM' },
    departures: [
      { cs: 'KLM643', ac: 'B789', dest: 'KATL', etd: '14:05Z', flt: 'CRZ',  status: 'AIRBORNE', alt: 'FL380', spd: '494 KT' },
      { cs: 'KLM705', ac: 'B789', dest: 'KMIA', etd: '14:35Z', flt: 'CRZ',  status: 'AIRBORNE', alt: 'FL360', spd: '486 KT' },
      { cs: 'EIN12A', ac: 'A20N', dest: 'LIRA', etd: '16:30Z', flt: 'STD',  status: 'BOARDING', alt: '----',  spd: '----' },
      { cs: 'RYR88R', ac: 'B738', dest: 'LIRA', etd: '16:45Z', flt: 'STD',  status: 'PUSHBACK', alt: '----',  spd: '----' },
      { cs: 'KLM617', ac: 'B77W', dest: 'KMIA', etd: '17:10Z', flt: 'STD',  status: 'PREFILE',  alt: '----',  spd: '----' },
    ],
    arrivals: [
      { cs: 'DLH4NF', ac: 'A359', orig: 'EDDF', eta: '14:55Z', flt: 'DSC', status: 'FINAL',     alt: '015',   spd: '146 KT' },
      { cs: 'BAW274', ac: 'A35K', orig: 'EGKK', eta: '15:34Z', flt: 'CRZ', status: 'INBOUND',   alt: 'FL240', spd: '418 KT' },
      { cs: 'AFR1240', ac: 'A220', orig: 'LFPO', eta: '16:02Z', flt: 'CRZ', status: 'INBOUND',   alt: 'FL280', spd: '442 KT' },
      { cs: 'EIN165',  ac: 'A320', orig: 'EIDW', eta: '16:18Z', flt: 'DSC', status: 'APPROACH',  alt: '050',   spd: '228 KT' },
    ],
    prefiles: [
      { cs: 'KLM881', ac: 'B789', dest: 'PHNL', etd: '21:00Z' },
      { cs: 'EIN72D', ac: 'A320', dest: 'LIPB', etd: '14:20Z' },
      { cs: 'TRA6062', ac: 'B738', dest: 'ENBO', etd: '14:05Z' },
    ],
  },
  KATL: {
    name: 'Atlanta Hartsfield-Jackson',
    metar: 'KATL 140953Z 27010KT 10SM SCT050 BKN250 19/12 A3002',
    atis: { dep: 'INFO N  RWY 27L  QNH 3002  VIS 10SM', arr: 'INFO N  RWY 27L  QNH 3002  VIS 10SM' },
    departures: [
      { cs: 'DAL1270', ac: 'B739', dest: 'KDFW', etd: '14:30Z', flt: 'CRZ', status: 'AIRBORNE', alt: 'FL380', spd: '488 KT' },
      { cs: 'AAL1021', ac: 'A321', dest: 'KMIA', etd: '14:55Z', flt: 'CRZ', status: 'AIRBORNE', alt: 'FL360', spd: '482 KT' },
      { cs: 'DLH4NF',  ac: 'A359', dest: 'EDDF', etd: '14:40Z', flt: 'CRZ', status: 'AIRBORNE', alt: 'FL380', spd: '494 KT' },
      { cs: 'ACA898',  ac: 'B789', dest: 'CYYZ', etd: '15:20Z', flt: 'STD', status: 'BOARDING', alt: '----',  spd: '----' },
    ],
    arrivals: [
      { cs: 'ACA891',  ac: 'B789', orig: 'CYYZ', eta: '14:24Z', flt: 'DSC', status: 'APPROACH', alt: '045',   spd: '164 KT' },
      { cs: 'SKW3444', ac: 'CRJ9', orig: 'KORD', eta: '14:32Z', flt: 'DSC', status: 'FINAL',    alt: '012',   spd: '138 KT' },
      { cs: 'JBU584',  ac: 'A321', orig: 'KMCO', eta: '14:46Z', flt: 'DSC', status: 'INBOUND',  alt: '070',   spd: '262 KT' },
      { cs: 'AAL1844', ac: 'A321', orig: 'KCLT', eta: '14:51Z', flt: 'DSC', status: 'APPROACH', alt: '035',   spd: '158 KT' },
    ],
    prefiles: [
      { cs: 'DAL86',  ac: 'A359', dest: 'EHAM', etd: '17:45Z' },
      { cs: 'AAL50',  ac: 'B77W', dest: 'EGLL', etd: '20:55Z' },
    ],
  },
};

const AIRPORT_KEYS = Object.keys(FEEDS);

function zuluNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
}

export default function VatsimFIDS({ defaultAirport = 'EGLL' }) {
  const [airport, setAirport] = useState(defaultAirport);
  const [tab, setTab] = useState('departures');
  const [clock, setClock] = useState(zuluNow());
  const inputRef = useRef(null);

  useEffect(() => {
    const id = setInterval(() => setClock(zuluNow()), 1000);
    return () => clearInterval(id);
  }, []);

  const feed = FEEDS[airport] || FEEDS[defaultAirport];

  const cols = useMemo(() => {
    if (tab === 'departures') return [
      { key: 'cs',     label: 'CALLSIGN' },
      { key: 'ac',     label: 'ACFT' },
      { key: 'dest',   label: 'DEST' },
      { key: 'etd',    label: 'ETD' },
      { key: 'flt',    label: 'FLT PHASE' },
      { key: 'status', label: 'STATUS' },
    ];
    if (tab === 'arrivals') return [
      { key: 'cs',     label: 'CALLSIGN' },
      { key: 'ac',     label: 'ACFT' },
      { key: 'orig',   label: 'ORIGIN' },
      { key: 'eta',    label: 'ETA' },
      { key: 'flt',    label: 'FLT PHASE' },
      { key: 'status', label: 'STATUS' },
    ];
    return [
      { key: 'cs',   label: 'CALLSIGN' },
      { key: 'ac',   label: 'ACFT' },
      { key: 'dest', label: 'DEST' },
      { key: 'etd',  label: 'ETD' },
    ];
  }, [tab]);

  const rows = tab === 'departures' ? feed.departures
            : tab === 'arrivals'   ? feed.arrivals
            : feed.prefiles;

  const counts = {
    departures: feed.departures.length,
    arrivals: feed.arrivals.length,
    prefiles: feed.prefiles.length,
  };

  return (
    <div className="fids">
      <div className="fids-topbar">
        <div className="fids-eyebrow">
          <span className="tag-dot" /> OPS ROOM / VATSIM FIDS
        </div>
        <div className="fids-clock">
          <span className="clock-label">UTC</span>
          <span className="clock-value">{clock}</span>
        </div>
      </div>

      <div className="fids-airport">
        <div className="fids-airport-flap">{airport}</div>
        <div className="fids-airport-name">{feed.name.toUpperCase()}</div>
      </div>

      <div className="fids-metar">
        <span className="metar-label">METAR</span>
        <span className="metar-line">{feed.metar}</span>
      </div>

      <div className="fids-atis">
        <span className="atis-cell"><b>DEP</b> {feed.atis.dep}</span>
        <span className="atis-cell"><b>ARR</b> {feed.atis.arr}</span>
      </div>

      <div className="fids-search">
        <label htmlFor="fids-airport-input" className="lbl">AIRPORT</label>
        <input
          id="fids-airport-input"
          ref={inputRef}
          type="text"
          spellCheck={false}
          autoComplete="off"
          maxLength={4}
          defaultValue={airport}
          placeholder="ICAO"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const v = (e.target.value || '').toUpperCase().trim();
              if (FEEDS[v]) setAirport(v);
            }
          }}
          onBlur={(e) => {
            const v = (e.target.value || '').toUpperCase().trim();
            if (FEEDS[v]) setAirport(v);
            else e.target.value = airport;
          }}
          list="fids-airport-list"
          aria-label="Airport ICAO code"
        />
        <datalist id="fids-airport-list">
          {AIRPORT_KEYS.map((k) => <option key={k} value={k}>{FEEDS[k].name}</option>)}
        </datalist>
        <div className="fids-search-help">PRESS ENTER OR TAB TO LOAD</div>
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
        <table className="fids-table">
          <thead>
            <tr>{cols.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const accentState = (() => {
                const s = r.status || '';
                if (/AIRBORNE|TAXI|APPROACH|FINAL|INBOUND/.test(s)) return 'ok';
                if (/BOARDING|PUSHBACK/.test(s)) return 'amber';
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
      </div>

      <div className="fids-footer">
        <span><span className="tag-dot" /> STATUS TABLE LOADED</span>
        <span>SOURCE · VATSIM NETWORK</span>
        <span className="muted">SIMULATION USE ONLY</span>
      </div>
    </div>
  );
}
