import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { authService, agentService } from '../../services/crm.service';
import toast from 'react-hot-toast';
import {
  LayoutDashboard, Users, Building2, PhoneCall,
  BarChart3, Settings, LogOut, ChevronRight, Bell,
  UserCheck, FolderOpen, ListChecks, Tag
} from 'lucide-react';

interface NavItem { icon: React.ReactNode; label: string; to: string; }

const adminNav: NavItem[] = [
  { icon: <LayoutDashboard size={18} />, label: 'Dashboard', to: '/admin' },
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
  { icon: <Users size={18} />, label: 'Interested Leads', to: '/agent/leads' },
  { icon: <ListChecks size={18} />, label: 'Follow-ups', to: '/agent/follow-ups' },
  { icon: <PhoneCall size={18} />, label: 'Call History', to: '/agent/calls' },
];

const roleNavs = { admin: adminNav, supervisor: supervisorNav, agent: agentNav };
const roleTitles = { admin: 'Admin Panel', supervisor: 'Supervisor', agent: 'Agent Workspace' };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, refreshToken, updateUser } = useAuthStore();
  const navigate = useNavigate();
  const role = user?.role || 'agent';
  const navItems = roleNavs[role] || agentNav;

  const handleLogout = async () => {
    try {
      if (refreshToken) await authService.logout(refreshToken);
    } catch {}
    logout();
    navigate('/login');
    toast.success('Logged out');
  };

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="sidebar-logo">📞</div>
          <div>
            <div className="sidebar-brand-name">TeleCRM</div>
            <div className="sidebar-role-badge">{roleTitles[role]}</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
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

        {/* User footer */}
        <div className="sidebar-footer" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          {role === 'agent' && (
            <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Status</span>
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
                className={`badge ${user?.status === 'on_break' ? 'badge--warning' : 'badge--success'}`} 
                style={{ cursor: 'pointer', border: 'none', transition: '0.2s', padding: '4px 8px' }}
                title="Click to toggle break"
              >
                {user?.status === 'on_break' ? 'On Break' : 'Active'}
              </button>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <div className="sidebar-user" style={{ flex: 1, minWidth: 0 }}>
              <div className="sidebar-avatar">
                {user?.name?.charAt(0).toUpperCase() || '?'}
              </div>
              <div className="sidebar-user-info" style={{ overflow: 'hidden' }}>
                <div className="sidebar-user-name" style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{user?.name}</div>
                <div className="sidebar-user-email" style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{user?.email}</div>
              </div>
            </div>
            <button className="sidebar-logout" onClick={handleLogout} title="Log out" style={{ flexShrink: 0 }}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
