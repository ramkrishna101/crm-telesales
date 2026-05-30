import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute, RoleRoute } from './guards';
import { useAuthStore } from '../store/authStore';
import { AgentViewportBoundary, AuthViewportBoundary } from '../components/layout/ViewportBoundaries';
import LoginPage from '../pages/auth/LoginPage';
import UnauthorizedPage from '../pages/auth/UnauthorizedPage';

function RootRedirect() {
  const { user, isAuthenticated } = useAuthStore();
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;
  const roleRedirects = {
    super_admin: '/admin',
    branch_admin: '/admin',
    supervisor: '/supervisor',
    agent: '/agent',
  };
  return <Navigate to={roleRedirects[user.role] || '/login'} replace />;
}

// Admin
import AdminDashboard from '../pages/admin/AdminDashboard';
import UsersPage from '../pages/admin/UsersPage';
import TeamsPage from '../pages/admin/TeamsPage';
import CampaignsPage from '../pages/admin/CampaignsPage';
import LeadsPage from '../pages/admin/LeadsPage';
import TagsPage from '../pages/admin/TagsPage';
import AnalyticsPage from '../pages/admin/AnalyticsPage';
import BranchesPage from '../pages/admin/BranchesPage';
import ConfigurationPage from '../pages/admin/ConfigurationPage';
import AdminCallsPage from '../pages/admin/AdminCallsPage';

// Supervisor
import SupervisorDashboard from '../pages/supervisor/SupervisorDashboard';

// Agent
import AgentDashboard from '../pages/agent/AgentDashboard';
import AgentLeadsPage from '../pages/agent/AgentLeadsPage';
import AgentLeadProfilePage from '../pages/agent/AgentLeadProfilePage';
import AgentFollowUpsPage from '../pages/agent/AgentFollowUpsPage';
import AgentCallsPage from '../pages/agent/AgentCallsPage';
import AgentProfilePage from '../pages/agent/AgentProfilePage';

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
      <Route path="/login" element={<AuthViewportBoundary desktop={<LoginPage />} />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      {/* ── Admin ────────────────────────────────────────────────────── */}
      <Route element={<RoleRoute allowedRoles={['super_admin']} />}>
        <Route path="/admin/branches" element={<BranchesPage />} />
      </Route>

      <Route element={<RoleRoute allowedRoles={['super_admin', 'branch_admin']} />}>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/configuration" element={<ConfigurationPage />} />
        <Route path="/admin/users" element={<UsersPage />} />
        <Route path="/admin/teams" element={<TeamsPage />} />
        <Route path="/admin/campaigns" element={<CampaignsPage />} />
        <Route path="/admin/leads" element={<LeadsPage />} />
        <Route path="/admin/calls" element={<AdminCallsPage />} />
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
        <Route path="/agent" element={<AgentViewportBoundary desktop={<AgentDashboard />} />} />
        <Route path="/agent/leads" element={<AgentViewportBoundary desktop={<AgentLeadsPage />} />} />
        <Route path="/agent/leads/:leadId" element={<AgentViewportBoundary desktop={<AgentLeadsPage />} mobile={<AgentLeadProfilePage />} />} />
        <Route path="/agent/follow-ups" element={<AgentViewportBoundary desktop={<AgentFollowUpsPage />} />} />
        <Route path="/agent/calls" element={<AgentViewportBoundary desktop={<AgentCallsPage />} />} />
        <Route path="/agent/profile" element={<AgentViewportBoundary desktop={<AgentProfilePage />} />} />
        <Route path="/agent/*" element={<AgentViewportBoundary desktop={<AgentDashboard />} />} />
      </Route>

      {/* Root redirect */}
      <Route path="/" element={<RootRedirect />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
