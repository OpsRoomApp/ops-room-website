import { Link } from 'react-router-dom';
import SEO from '../components/SEO.jsx';
import { PAGE_TITLES } from '../config/seo.js';

const ROWS = [
  {
    name: 'OPS ROOM',
    best: 'All-in-one cockpit ops console',
    price: 'Free (beta)',
    efb2024: 'Native app',
    platform: 'PC, tablet, any browser',
  },
  {
    name: 'Navigraph',
    best: 'Charts and navigation data',
    price: 'Subscription',
    efb2024: 'Charts in EFB',
    platform: 'PC and tablet',
  },
  {
    name: 'Sky4Sim',
    best: 'Standalone tablet EFB',
    price: 'Paid',
    efb2024: 'Native app',
    platform: 'PC',
  },
  {
    name: 'FlightNexus',
    best: 'Simple mobile companion',
    price: 'Free',
    efb2024: 'No',
    platform: 'Phone and tablet',
  },
  {
    name: 'VFRNAV',
    best: 'Enroute chart reader',
    price: 'Free',
    efb2024: 'Native app',
    platform: 'PC',
  },
  {
    name: 'iFly Schedules',
    best: 'Airline schedule management',
    price: 'Paid',
    efb2024: 'Native app',
    platform: 'PC and iPad',
  },
];

const NOTES = [
  {
    name: 'OPS ROOM',
    note: 'A full cockpit operations console: dispatch with a signed OFP, live VATSIM FIDS, Black Box recorder with landing analysis, RAAS, automated announcements, GSX ground automation and CPDLC datalink, all in one app.',
  },
  {
    name: 'Navigraph',
    note: 'The industry standard for Jeppesen charts and updated nav data. If charts and navigation data are your priority, this is the safe choice.',
  },
  {
    name: 'Sky4Sim',
    note: 'A polished, feature-rich EFB with a tablet-style workflow. Strong if you want a dedicated EFB experience focused on maps and performance.',
  },
  {
    name: 'FlightNexus',
    note: 'A free companion app for a phone or tablet you already own. Good for basic flight plan and aircraft data on a second screen.',
  },
  {
    name: 'VFRNAV',
    note: 'A free, focused chart reader for the MSFS 2024 EFB. Handles one job well and pairs with a planning app for the rest.',
  },
  {
    name: 'iFly Schedules',
    note: 'A newer EFB focused on airline-style scheduling and operations, usable on a real iPad as well as in the sim.',
  },
];

export default function EfbApps() {
  return (
    <>
      <SEO
        title={PAGE_TITLES.efbApps}
        description="Best MSFS 2024 EFB apps in 2026, free and paid: Navigraph, Sky4Sim, FlightNexus, VFRNAV and OPS ROOM, the free all-in-one cockpit ops console."
        path="/efb-apps"
      />

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">/ GUIDES</span>
            <h1 className="section-title">Best MSFS 2024 EFB apps in 2026.</h1>
            <p className="section-subtitle">
              The MSFS 2024 EFB is a real tablet inside the cockpit, and a small but growing
              group of apps live inside it. Here is an honest rundown of what is available,
              what each one does, and what it costs. OPS ROOM is on this list too, so you can
              compare it against the rest before you decide.
            </p>
          </div>

          <div className="fids-table-wrap" style={{ marginTop: '1.25rem' }}>
            <table className="spec-table">
              <thead>
                <tr>
                  <th>App</th>
                  <th>Best for</th>
                  <th>Price</th>
                  <th>MSFS 2024 EFB</th>
                  <th>Platform</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.name}>
                    <td className="spec-v">
                      {r.name === 'OPS ROOM' ? (
                        <Link to="/download" style={{ color: 'var(--acc)' }}>{r.name} ↓</Link>
                      ) : (
                        r.name
                      )}
                    </td>
                    <td>{r.best}</td>
                    <td>{r.price}</td>
                    <td>{r.efb2024}</td>
                    <td>{r.platform}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1.1rem', maxWidth: '760px' }}>
            {NOTES.map((n) => (
              <div key={n.name}>
                <h2 className="module-rich-h3" style={{ fontSize: '13px', marginBottom: '0.25rem' }}>{n.name}</h2>
                <p style={{ color: 'var(--fg-soft)', lineHeight: 1.65, fontSize: '0.92rem', margin: 0 }}>{n.note}</p>
                {n.name === 'OPS ROOM' && (
                  <Link to="/download" className="btn btn-primary" style={{ marginTop: '0.75rem' }}>
                    Download OPS ROOM
                  </Link>
                )}
              </div>
            ))}
          </div>

          <div className="section-head" style={{ marginTop: '2.75rem' }}>
            <span className="section-eyebrow">/ HOW TO CHOOSE</span>
            <h2 className="section-title">Which EFB app should you pick?</h2>
          </div>

          <div style={{ maxWidth: '760px', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            <p style={{ color: 'var(--fg-soft)', lineHeight: 1.65, fontSize: '0.92rem', margin: 0 }}>
              If you want the industry standard for charts and nav data, Navigraph is the safe
              choice. If you want a polished standalone tablet experience, Sky4Sim is strong.
              If you want a free companion screen on a device you already own, FlightNexus is
              the easy call. If all you need is a chart reader, VFRNAV does the job for free.
            </p>
            <p style={{ color: 'var(--fg-soft)', lineHeight: 1.65, fontSize: '0.92rem', margin: 0 }}>
              OPS ROOM takes a different approach. Instead of doing one thing well, it is a
              full cockpit operations console that lives inside the MSFS 2024 EFB and in a
              browser on any screen. It is free during public beta. If you want an all-in-one
              cockpit suite rather than a single tool, download OPS ROOM and see for yourself.
            </p>
            <div>
              <Link to="/download" className="btn btn-primary">Get OPS ROOM free</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
