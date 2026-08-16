import { useEffect, useRef, useState } from 'react';
// CSS import is a no-op during Vite SSR and gets bundled into the client
// build, so it can stay static. Only the Leaflet JS module is lazy.
import 'leaflet/dist/leaflet.css';
import { useCommunityLive } from '../hooks/useCommunity.js';

// Leaflet touches `window` at module load, which crashes Node SSR
// (scripts/prerender.mjs). Load it lazily on the client only; every use of L
// below happens inside effects (client-only), so by the time any effect runs
// the promise has resolved.
let _L = null;
// `window` is undefined during Node SSR, so never even start the Leaflet import
// there (the module crashes at load without a DOM). Effects only run on the
// client, and they no-op until the promise resolves.
const leafletPromise =
  typeof window !== 'undefined'
    ? import('leaflet').then((m) => {
        _L = m.default;
        return _L;
      })
    : Promise.resolve(null);

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>';

function altitudeStr(alt) {
  if (!alt || alt <= 0) return '----';
  if (alt >= 18000) return `FL${String(Math.round(alt / 100)).padStart(3, '0')}`;
  return `${Math.round(alt)} FT`;
}

function popupHtml(f) {
  const route = f.origin && f.destination ? `${f.origin} → ${f.destination}` : '----';
  const phase = (f.phase || 'AIRBORNE').toUpperCase().slice(0, 12);
  const gs = f.ground_speed_kts ? `${Math.round(f.ground_speed_kts)} KT` : '----';
  return (
    `<div class="community-map-popup">` +
    `<b>${f.callsign || '----'}</b>` +
    `<span>${route}</span>` +
    `<span>${phase} · ${altitudeStr(f.altitude_ft)} · ${gs}</span>` +
    `</div>`
  );
}

function tooltipHtml(f) {
  // #103: hover shows the route + live details without needing a click.
  const route = f.origin && f.destination ? `${f.origin} → ${f.destination}` : '----';
  const ac = f.aircraft || '----';
  const phase = (f.phase || 'AIRBORNE').toUpperCase().slice(0, 12);
  const gs = f.ground_speed_kts ? `${Math.round(f.ground_speed_kts)} KT` : '----';
  return (
    `<div class="community-map-tooltip">` +
    `<b>${f.callsign || '----'}</b>` +
    `<span>${route}</span>` +
    `<span>${ac} · ${phase}</span>` +
    `<span>${altitudeStr(f.altitude_ft)} · ${gs}</span>` +
    `</div>`
  );
}

// #103: aircraft marker - a plane glyph rotated by live heading. Heading is
// degrees true from the telemetry feed; the icon's inner SVG is rotated via
// CSS so Leaflet's divIcon can update it cheaply on every feed tick.
// #111: dotted FMS-style route line between SimBrief navlog waypoints. The
// route line is only drawn for the flight the user selects on the map, so a
// busy network stays clean (fix: routes no longer render for every aircraft).
const ROUTE_STYLE = { color: '#4dc3ff', weight: 2, opacity: 0.85, dashArray: '5 9', lineJoin: 'round' };
function routePoints(f) {
  const r = f.route;
  if (!Array.isArray(r) || r.length < 2) return null;
  const pts = [];
  for (const p of r) {
    if (Array.isArray(p) && p.length >= 2) {
      const lat = Number(p[0]); const lon = Number(p[1]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) pts.push([lat, lon]);
    }
  }
  return pts.length >= 2 ? pts : null;
}

// Aircraft marker glyph: the Material "send" paper plane, which reads as an
// aircraft at icon size. Its nose points straight up (0° = North), matching
// the live heading rotation directly.
const PLANE_SVG =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>';

function flightIcon(f, selected) {
  if (!_L) return null;
  const heading = Number(f.heading);
  // #117: omit rotation when heading is unknown instead of rendering a
  // misleading fixed orientation (fall back to the map track when present).
  const track = Number(f.track_deg);
  const deg = Number.isFinite(heading) ? heading : Number.isFinite(track) ? track : null;
  const rotate = deg === null ? '' : `rotate(${deg}deg)`;
  // Selected aircraft gets a larger, amber icon so its identity is obvious
  // while its route line is shown (inline styles - no extra CSS required).
  const color = selected ? '#ffd166' : 'currentColor';
  const svg = selected ? PLANE_SVG.replace('stroke="currentColor"', `stroke="${color}"`) : PLANE_SVG;
  return L.divIcon({
    className: selected ? 'community-flight-plane community-flight-plane--selected' : 'community-flight-plane',
    html: `<span class="plane-wrap" style="transform:${rotate}">${svg}</span>`,
    iconSize: selected ? [34, 34] : [26, 26],
    iconAnchor: selected ? [17, 17] : [13, 13],
  });
}

