import SEO from '../components/SEO.jsx';
import { PAGE_TITLES } from '../config/seo.js';

const MODULES = [
  {
    code: 'FIDS', group: 'OPERATIONS', title: 'VATSIM FIDS',
    brief: 'Live airport departures and arrivals pulled from the VATSIM network.',
    bullets: [
      'Search any ICAO; read departures, arrivals and prefiles.',
      'ATIS summary and METAR in the same view.',
      'Refines the live view as the VATSIM feed refreshes.',
    ],
  },
  {
    code: 'DSP', group: 'OPERATIONS', title: 'Dispatch',
    brief: 'Pre-flight route selection, fuel planning and a signed OFP.',
    bullets: [
      'Routes scored against your aircraft type and ATC.',
      'Pulls from your SimBrief identifiers.',
      'Cross-checks fuel, alternates and ATC sectors.',
    ],
  },
  {
    code: 'BRF', group: 'OPERATIONS', title: 'Briefing',
    brief: 'Signed flight briefing: charts, weather pack, route, METAR / TAF.',
    bullets: [
      'Reads SimBrief OFP HTML and text variants.',
      'ChartFox and Navigraph catalogues render inside OPS ROOM.',
      'Status pill flips until signed.',
    ],
  },
  {
    code: 'WTC', group: 'WATCH', title: 'Flight Watch',
    brief: 'Live aircraft telemetry over WebSocket, phase transitions and uplink state.',
    bullets: [
      'Reports phase transitions STD / TAXOUT / RWY / CRZ / DSC / ARR.',
      'Compares planned vs. actual fuel burn.',
      'Surfacing stabilised gate violations on the same tick.',
    ],
  },
  {
    code: 'BBX', group: 'RECORDING', title: 'Black Box',
    brief: 'Continuous flight recorder with scrubbable replay.',
    bullets: [
      'Captures 60+ parameters every cycle.',
      'Hard-landing markers and overspeed flags dropped on the timeline.',
      'Exports a portable .opsroom bundle for debrief.',
    ],
  },
  {
    code: 'ANL', group: 'ANALYSIS', title: 'Flight Analysis',
    brief: 'Landing grade, taxi time, fuel efficiency and active PIREP filing.',
    bullets: [
      'Grades touchdown vertical speed, G-force and centreline.',
      'Compares planned vs. actual fuel burn.',
      'Generates structured PIREPs and submits them to VATSIM.',
    ],
  },
  {
    code: 'GND', group: 'OPERATIONS', title: 'Ground Control',
    brief: 'GSX Pro coordination for boarding, fueling and pushback.',
    bullets: [
      'Drives GSX Pro menus from within OPS ROOM.',
      'Logs boarding / fueling / pushback durations against ETD.',
      'Refines the OFP ETD with actual ground-time capture.',
    ],
  },
  {
    code: 'RAAS', group: 'WATCH', title: 'Runway Awareness',
    brief: 'Aural warnings for runway incursion and approach hazards.',
    bullets: [
      'Senses runway state from the simulator.',
      'Plays the same RAAS cues used on real airliners.',
      'Approaching, on-runway, hold-short, opposite-direction traffic.',
    ],
  },
  {
    code: 'DAT', group: 'COMMS', title: 'CPDLC Datalink',
    brief: 'Controller-pilot data link over the Hoppie network.',
    bullets: [
      'Uplink / downlink messages on the live callsign.',
      'Terminal-style history of every exchange.',
      'Surfaces the upstream return code on failure.',
    ],
  },
  {
    code: 'NET', group: 'COMMS', title: 'Network / Comms',
    brief: 'Discrete ATC frequencies, swap and squawk state.',
    bullets: [
      'Same labels and order as the in-sim panel.',
      'Active squawk cross-checked against the transponder.',
      'One-click swap when ATC asks to switch to next.',
    ],
  },
  {
    code: 'MAP', group: 'WATCH', title: 'Live Map',
    brief: 'Ownship, VATSIM traffic, navaids, airways and airspaces.',
    bullets: [
      'Layer toggles for traffic, navaids, airways and airspaces.',
      'In-sim camera target click from a traffic flight.',
      'Pushpin route overlay against the active OFP.',
    ],
  },
  {
    code: 'SP', group: 'BRIEFING', title: 'Kneeboard',
    brief: 'ATIS letters, gate, altimeter and transponder in flight.',
    bullets: [
      'Quick reference scratchpad pinned while flying.',
      'Reorder items freely; notes persist per flight.',
      'Compact panel readable at small font.',
    ],
  },
  {
    code: 'PRC', group: 'BRIEFING', title: 'Procedures',
    brief: 'Normal and non-normal checklists and SOPs.',
    bullets: [
      'Indexed checklists against the active aircraft.',
      'QRH items for non-normal conditions.',
      'Tracks which steps were completed.',
    ],
  },
  {
    code: 'LOC', group: 'RECORDING', title: 'Logbook',
    brief: 'Automatic flight logbook with stats and PDF export.',
    bullets: [
      'Every flight: route, aircraft, time, fuel, landings, PIREP.',
      'Stats roll up per type, per month, per destination.',
      'Per-flight PDF and CSV export.',
    ],
  },
  {
    code: 'AOC', group: 'OPERATIONS', title: 'Announcer',
    brief: 'Cabin-style voice announcements from sim events.',
    bullets: [
      'Boarding, safety, taxi, takeoff, after-takeoff, descent, arrival.',
      'Volume follows camera distance so PA-style cues match what passengers hear.',
      'Toggle in Settings, no per-aircraft wiring required.',
    ],
  },
  {
    code: 'OBS', group: 'ANALYSIS', title: 'OBS Tools',
    brief: 'Streaming overlays and brand artwork for cockpit recording.',
    bullets: [
      'Custom logo, airline branding, status badges.',
      'Pulls your active airline branding from your SimBrief identifier automatically.',
      'Side-pinned overlay that does not interfere with sim controls.',
    ],
  },
];

export default function Features() {
  return (
    <>
      <SEO
        title={PAGE_TITLES.features}
        description="OPS ROOM modules — VATSIM FIDS, Dispatch, Briefing, Flight Watch, Black Box, Flight Analysis, Ground Control, Runway Awareness, CPDLC Datalink, Network, Live Map, Kneeboard, Procedures, Logbook, Announcer, OBS Tools."
        path="/features"
      />

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">/ ALL MODULES</span>
            <h1 className="section-title">Sixteen modules in detail.</h1>
            <p className="section-subtitle">
              Every module runs locally in a single OPS ROOM process. They share
              telemetry, the dispatch board and the local SQLite ledger.
            </p>
          </div>

          <div className="modules-rich">
            {MODULES.map((m) => (
              <article key={m.code} className="panel module-rich-card">
                <div className="panel-head">
                  <span className="panel-title">{m.group} · {m.code}</span>
                  <span className="status-row"><span className="ok-dot" /> ACTIVE</span>
                </div>
                <div className="panel-body">
                  <h3 className="module-rich-h3">{m.title}</h3>
                  <p className="module-rich-summary">{m.brief}</p>
                  <ul className="module-rich-bullets">
                    {m.bullets.map((b) => <li key={b}>{b}</li>)}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
