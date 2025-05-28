// here we'll soon manipulate the UI 
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HelloPage from './components/HelloPage/HelloPage';
import MapPage from './components/MapPage/MapPage';

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        {/* Home page */}
        <Route path="/" element={<HelloPage />} />

        {/* Maps page */}
        <Route path="/maps" element={<MapPage />} />
      </Routes>
    </Router>
  );
};
export default App;