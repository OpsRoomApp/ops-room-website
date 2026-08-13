import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useCommunityLive } from '../hooks/useCommunity.js';

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

// #103: aircraft marker — a plane glyph rotated by live heading. Heading is
// degrees true from the telemetry feed; the icon's inner SVG is rotated via
// CSS so Leaflet's divIcon can update it cheaply on every feed tick.
const PLANE_SVG =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>';

function flightIcon(f) {
  const heading = Number(f.heading);
  const rotate = Number.isFinite(heading) ? `rotate(${heading}deg)` : '';
  return L.divIcon({
    className: 'community-flight-plane',
    html: `<span class="plane-wrap" style="transform:${rotate}">${PLANE_SVG}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

/**
 * Live community map: public-visibility OPS ROOM flights rendered as markers
 * on a dark CARTO basemap. The map is initialised once and markers are
 * reconciled on each feed poll so positions move without recreating the map.
 */
export default function CommunityMap() {
  const { flights, loading } = useCommunityLive();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const fittedRef = useRef(false);

  // Initialise the Leaflet map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
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
    mapRef.current = map;
    return () => {
      try {
        map.remove();
      } catch (_) {
        /* noop */
      }
      mapRef.current = null;
      markersRef.current = {};
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
      const pos = [Number(f.latitude), Number(f.longitude)];
      const existing = markersRef.current[id];
      if (existing) {
        existing.setLatLng(pos);
        existing.setPopupContent(popupHtml(f));
        existing.setTooltipContent(tooltipHtml(f));
        // #103: keep the plane rotated toward the live heading.
        existing.setIcon(flightIcon(f));
      } else {
        const marker = L.marker(pos, { icon: flightIcon(f) })
          .addTo(map)
          .bindPopup(popupHtml(f))
          .bindTooltip(tooltipHtml(f), { direction: 'top', offset: [0, -14], opacity: 0.95 });
        markersRef.current[id] = marker;
      }
    }
    for (const id of Object.keys(markersRef.current)) {
      if (!live.has(id)) {
        map.removeLayer(markersRef.current[id]);
        delete markersRef.current[id];
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
  }, [flights]);

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
