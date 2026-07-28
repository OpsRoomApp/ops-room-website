import { useState, useEffect, useRef, useCallback } from 'react';

const VATSIM_DATA_URL = 'https://data.vatsim.net/v3/vatsim-data.json';
const CACHE_SECONDS = 15;

let _globalCache = null;
let _globalCacheTime = 0;
let _globalCacheError = null;
let _pendingFetch = null;

export function fetcher() {
  const now = Date.now();
  if (_globalCache && (now - _globalCacheTime) / 1000 < CACHE_SECONDS) {
    return Promise.resolve({ data: _globalCache, age: (now - _globalCacheTime) / 1000 });
  }
  if (_pendingFetch) return _pendingFetch;

  _pendingFetch = fetch(VATSIM_DATA_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`VATSIM API ${res.status}`);
      return res.json();
    })
    .then((data) => {
      _globalCache = data;
      _globalCacheTime = Date.now();
      _globalCacheError = null;
      _pendingFetch = null;
      return { data, age: 0 };
    })
    .catch((err) => {
      _globalCacheError = err.message;
      _pendingFetch = null;
      if (_globalCache) {
        return { data: _globalCache, age: (Date.now() - _globalCacheTime) / 1000, error: err.message };
      }
      throw err;
    });

  return _pendingFetch;
}

/**
 * Extract pilots filtered by departure, arrival, or prefiles for a given ICAO.
 */
function filterPilots(data, icao) {
  if (!data || !icao) return { departures: [], arrivals: [], prefiles: [], atisList: [], metar: null };

  const icaoUpper = icao.toUpperCase();

  const departures = (data.pilots || []).filter(
    (p) => (p.flight_plan && p.flight_plan.departure === icaoUpper)
  );

  const arrivals = (data.pilots || []).filter(
    (p) => (p.flight_plan && p.flight_plan.arrival === icaoUpper)
  );

  const prefiles = (data.prefiles || []).filter(
    (p) => (p.flight_plan && p.flight_plan.departure === icaoUpper)
  );

  // Extract ATIS from controllers serving this airport
  const atisList = (data.controllers || []).filter(
    (c) => {
      const cs = (c.callsign || '').toUpperCase();
      return cs.startsWith(icaoUpper) && cs.includes('ATIS') && (c.text_atis || '');
    }
  );

  // Find METAR from ATIS text or controller ATIS
  let metar = null;
  if (atisList.length > 0 && atisList[0].text_atis) {
    metar = atisList[0].text_atis.join(' ').trim();
  }

  return { departures, arrivals, prefiles, atisList, metar };
}

/**
 * Parse ATIS text into structured departure/arrival info.
 */
function parseAtis(atisList) {
  const depLines = [];
  const arrLines = [];
  for (const a of atisList) {
    const lines = a.text_atis || [];
    const cs = (a.callsign || '').toUpperCase();
    if (cs.includes('_D_') || cs.includes('DEP')) {
      depLines.push(lines.join(' '));
    } else if (cs.includes('_A_') || cs.includes('ARR')) {
      arrLines.push(lines.join(' '));
    } else {
      depLines.push(lines.join(' '));
      arrLines.push(lines.join(' '));
    }
  }
  return {
    dep: depLines.join('; ') || null,
    arr: arrLines.join('; ') || null,
    combined: atisList.length > 0 ? atisList[0].text_atis?.join(' ') : null,
  };
}

/**
 * React hook: fetch VATSIM data and filter for a given airport.
 */
export default function useVatsimData(icao) {
  const [feed, setFeed] = useState({
    departures: [],
    arrivals: [],
    prefiles: [],
    atisList: [],
    atis: { dep: null, arr: null },
    metar: null,
    loading: true,
    error: null,
    age: 0,
  });
  const timerRef = useRef(null);

  const load = useCallback(() => {
    fetcher()
      .then(({ data, age, error }) => {
        if (!data) return;
        const filtered = filterPilots(data, icao);
        const atis = parseAtis(filtered.atisList);

        setFeed({
          departures: filtered.departures.slice(0, 30),
          arrivals: filtered.arrivals.slice(0, 30),
          prefiles: filtered.prefiles.slice(0, 15),
          atisList: filtered.atisList,
          atis,
          metar: filtered.metar,
          loading: false,
          error: error || null,
          age: Math.round(age),
        });
      })
      .catch((err) => {
        setFeed((prev) => ({
          ...prev,
          loading: false,
          error: err.message,
        }));
      });
  }, [icao]);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, CACHE_SECONDS * 1000);
    return () => clearInterval(timerRef.current);
  }, [load]);

  return feed;
}

/**
 * Hook that returns global VATSIM stats: total pilots, controllers, etc.
 */
export function useVatsimStats() {
  const [stats, setStats] = useState({ pilots: 0, controllers: 0, atis: 0, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    const loadStats = () => {
      fetcher()
        .then(({ data }) => {
          if (cancelled || !data) return;
          setStats({
            pilots: (data.pilots || []).length,
            controllers: (data.controllers || []).length,
            atis: (data.atis || []).length,
            loading: false,
            error: null,
          });
        })
        .catch((err) => {
          if (cancelled) return;
          setStats((prev) => ({ ...prev, loading: false, error: err.message }));
        });
    };
    loadStats();
    const timer = setInterval(loadStats, 60000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  return stats;
}
