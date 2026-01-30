import React from 'react';
import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ShowcasePage from './pages/ShowcasePage';
import AppPage from './pages/AppPage';
import DevToolsPage from './pages/DevToolsPage';

const App = () => {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/showcase" element={<ShowcasePage />} />
      <Route path="/app" element={<AppPage />} />
      <Route path="/dev" element={<DevToolsPage />} />
    </Routes>
  );
};

export default App;
