import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAuthStore } from '../../store/authStore';
import { authService, agentService } from '../../services/crm.service';
import toast from 'react-hot-toast';
import {
  LayoutDashboard, Users, Building2, PhoneCall,
  BarChart3, LogOut, ChevronRight, Bell,
  UserCheck, FolderOpen, ListChecks, Tag, UserCircle2
} from 'lucide-react';

interface NavItem { icon: React.ReactNode; label: string; to: string; }

const branchAdminNav: NavItem[] = [
  { icon: <LayoutDashboard size={18} />, label: 'Dashboard', to: '/admin' },
  { icon: <FolderOpen size={18} />, label: 'Campaigns', to: '/admin/campaigns' },
  { icon: <Users size={18} />, label: 'Leads', to: '/admin/leads' },
  { icon: <UserCheck size={18} />, label: 'Users', to: '/admin/users' },
  { icon: <Building2 size={18} />, label: 'Teams', to: '/admin/teams' },
  { icon: <PhoneCall size={18} />, label: 'Calls', to: '/admin/calls' },
  { icon: <Tag size={18} />, label: 'Disposition Tags', to: '/admin/tags' },
  { icon: <BarChart3 size={18} />, label: 'Analytics', to: '/admin/analytics' },
];

const superAdminNav: NavItem[] = [
  { icon: <LayoutDashboard size={18} />, label: 'Dashboard', to: '/admin' },
  { icon: <Building2 size={18} />, label: 'Branches', to: '/admin/branches' },
  { icon: <FolderOpen size={18} />, label: 'Campaigns', to: '/admin/campaigns' },
  { icon: <Users size={18} />, label: 'Leads', to: '/admin/leads' },
  { icon: <UserCheck size={18} />, label: 'Users', to: '/admin/users' },
  { icon: <Building2 size={18} />, label: 'Teams', to: '/admin/teams' },
  { icon: <PhoneCall size={18} />, label: 'Calls', to: '/admin/calls' },
  { icon: <Tag size={18} />, label: 'Disposition Tags', to: '/admin/tags' },
  { icon: <BarChart3 size={18} />, label: 'Analytics', to: '/admin/analytics' },
];

const supervisorNav: NavItem[] = [
  { icon: <LayoutDashboard size={18} />, label: 'Dashboard', to: '/supervisor' },
  { icon: <Users size={18} />, label: 'My Team', to: '/supervisor/team' },
  { icon: <ListChecks size={18} />, label: 'Leads', to: '/supervisor/leads' },
  { icon: <PhoneCall size={18} />, label: 'Calls', to: '/supervisor/calls' },
  { icon: <BarChart3 size={18} />, label: 'Analytics', to: '/supervisor/analytics' },
];

const agentNav: NavItem[] = [
  { icon: <LayoutDashboard size={18} />, label: 'Workspace', to: '/agent' },
  { icon: <Users size={18} />, label: 'My Leads', to: '/agent/leads' },
  { icon: <ListChecks size={18} />, label: 'Follow-ups', to: '/agent/follow-ups' },
  { icon: <PhoneCall size={18} />, label: 'Call History', to: '/agent/calls' },
];

const agentMobileNav: NavItem[] = [
  { icon: <LayoutDashboard size={18} />, label: 'Dashboard', to: '/agent' },
  { icon: <ListChecks size={18} />, label: 'Follow-ups', to: '/agent/follow-ups' },
  { icon: <Users size={18} />, label: 'My Leads', to: '/agent/leads' },
  { icon: <PhoneCall size={18} />, label: 'Calls', to: '/agent/calls' },
  { icon: <UserCircle2 size={18} />, label: 'Profile', to: '/agent/profile' },
];

