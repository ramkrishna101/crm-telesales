import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, LockKeyhole, CircleHelp } from 'lucide-react';
import { api } from '../../services/api';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

const ROLE_REDIRECTS = {
  admin: '/admin',
  supervisor: '/supervisor',
  agent: '/agent',
};

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const setAuth = useAuthStore((s) => s.setAuth);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const [isLoading, setIsLoading] = useState(false);

  React.useEffect(() => {
    if (isAuthenticated && user) {
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname;
      const destination = from || ROLE_REDIRECTS[user.role as keyof typeof ROLE_REDIRECTS] || '/';
      navigate(destination, { replace: true });
    }
  }, [isAuthenticated, user, navigate, location]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema as any) });

  const onSubmit = async (values: LoginForm) => {
    setIsLoading(true);
    try {
      const { data } = await api.post('/auth/login', values);
      const { user, accessToken, refreshToken } = data.data;
      setAuth(user, accessToken, refreshToken);

      const from = (location.state as { from?: { pathname: string } })?.from?.pathname;
      const isUsableFrom = from && from !== '/' && from !== '/login';
      const destination = isUsableFrom ? from : ROLE_REDIRECTS[user.role as keyof typeof ROLE_REDIRECTS] || '/admin';
      navigate(destination, { replace: true });
      toast.success(`Welcome back, ${user.name}!`);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message || 'Login failed';
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const loginForm = (
    <form onSubmit={handleSubmit(onSubmit)} className={`login-form ${isMobile ? 'login-form--mobile' : ''}`}>
      <div className={`form-group ${isMobile ? 'form-group--mobile' : ''}`}>
        <label htmlFor="email" className="form-label">Email address</label>
        <div className={isMobile ? 'login-input-shell' : ''}>
          {isMobile && (
            <span className="login-input-icon" aria-hidden="true">
              <Mail size={18} />
            </span>
          )}
          <input
            id="email"
            type="email"
            className={`form-input ${errors.email ? 'form-input-error' : ''} ${isMobile ? 'form-input--mobile' : ''}`}
            placeholder="agent@crm.com"
            autoComplete="email"
            {...register('email')}
          />
        </div>
        {errors.email && <p className="form-error">{errors.email.message}</p>}
      </div>

      <div className={`form-group ${isMobile ? 'form-group--mobile' : ''}`}>
        <label htmlFor="password" className="form-label">Password</label>
        <div className={isMobile ? 'login-input-shell' : ''}>
          {isMobile && (
            <span className="login-input-icon" aria-hidden="true">
              <LockKeyhole size={18} />
            </span>
          )}
          <input
            id="password"
            type="password"
            className={`form-input ${errors.password ? 'form-input-error' : ''} ${isMobile ? 'form-input--mobile' : ''}`}
            placeholder="••••••••"
            autoComplete="current-password"
            {...register('password')}
          />
        </div>
        {errors.password && <p className="form-error">{errors.password.message}</p>}
      </div>

      {isMobile && (
        <div className="login-mobile-meta">
          <label className="login-mobile-check">
            <input type="checkbox" />
            <span>Remember me</span>
          </label>
          <button
            type="button"
            className="login-mobile-help"
            onClick={() => toast('Contact your administrator for login help.')}
          >
            <CircleHelp size={14} />
            <span>Need help?</span>
          </button>
        </div>
      )}

      <button
        id="login-submit-btn"
        type="submit"
        disabled={isLoading}
        className={`login-btn ${isMobile ? 'login-btn--mobile' : ''}`}
      >
        {isLoading ? (
          <span className="login-btn-spinner">
            <span className="spinner" /> Signing in...
          </span>
        ) : (
          isMobile ? 'Continue' : 'Sign In'
        )}
      </button>
    </form>
  );

  if (isMobile) {
    return (
      <div className="login-page login-page--mobile">
        <div className="login-mobile-shell">
          <div className="login-mobile-top">
            <div className="login-mobile-graphic" aria-hidden="true">
              <div className="login-mobile-graphic-ring" />
              <div className="login-mobile-graphic-arm" />
              <div className="login-mobile-graphic-block" />
              <div className="login-mobile-graphic-accent" />
            </div>
            <div className="login-mobile-brand">TeleCRM</div>
          </div>

          <div className="login-mobile-sheet">
            <h1 className="login-mobile-title">Login with email address</h1>
            {loginForm}
            <p className="login-mobile-footer">Shared login for agents, supervisors, and admins</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      {/* Background */}
      <div className="login-bg">
        <div className="login-orb login-orb-1" />
        <div className="login-orb login-orb-2" />
        <div className="login-orb login-orb-3" />
      </div>

      <div className="login-container">
        {/* Logo / Brand */}
        <div className="login-brand">
          <div className="login-logo">
            <span className="login-logo-icon">📞</span>
          </div>
          <h1 className="login-title">TeleCRM</h1>
          <p className="login-subtitle">Telesales Command Centre</p>
        </div>

        {/* Card */}
        <div className="login-card">
          <h2 className="login-card-title">Sign in to your account</h2>
          <p className="login-card-sub">Enter your credentials to access the dashboard</p>

          {loginForm}
        </div>

        {/* Footer hint */}
        <p className="login-footer">
          Secure access · Role-based dashboard · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
