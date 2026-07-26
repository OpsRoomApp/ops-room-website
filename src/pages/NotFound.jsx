import { Link } from 'react-router-dom';
import SEO from '../components/SEO.jsx';

export default function NotFound() {
  return (
    <>
      <SEO title="WAYPOINT NOT FOUND: OPS ROOM" description="The requested page does not exist." path="" />

      <section className="section" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center' }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <span className="section-eyebrow" style={{ justifyContent: 'center', display: 'flex' }}>
            / NAV DATA OUT OF DATE
          </span>
          <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(3rem, 8vw, 5rem)', fontWeight: 600, color: 'var(--acc)', margin: '1rem 0 0.5rem', letterSpacing: '0.04em' }}>
            404
          </h1>
          <h2 style={{ fontSize: 'clamp(1.1rem, 2.5vw, 1.4rem)', color: 'var(--fg-soft)', fontWeight: 400, marginBottom: '1.5rem' }}>
            Waypoint not found. The page you requested does not exist in the OPS ROOM navigation database.
          </h2>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/" className="btn btn-primary">Return to Dispatch</Link>
            <Link to="/features" className="btn">Browse Modules</Link>
            <Link to="/support" className="btn btn-ghost">Request Support</Link>
          </div>
        </div>
      </section>
    </>
  );
}
