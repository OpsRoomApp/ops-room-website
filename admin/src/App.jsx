import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Upload from './pages/Upload.jsx';
import Releases from './pages/Releases.jsx';
import Health from './pages/Health.jsx';
import Support from './pages/Support.jsx';
import AuditLog from './pages/AuditLog.jsx';
import Pricing from './pages/Pricing.jsx';
import Licensing from './pages/Licensing.jsx';
import DiscordAdmin from './pages/DiscordAdmin.jsx';
import DiscordUsers from './pages/DiscordUsers.jsx';
import BetaTesters from './pages/BetaTesters.jsx';
import DiscordAudit from './pages/DiscordAudit.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="upload" element={<Upload />} />
            <Route path="releases" element={<Releases />} />
            <Route path="health" element={<Health />} />
            <Route path="support" element={<Support />} />
            <Route path="audit" element={<AuditLog />} />
            <Route path="pricing" element={<Pricing />} />
            <Route path="licensing" element={<Licensing />} />
            <Route path="discord" element={<DiscordAdmin />} />
            <Route path="discord-users" element={<DiscordUsers />} />
            <Route path="beta-testers" element={<BetaTesters />} />
            <Route path="discord-audit" element={<DiscordAudit />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