/**
 * Live community map: public-visibility OPS ROOM flights rendered as markers
 * on a dark CARTO basemap. The map is initialised once and markers are
 * reconciled on each feed poll so positions move without recreating the map.
 *
 * Route polylines are drawn only for the flight selected by the user (marker
 * click); clicking empty map space clears the selection.
 */
export default function CommunityMap() {
  const { flights, loading } = useCommunityLive();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const routesRef = useRef({});   // #111: dashed SimBrief route polylines (selected flight only)
  const fittedRef = useRef(false);
  const [selectedId, setSelectedId] = useState(null);

  // Initialise the Leaflet map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let disposed = false;
    let map = null;
    leafletPromise.then((L) => {
      if (disposed || !containerRef.current || mapRef.current) return;
      map = L.map(containerRef.current, {
      center: [45, 8],
      zoom: 3,
      minZoom: 2,
      maxZoom: 12,
      zoomControl: true,
      attributionControl: true,
      worldCopyJump: true,
    });
    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTRIBUTION,
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);
    // Clicking empty map space deselects the flight and hides its route.
      map.on('click', () => setSelectedId(null));
      mapRef.current = map;
    });
    return () => {
      disposed = true;
      if (map) {
        try {
          map.remove();
        } catch (_) {
          /* noop */
        }
      }
      mapRef.current = null;
      markersRef.current = {};
      routesRef.current = {};
      fittedRef.current = false;
    };
  }, []);

  // Reconcile markers against the latest feed.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const live = new Set();
    for (const f of flights) {
      if (f.latitude == null || f.longitude == null) continue;
      const id = String(f.discord_id);
      live.add(id);
      const isSelected = id === selectedId;
      const pos = [Number(f.latitude), Number(f.longitude)];
      const existing = markersRef.current[id];
      if (existing) {
        existing.setLatLng(pos);
        existing.setPopupContent(popupHtml(f));
        existing.setTooltipContent(tooltipHtml(f));
        // #103: keep the plane rotated toward the live heading.
        existing.setIcon(flightIcon(f, isSelected));
      } else {
        const marker = L.marker(pos, { icon: flightIcon(f, isSelected) })
          .addTo(map)
          .bindPopup(popupHtml(f))
          .bindTooltip(tooltipHtml(f), { direction: 'top', offset: [0, -14], opacity: 0.95 })
          .on('click', () => setSelectedId(id));
        markersRef.current[id] = marker;
      }
      // #111: dotted SimBrief route line - only for the selected flight.
      const pts = isSelected ? routePoints(f) : null;
      const routeLayer = routesRef.current[id];
      if (pts) {
        if (routeLayer) {
          routeLayer.setLatLngs(pts);
        } else {
          routesRef.current[id] = L.polyline(pts, ROUTE_STYLE).addTo(map);
        }
      } else if (routeLayer) {
        map.removeLayer(routeLayer);
        delete routesRef.current[id];
      }
    }
    for (const id of Object.keys(markersRef.current)) {
      if (!live.has(id)) {
        map.removeLayer(markersRef.current[id]);
        delete markersRef.current[id];
        if (id === selectedId) setSelectedId(null);
      }
    }
    for (const id of Object.keys(routesRef.current)) {
      if (!live.has(id)) {
        map.removeLayer(routesRef.current[id]);
        delete routesRef.current[id];
      }
    }
    if (!fittedRef.current && live.size > 0) {
      const group = L.featureGroup(Object.values(markersRef.current));
      try {
        map.fitBounds(group.getBounds().pad(0.35), { maxZoom: 8 });
        fittedRef.current = true;
      } catch (_) {
        /* single marker or invalid bounds */
      }
    }
  }, [flights, selectedId]);

  return (
    <div className="community-live community-map-panel">
      <div className="fids-topbar">
        <div className="fids-eyebrow">
          <span className="tag-dot" /> OPS ROOM / LIVE NETWORK
        </div>
        <div className="fids-clock">
          <span className="clock-label">
            {loading ? 'LOADING' : `${flights.length} AIRBORNE`}
          </span>
        </div>
      </div>
      <div ref={containerRef} className="community-map" aria-label="Live community flights map" />
      <div className="fids-footer">
        <span><span className="tag-dot" /> OPT-IN COMMUNITY FEED</span>
        <span className="muted">SOURCE · OPS ROOM</span>
      </div>
    </div>
  );
}
