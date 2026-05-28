import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { LogOut, Coffee, Mail, ShieldCheck, PhoneCall, Users } from 'lucide-react';
import AppLayout from '../../components/layout/AppLayout';
import { useAuthStore } from '../../store/authStore';
import { authService, agentService } from '../../services/crm.service';
import { useIsMobile } from '../../hooks/useIsMobile';
import toast from 'react-hot-toast';

export default function AgentProfilePage() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { user, logout, refreshToken, updateUser } = useAuthStore();
  const { data: dashData, refetch } = useQuery({
    queryKey: ['agent-profile-dashboard'],
    queryFn: () => agentService.dashboard(),
  });
  const stats = dashData?.data?.data?.stats;

  const handleLogout = async () => {
    try {
      if (refreshToken) await authService.logout(refreshToken);
    } catch {}
    logout();
    navigate('/login');
    toast.success('Logged out');
  };

  const toggleBreak = async () => {
    try {
      const isBreak = user?.status === 'on_break';
      const res = isBreak ? await agentService.breakEnd() : await agentService.breakStart();
      updateUser({ status: res.data.data.status });
      toast.success(res.data.data.message);
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to update status');
    }
  };

  if (isMobile) {
    return (
      <AppLayout>
        <div className="agent-mobile-stack">
          <section className="agent-mobile-summary-card">
            <div>
              <div className="section-eyebrow">Account</div>
              <h1 className="agent-mobile-section-title">Profile</h1>
              <p className="page-subtitle" style={{ marginTop: 6 }}>
                {user?.status === 'on_break' ? 'Break mode is active right now' : 'You are available for the next lead'}
              </p>
            </div>

            <div className="agent-mobile-profile-card">
              <div className="agent-mobile-profile-avatar">{user?.name?.charAt(0).toUpperCase() || '?'}</div>
              <div>
                <div className="agent-mobile-lead-name">{user?.name || 'Agent'}</div>
                <div className="agent-mobile-muted">{user?.email || 'No email available'}</div>
                <div className="agent-mobile-status-row">
                  <span className="agent-mobile-status-dot" />
                  <span>{user?.status === 'on_break' ? 'On Break' : 'Active'}</span>
                </div>
              </div>
            </div>

            <div className="agent-mobile-stats-grid">
              {[
                { label: 'Calls Today', value: stats?.callsToday || 0 },
                { label: 'My Leads', value: stats?.totalLeads || 0 },
                { label: 'Pending', value: stats?.pendingLeads || 0 },
                { label: 'Break Time', value: `${stats?.breakMinutesToday || 0}m` },
              ].map(({ label, value }) => (
                <div key={label} className="agent-mobile-stat-tile">
                  <div className="agent-mobile-stat-value">{value}</div>
                  <div className="agent-mobile-stat-label">{label}</div>
                </div>
              ))}
            </div>

            <div className="agent-mobile-inline-actions">
              <button className="btn btn-secondary" onClick={toggleBreak}>
                <Coffee size={16} /> {user?.status === 'on_break' ? 'End Break' : 'Take Break'}
              </button>
              <button className="btn btn-secondary" onClick={() => refetch()}>
                <PhoneCall size={16} /> Refresh Stats
              </button>
            </div>
          </section>

          <section className="card card--mobile">
            <div className="card-header card-header--dense">
              <div>
                <div className="card-kicker">Session details</div>
                <h2 className="card-title">Current account</h2>
              </div>
            </div>

            <div className="agent-mobile-detail-list">
              <div className="agent-mobile-detail-item">
                <div className="agent-mobile-detail-label"><Mail size={14} /> Email</div>
                <div className="agent-mobile-detail-value">{user?.email || 'Not available'}</div>
              </div>
              <div className="agent-mobile-detail-item">
                <div className="agent-mobile-detail-label"><ShieldCheck size={14} /> Role</div>
                <div className="agent-mobile-detail-value">{user?.role || 'agent'}</div>
              </div>
              <div className="agent-mobile-detail-item">
                <div className="agent-mobile-detail-label"><Users size={14} /> Queue Status</div>
                <div className="agent-mobile-detail-value">{user?.status === 'on_break' ? 'Paused' : 'Ready for leads'}</div>
              </div>
            </div>

            <div className="agent-mobile-inline-actions">
              <button className="btn btn-primary" onClick={handleLogout}>
                <LogOut size={16} /> Logout
              </button>
            </div>
          </section>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="page-container">
        <section className="card">
          <div className="section-eyebrow">Account</div>
          <h1 className="page-title">Profile</h1>
          <p className="page-subtitle" style={{ marginTop: 6 }}>Manage your agent session and availability</p>

          <div className="agent-mobile-profile-card">
            <div className="agent-mobile-profile-avatar">{user?.name?.charAt(0).toUpperCase() || '?'}</div>
            <div>
              <div className="agent-mobile-lead-name">{user?.name || 'Agent'}</div>
              <div className="agent-mobile-muted">{user?.email || 'No email available'}</div>
              <div className="agent-mobile-muted" style={{ marginTop: 4 }}>Status: {user?.status || 'active'}</div>
            </div>
          </div>

          <div className="agent-mobile-inline-actions">
            <button className="btn btn-secondary" onClick={toggleBreak}>
              <Coffee size={16} /> {user?.status === 'on_break' ? 'End Break' : 'Take Break'}
            </button>
            <button className="btn btn-primary" onClick={handleLogout}>
              <LogOut size={16} /> Logout
            </button>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}