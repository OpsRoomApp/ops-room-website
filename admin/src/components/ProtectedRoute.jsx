import { useState, useEffect } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';

export default function ProtectedRoute() {
  const [state, setState] = useState('loading');
  const location = useLocation();

  useEffect(() => {
    fetch('/api/auth/session', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        setState(data.authenticated ? 'authenticated' : 'unauthenticated');
      })
      .catch(() => setState('unauthenticated'));
  }, []);

  if (state === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
        Verifying session...
      </div>
    );
  }

  if (state === 'unauthenticated') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
