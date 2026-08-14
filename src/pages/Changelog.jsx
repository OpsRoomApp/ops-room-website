import SEO from '../components/SEO.jsx';
import { PAGE_TITLES } from '../config/seo.js';

const ENTRIES = [
  {
    v: 'v0.24.1',
    date: '2026-07',
    bullets: [
      'Black Box - a continuous flight data recorder that captures your whole flight and replays it back inside the simulator, with scrub, pause and speed controls. Landing rate, G-loading and touchdown speed are captured automatically.',
      'Performance calculator - enter ZFW and CG and get takeoff speeds (V1/VR/V2), flap and trim recommendations, flex temperature and required runway distance, fed by live weather and your SimBrief flight plan.',
      'Live OFP dispatch board - track planned vs actual times, fuel and weights during the flight, and sign the loadsheet with a typed or drawn electronic signature, stored per flight.',
      'Runway and taxiway closure markers rendered directly in the simulator from live NOTAM data.',
      'A full operations console - briefing (SimBrief, METAR/TAF, live radar, NOTAMs, charts), procedures and checklists, a FIDS departure board, and ground-services control for GSX.',
      'Flight Watch in the air, runway awareness callouts, and CPDLC datalink via Hoppie.',
      'Cabin PA Announcer with volume that follows the camera, plus streamer-ready OBS overlays.',
      'Logbook and PIREP that break down landing quality and stability, and an airline economy with revenue, costs and passenger satisfaction that reacts to how you fly.',
      'Discord integration - Rich Presence, takeoff and landing posts, a leaderboard, and a live “who is flying now” community map.',
    ],
  },
];

export default function Changelog() {
  return (
    <>
      <SEO title={PAGE_TITLES.changelog} description="What's new in OPS ROOM v0.24.1 - Black Box recording, performance calculator, live dispatch, and more." path="/changelog" />

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">/ CHANGELOG</span>
            <h1 className="section-title">What&apos;s new.</h1>
            <p className="section-subtitle">
              OPS ROOM is freeware for Windows and works alongside Microsoft Flight Simulator
              2020 and 2024 - from briefing to debrief, in one app.
            </p>
          </div>

          <div className="changelog-list">
            {ENTRIES.map((e) => (
              <article key={e.v} className="changelog-entry">
                <div className="changelog-head">
                  <span className="changelog-version">{e.v}</span>
                  <span className="changelog-date">{e.date}</span>
                </div>
                <ul className="changelog-list-bullets">
                  {e.bullets.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
