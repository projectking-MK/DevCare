import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { DevicesPage } from './pages/DevicesPage';
import { LiveMonitoringPage } from './pages/LiveMonitoringPage';
import { RecordingsPage } from './pages/RecordingsPage';
import { SessionsPage } from './pages/SessionsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ChildPage } from './pages/ChildPage';
import { isChildDevicePaired } from './utils/storage';
import { Shield } from 'lucide-react';

const RootRedirect: React.FC = () => {
  const { user, loading } = useAuth();
  const isChild = isChildDevicePaired();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-4 text-slate-100">
        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 animate-pulse">
          <Shield className="w-6 h-6" />
        </div>
        <p className="text-xs font-medium text-slate-400">Loading GuardianLink...</p>
      </div>
    );
  }

  // If authenticated as parent, navigate to parent dashboard
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  // If this device was paired as child, automatically open child companion without entering code!
  if (isChild) {
    return <Navigate to="/child" replace />;
  }

  // Otherwise, route to parent login
  return <Navigate to="/login" replace />;
};

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-4 text-slate-100">
        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 animate-pulse">
          <Shield className="w-6 h-6" />
        </div>
        <p className="text-xs font-medium text-slate-400">Verifying session...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/child" element={<ChildPage />} />

          {/* Root intelligent routing: auto-directs paired child device to /child */}
          <Route path="/" element={<RootRedirect />} />

          {/* Protected Parent Routes */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/devices" element={<DevicesPage />} />
            <Route path="/monitoring" element={<LiveMonitoringPage />} />
            <Route path="/recordings" element={<RecordingsPage />} />
            <Route path="/sessions" element={<SessionsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
