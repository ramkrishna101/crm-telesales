import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute, RoleRoute } from './guards';
import LoginPage from '../pages/auth/LoginPage';
import UnauthorizedPage from '../pages/auth/UnauthorizedPage';

// Admin
import AdminDashboard from '../pages/admin/AdminDashboard';
import UsersPage from '../pages/admin/UsersPage';
import CampaignsPage from '../pages/admin/CampaignsPage';
import LeadsPage from '../pages/admin/LeadsPage';
import AnalyticsPage from '../pages/admin/AnalyticsPage';

// Supervisor
import SupervisorDashboard from '../pages/supervisor/SupervisorDashboard';

// Agent
import AgentDashboard from '../pages/agent/AgentDashboard';

export default function AppRouter() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      {/* Admin */}
      <Route element={<RoleRoute allowedRoles={['admin']} />}>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/users" element={<UsersPage />} />
        <Route path="/admin/campaigns" element={<CampaignsPage />} />
        <Route path="/admin/leads" element={<LeadsPage />} />
        <Route path="/admin/analytics" element={<AnalyticsPage />} />
        <Route path="/admin/*" element={<AdminDashboard />} />
      </Route>

      {/* Supervisor */}
      <Route element={<RoleRoute allowedRoles={['supervisor']} />}>
        <Route path="/supervisor" element={<SupervisorDashboard />} />
        <Route path="/supervisor/*" element={<SupervisorDashboard />} />
      </Route>

      {/* Agent */}
      <Route element={<RoleRoute allowedRoles={['agent']} />}>
        <Route path="/agent" element={<AgentDashboard />} />
        <Route path="/agent/*" element={<AgentDashboard />} />
      </Route>

      {/* Redirect root based on role handled by guards */}
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
