import { useEffect, useRef } from 'react';
import SEO from '../components/SEO.jsx';
import { PAGE_TITLES } from '../config/seo.js';

const SHOTS = [
  { file: 'vatsim-fids.png',         label: 'VATSIM FIDS',           mod: 'FIDS' },
  { file: 'live-map.png',            label: 'Live Map',              mod: 'MAP' },
  { file: 'black-box-fdr.png',       label: 'Black Box',             mod: 'BBX' },
  { file: 'briefing.png',            label: 'Briefing',              mod: 'BRF' },
  { file: 'finances-and-career.png', label: 'Finances & Career',     mod: 'FIN' },
  { file: 'cpdlc-datalink.png',      label: 'CPDLC Datalink',        mod: 'DAT' },
  { file: 'logbook.png',             label: 'Logbook',               mod: 'LOC' },
  { file: 'kneeboard.png',           label: 'Kneeboard',             mod: 'SP' },
  { file: 'runway-awareness.png',    label: 'Runway Awareness',      mod: 'RAAS' },
  { file: 'vpilot-integration.png',  label: 'vPilot Integration',    mod: 'NET' },
  { file: 'checklists.png',          label: 'Checklists',            mod: 'PRC' },
  { file: 'announcer.png',           label: 'Announcer',             mod: 'AOC' },
  { file: 'obs-overlay-studio.png',  label: 'OBS Overlay',           mod: 'OBS' },
  { file: 'setup.png',               label: 'Setup',                 mod: 'SYS' },
  { file: 'logbook-2.png',           label: 'Logbook / Detail',      mod: 'LOC' },
  { file: 'ipad.png',                label: 'iPad Companion',        mod: 'iPad' },
];

const SHOTS_LOOP = [...SHOTS, ...SHOTS, ...SHOTS];

export default function Screenshots() {
  const railRef = useRef(null);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return undefined;

    const slotW = () => {
      const slot = rail.querySelector('[data-shot]');
      return slot ? slot.getBoundingClientRect().width + 24 : 580;
    };

    // Start the rail at the middle copy so users can scroll both directions.
    rail.scrollLeft = SHOTS.length * slotW();

    let userActiveUntil = 0;
    const onUserScroll = () => {
      userActiveUntil = Date.now() + 1500;
    };
    rail.addEventListener('wheel', onUserScroll, { passive: true });
    rail.addEventListener('touchstart', onUserScroll, { passive: true });
    rail.addEventListener('pointerdown', onUserScroll, { passive: true });

    // Wrap-around: if user scrolls past 2 copies, jump back to the equivalent
    // middle position without a visible snap.
    const onScroll = () => {
      const w = slotW();
      const left = rail.scrollLeft;
      // Hard left edge → jump to the second copy (one full forward copy in).
      if (left < w * 0.5) {
        rail.scrollLeft = left + w * SHOTS.length;
      }
      // Hard right edge → jump back one full copy.
      const maxAllowed = w * SHOTS.length * 2;
      if (left > maxAllowed + w * 0.5) {
        rail.scrollLeft = left - w * SHOTS.length;
      }
    };
    rail.addEventListener('scroll', onScroll, { passive: true });

    // Auto-advance when the user hasn't touched it for a moment.
    let tid = null;
    let cyclePos = 0;
    const wasHover = () => rail.parentElement && rail.parentElement.parentElement && rail.parentElement.parentElement.matches(':hover');
    const tick = () => {
      if (Date.now() < userActiveUntil) {
        tid = setTimeout(tick, 600);
        return;
      }
      if (wasHover()) {
        tid = setTimeout(tick, 600);
        return;
      }
      const w = slotW();
      rail.scrollBy({ left: w, behavior: 'smooth' });
      cyclePos += 1;
      // After we have auto-captured a full second copy, jump to middle to keep cycling.
      if (cyclePos >= SHOTS.length) {
        const target = rail.scrollLeft - w * SHOTS.length;
        setTimeout(() => { rail.scrollLeft = target; }, 700);
        cyclePos = 0;
      }
      tid = setTimeout(tick, 4000);
    };
    tid = setTimeout(tick, 4000);

    return () => {
      rail.removeEventListener('scroll', onScroll);
      rail.removeEventListener('wheel', onUserScroll);
      rail.removeEventListener('touchstart', onUserScroll);
      rail.removeEventListener('pointerdown', onUserScroll);
      if (tid) clearTimeout(tid);
    };
  }, []);

  return (
    <>
      <SEO
        title={PAGE_TITLES.screenshots}
        description="Real OPS ROOM screenshots: VATSIM FIDS, Live Map, Black Box, Briefing, Finances, CPDLC, Logbook, Kneeboard, Runway Awareness, Announcer, OBS Overlay."
        path="/screenshots"
      />

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">/ SCREENSHOTS</span>
            <h1 className="section-title">Inside OPS ROOM.</h1>
            <p className="section-subtitle">
              Real captures from the production build. The carousel cycles
              continuously through every module. Use the arrows or swipe to step
              through it manually. Click any shot to open the full-resolution PNG.
            </p>
          </div>

          <div className="callout">
            <strong>NOTE.</strong> &nbsp; UI text, callsigns and routes in the captures
            are from real SimBrief, VATSIM and production telemetry samples, not stand-in.
          </div>
        </div>
      </section>

      <section className="section section-tight">
        <div className="container">
          <div className="shot-row-wrap">
            <div className="shot-row" ref={railRef}>
              {SHOTS_LOOP.map((s, i) => (
                <figure key={`${s.file}-${i}`} data-shot className="shot-row-item">
                  <a href={`/screenshots/${s.file}`} target="_blank" rel="noreferrer">
                    <img src={`/screenshots/${s.file}`} alt={`OPS ROOM ${s.label} module for MSFS 2020 and 2024`} loading="lazy" />
                  </a>
                  <figcaption>
                    <span className="shot-row-label">{s.label}</span>
                    <span className="shot-row-mod">MOD · {s.mod}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
