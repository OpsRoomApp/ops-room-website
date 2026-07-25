import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

export default function Layout() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/auth/session', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (!data.authenticated) {
          navigate('/login');
        } else {
          setUser(data);
        }
      })
      .catch(() => navigate('/login'));
  }, [navigate]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    navigate('/login');
  };

  if (!user) return null;

  return (
    <div className="admin-layout">
      <header className="admin-header">
        <span className="admin-brand">OPS ROOM ADMIN</span>
        <nav className="admin-nav">
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/upload">Upload</NavLink>
          <NavLink to="/releases">Releases</NavLink>
          <NavLink to="/health">Health</NavLink>
          <NavLink to="/support">Support</NavLink>
        </nav>
        <div className="admin-user">
          {user.avatar && <img src={user.avatar} alt="" />}
          <span>{user.username}</span>
          <button onClick={handleLogout}>Logout</button>
        </div>
      </header>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
