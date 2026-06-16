import React from 'react';
import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ShowcasePage from './pages/ShowcasePage';
import AppPage from './pages/AppPage';
import DevToolsPage from './pages/DevToolsPage';
import ReversePage from './pages/ReversePage';
import ExhibitionPage from './pages/ExhibitionPage';
import CapturePage from './pages/CapturePage';
import ExhibitQRPage from './pages/ExhibitQRPage';

const App = () => {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/showcase" element={<ShowcasePage />} />
      <Route path="/app" element={<AppPage />} />
      <Route path="/dev" element={<DevToolsPage />} />
      <Route path="/reverse" element={<ReversePage />} />
      <Route path="/exhibit" element={<ExhibitionPage />} />
      <Route path="/capture" element={<CapturePage />} />
      <Route path="/exhibit-qr" element={<ExhibitQRPage />} />
    </Routes>
  );
};

export default App;
