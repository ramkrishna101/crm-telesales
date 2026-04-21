import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

export default function UnauthorizedPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0f172a', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: '4rem' }}>🚫</div>
      <h1 style={{ color: '#f87171', margin: 0 }}>Access Denied</h1>
      <p style={{ color: '#64748b' }}>You don't have permission to view this page.</p>
      <button
        onClick={() => { logout(); navigate('/login'); }}
        style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', cursor: 'pointer', fontSize: '0.9rem' }}
      >
        Back to Login
      </button>
    </div>
  );
}
