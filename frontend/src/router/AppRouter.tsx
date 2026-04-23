import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute, RoleRoute } from './guards';
import { useAuthStore } from '../store/authStore';
import LoginPage from '../pages/auth/LoginPage';
import UnauthorizedPage from '../pages/auth/UnauthorizedPage';

// Admin
import AdminDashboard from '../pages/admin/AdminDashboard';
import UsersPage from '../pages/admin/UsersPage';
import TeamsPage from '../pages/admin/TeamsPage';
import CampaignsPage from '../pages/admin/CampaignsPage';
import LeadsPage from '../pages/admin/LeadsPage';
import TagsPage from '../pages/admin/TagsPage';
import AnalyticsPage from '../pages/admin/AnalyticsPage';

// Supervisor
import SupervisorDashboard from '../pages/supervisor/SupervisorDashboard';

// Agent
import AgentDashboard from '../pages/agent/AgentDashboard';
import AgentLeadsPage from '../pages/agent/AgentLeadsPage';
import AgentFollowUpsPage from '../pages/agent/AgentFollowUpsPage';

export default function AppRouter() {
  const { _hasHydrated } = useAuthStore();

  if (!_hasHydrated) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)' }}>
        <div className="loader" style={{ width: 40, height: 40, border: '3px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
      </div>
    );
  }

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      {/* ── Admin ────────────────────────────────────────────────────── */}
      <Route element={<RoleRoute allowedRoles={['admin']} />}>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/users" element={<UsersPage />} />
        <Route path="/admin/teams" element={<TeamsPage />} />
        <Route path="/admin/campaigns" element={<CampaignsPage />} />
        <Route path="/admin/leads" element={<LeadsPage />} />
        <Route path="/admin/tags" element={<TagsPage />} />
        <Route path="/admin/analytics" element={<AnalyticsPage />} />
        {/* Fallback for unbuilt sub-pages */}
        <Route path="/admin/*" element={<AdminDashboard />} />
      </Route>

      {/* ── Supervisor ───────────────────────────────────────────────── */}
      <Route element={<RoleRoute allowedRoles={['supervisor']} />}>
        <Route path="/supervisor" element={<SupervisorDashboard />} />
        <Route path="/supervisor/*" element={<SupervisorDashboard />} />
      </Route>

      {/* ── Agent ────────────────────────────────────────────────────── */}
      <Route element={<RoleRoute allowedRoles={['agent']} />}>
        <Route path="/agent" element={<AgentDashboard />} />
        <Route path="/agent/leads" element={<AgentLeadsPage />} />
        <Route path="/agent/follow-ups" element={<AgentFollowUpsPage />} />
        <Route path="/agent/*" element={<AgentDashboard />} />
      </Route>

      {/* Root redirect */}
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
