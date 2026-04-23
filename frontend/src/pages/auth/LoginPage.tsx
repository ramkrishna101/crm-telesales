import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '../../services/api';
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
  const setAuth = useAuthStore((s) => s.setAuth);
  const [isLoading, setIsLoading] = useState(false);

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
      const destination = from || ROLE_REDIRECTS[user.role as keyof typeof ROLE_REDIRECTS] || '/';
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

          <form onSubmit={handleSubmit(onSubmit)} className="login-form">
            {/* Email */}
            <div className="form-group">
              <label htmlFor="email" className="form-label">Email address</label>
              <input
                id="email"
                type="email"
                className={`form-input ${errors.email ? 'form-input-error' : ''}`}
                placeholder="agent@crm.com"
                autoComplete="email"
                {...register('email')}
              />
              {errors.email && <p className="form-error">{errors.email.message}</p>}
            </div>

            {/* Password */}
            <div className="form-group">
              <label htmlFor="password" className="form-label">Password</label>
              <input
                id="password"
                type="password"
                className={`form-input ${errors.password ? 'form-input-error' : ''}`}
                placeholder="••••••••"
                autoComplete="current-password"
                {...register('password')}
              />
              {errors.password && <p className="form-error">{errors.password.message}</p>}
            </div>

            {/* Submit */}
            <button
              id="login-submit-btn"
              type="submit"
              disabled={isLoading}
              className="login-btn"
            >
              {isLoading ? (
                <span className="login-btn-spinner">
                  <span className="spinner" /> Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        {/* Footer hint */}
        <p className="login-footer">
          Secure access · Role-based dashboard · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