const roleNavs = {
  super_admin: superAdminNav,
  branch_admin: branchAdminNav,
  supervisor: supervisorNav,
  agent: agentNav,
};
const roleTitles = {
  super_admin: 'Super Admin',
  branch_admin: 'Branch Admin',
  supervisor: 'Supervisor',
  agent: 'Agent Workspace',
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, refreshToken, updateUser } = useAuthStore();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();
  const role = user?.role || 'agent';
  const navItems = roleNavs[role] || agentNav;
  const mobileNavItems = role === 'agent' ? agentMobileNav : navItems;
  const activeNavItems = role === 'agent' && isMobile ? mobileNavItems : navItems;
  const activeItem = [...activeNavItems]
    .sort((left, right) => right.to.length - left.to.length)
    .find((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`));
  const todayLabel = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date());
  const branchLabel = user?.branchId ? `Branch ${user.branchId.slice(0, 8)}` : 'All branches';
  const statusLabel = user?.status === 'on_break'
    ? 'On Break'
    : user?.status === 'inactive'
      ? 'Inactive'
      : 'Active';

  const handleLogout = async () => {
    try {
      if (refreshToken) await authService.logout(refreshToken);
    } catch {}
    logout();
    navigate('/login');
    toast.success('Logged out');
  };

  if (role === 'agent' && isMobile) {
    return (
      <div className="agent-mobile-app">
        <div className="agent-mobile-topbar">
          <div>
            <div className="agent-mobile-topbar__eyebrow">Agent Workspace</div>
            <div className="agent-mobile-topbar__title">{activeItem?.label || 'Dashboard'}</div>
          </div>
          <div className="agent-mobile-topbar__meta">
            <span className={`ops-pill ${user?.status === 'on_break' ? 'ops-pill--warning' : 'ops-pill--success'}`}>
              {statusLabel}
            </span>
          </div>
        </div>

        <div className="agent-mobile-content">{children}</div>

        <nav className="agent-mobile-dock" aria-label="Agent navigation">
          {mobileNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to.split('/').length <= 2}
              className={({ isActive }) =>
                `agent-mobile-dock__item ${item.label === 'My Leads' ? 'agent-mobile-dock__item--primary' : ''} ${isActive ? 'agent-mobile-dock__item--active' : ''}`
              }
            >
              <span className="agent-mobile-dock__icon">{item.icon}</span>
              <span className="sr-only">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo">TC</div>
          <div className="sidebar-brand-copy">
            <div className="sidebar-brand-name">TeleCRM</div>
            <div className="sidebar-role-badge">Revenue Ops Console</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-nav-section">Workspace</div>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to.split('/').length <= 2}
              className={({ isActive }) =>
                `sidebar-nav-item ${isActive ? 'sidebar-nav-item--active' : ''}`
              }
            >
              <span className="sidebar-nav-icon">{item.icon}</span>
              <span className="sidebar-nav-label">{item.label}</span>
              <ChevronRight size={14} className="sidebar-nav-chevron" />
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          {role === 'agent' && (
            <div className="sidebar-quick-status">
              <span className="sidebar-quick-status__label">Status</span>
              <button
                onClick={async () => {
                  try {
                    const isBreak = user?.status === 'on_break';
                    const res = isBreak ? await agentService.breakEnd() : await agentService.breakStart();
                    updateUser({ status: res.data.data.status });
                    toast.success(res.data.data.message);
                  } catch (err: any) {
                    toast.error(err.response?.data?.error?.message || 'Failed to update status');
                  }
                }}
                className={`badge sidebar-status-toggle ${user?.status === 'on_break' ? 'badge--warning' : 'badge--success'}`}
                title="Click to toggle break"
              >
                {user?.status === 'on_break' ? 'On Break' : 'Active'}
              </button>
            </div>
          )}

          <div className="sidebar-user-row">
            <div className="sidebar-user">
              <div className="sidebar-avatar">
                {user?.name?.charAt(0).toUpperCase() || '?'}
              </div>
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">{user?.name}</div>
                <div className="sidebar-user-email">{user?.email}</div>
              </div>
            </div>
            <button className="sidebar-logout" onClick={handleLogout} title="Log out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <div className="shell-topbar">
          <div className="shell-topbar__title-group">
            <div className="shell-topbar__eyebrow">{roleTitles[role]}</div>
            <div className="shell-topbar__title">{activeItem?.label || roleTitles[role]}</div>
          </div>

          <div className="shell-topbar__meta">
            <span className="ops-pill">{branchLabel}</span>
            <span className={`ops-pill ${user?.status === 'on_break' ? 'ops-pill--warning' : 'ops-pill--success'}`}>
              {statusLabel}
            </span>
            <span className="ops-pill">{todayLabel}</span>
            <button className="shell-topbar__icon" type="button" aria-label="Notifications">
              <Bell size={16} />
            </button>
          </div>
        </div>

        {children}
      </main>
    </div>
  );
}
