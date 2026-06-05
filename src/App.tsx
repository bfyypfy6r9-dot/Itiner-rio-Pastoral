/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import { AuthProvider, useAuth } from './contexts/AuthContext';

function AppRoutes() {
  const { user, logout, resetDevices } = useAuth();

  return (
    <Routes>
      <Route path="/" element={user && !user.needsDeviceReset ? <Navigate to="/dashboard" /> : <LandingPage user={user} onResetDevices={resetDevices} onCancelLogin={logout} />} />
      <Route path="/dashboard" element={user && !user.needsDeviceReset ? <Dashboard user={user} onLogout={logout} /> : <Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

