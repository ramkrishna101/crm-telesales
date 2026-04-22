import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute, RoleRoute } from './guards';
import LoginPage from '../pages/auth/LoginPage';
import AdminDashboard from '../pages/admin/AdminDashboard';
import SupervisorDashboard from '../pages/supervisor/SupervisorDashboard';
import AgentDashboard from '../pages/agent/AgentDashboard';
import UnauthorizedPage from '../pages/auth/UnauthorizedPage';

export default function AppRouter() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      {/* Admin routes */}
      <Route element={<RoleRoute allowedRoles={['admin']} />}>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/*" element={<AdminDashboard />} />
      </Route>

      {/* Supervisor routes */}
      <Route element={<RoleRoute allowedRoles={['supervisor']} />}>
        <Route path="/supervisor" element={<SupervisorDashboard />} />
        <Route path="/supervisor/*" element={<SupervisorDashboard />} />
      </Route>

      {/* Agent routes */}
      <Route element={<RoleRoute allowedRoles={['agent']} />}>
        <Route path="/agent" element={<AgentDashboard />} />
        <Route path="/agent/*" element={<AgentDashboard />} />
      </Route>

      {/* Redirect root */}
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Route>

      {/* 404 */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
