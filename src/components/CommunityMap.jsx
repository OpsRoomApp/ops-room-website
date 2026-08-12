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

function flightDot() {
  return L.divIcon({
    className: 'community-flight-dot',
    html: '<span></span>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
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
      } else {
        const marker = L.marker(pos, { icon: flightDot() })
          .addTo(map)
          .bindPopup(popupHtml(f));
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
