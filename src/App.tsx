/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import AdminPanel from './pages/AdminPanel';
import { AuthProvider, useAuth } from './contexts/AuthContext';

function AppRoutes() {
  const { user, logout, resetDevices } = useAuth();

  return (
    <Routes>
      <Route path="/" element={user && !user.needsDeviceReset && !user.isPendingApproval ? <Navigate to="/dashboard" /> : <LandingPage user={user} onResetDevices={resetDevices} onCancelLogin={logout} />} />
      <Route path="/dashboard" element={user && !user.needsDeviceReset && !user.isPendingApproval ? <Dashboard user={user} onLogout={logout} /> : <Navigate to="/" />} />
      <Route path="/admin" element={user && !user.needsDeviceReset && (user.isAdmin || user.role === 'admin') ? <AdminPanel /> : <Navigate to="/dashboard" />} />
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

