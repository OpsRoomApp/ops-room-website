import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Features from './pages/Features.jsx';
import Screenshots from './pages/Screenshots.jsx';
import Demo from './pages/Demo.jsx';
import Download from './pages/Download.jsx';
import GettingStarted from './pages/GettingStarted.jsx';
import Documentation from './pages/Documentation.jsx';
import Changelog from './pages/Changelog.jsx';
import Support from './pages/Contact.jsx';
import FAQ from './pages/FAQ.jsx';
import Privacy from './pages/Privacy.jsx';
import NotFound from './pages/NotFound.jsx';
import Transcript from './pages/Transcript.jsx';
import Appeal from './pages/Appeal.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import EfbApps from './pages/EfbApps.jsx';
import PressRelease from './pages/PressRelease.jsx';

/**
 * The route table, exported separately from the router wrapper so the SSR
 * prerender entry (src/ssr-entry.jsx) can render the same routes with
 * StaticRouter instead of BrowserRouter.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="features" element={<Features />} />
        <Route path="screenshots" element={<Screenshots />} />
        <Route path="demo" element={<Demo />} />
        <Route path="getting-started" element={<GettingStarted />} />
        <Route path="documentation" element={<Documentation />} />
        <Route path="download" element={<Download />} />
        <Route path="changelog" element={<Changelog />} />
        <Route path="/contact" element={<Support />} />
        <Route path="support" element={<Support />} />
        <Route path="faq" element={<FAQ />} />
        <Route path="privacy" element={<Privacy />} />
        <Route path="transcripts/:ticketId" element={<Transcript />} />
        <Route path="appeal" element={<Appeal />} />
        <Route path="leaderboard" element={<Leaderboard />} />
        <Route path="efb-apps" element={<EfbApps />} />
        <Route path="press" element={<PressRelease />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
