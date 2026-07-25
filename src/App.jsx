import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Features from './pages/Features.jsx';
import Screenshots from './pages/Screenshots.jsx';
import Download from './pages/Download.jsx';
import Documentation from './pages/Documentation.jsx';
import Changelog from './pages/Changelog.jsx';
import Support from './pages/Contact.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="features" element={<Features />} />
          <Route path="screenshots" element={<Screenshots />} />
          <Route path="documentation" element={<Documentation />} />
          <Route path="download" element={<Download />} />
          <Route path="changelog" element={<Changelog />} />
          <Route path="/contact" element={<Support />} />
          <Route path="support" element={<Support />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
