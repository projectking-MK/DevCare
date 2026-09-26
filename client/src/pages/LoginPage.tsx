import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Lock, Mail, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { isChildDevicePaired } from '../utils/storage';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAccountInfo, setShowAccountInfo] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { user, login } = useAuth();
  const navigate = useNavigate();

  // If this device was paired as a child device and no parent session exists,
  // automatically navigate directly to the child companion screen.
  React.useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (isChildDevicePaired() && !user && searchParams.get('mode') !== 'parent') {
      navigate('/child', { replace: true });
    }
  }, [user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid credentials. Please verify email and password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 text-slate-100 font-sans">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6">
        {/* Brand */}
        <div className="text-center space-y-2">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-tr from-brand-600 to-emerald-400 items-center justify-center text-white shadow-xl shadow-emerald-950/50 mb-2">
            <Shield className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">GuardianLink</h1>
          <p className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">
            Parental Safety Portal
          </p>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Email ID
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter mail ID"
                autoComplete="email"
                className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
                className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-emerald-950/50 flex items-center justify-center space-x-2 transition-all active:scale-[0.99]"
            >
              <span>{isSubmitting ? 'Authenticating...' : 'Login'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowAccountInfo(!showAccountInfo)}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 font-medium text-xs border border-slate-700/60 transition-colors"
          >
            Create Parent Account
          </button>
        </form>

        {/* Single-Owner Architecture Info Modal/Disclosure */}
        {showAccountInfo && (
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-400 space-y-2 animate-fadeIn">
            <div className="flex items-center space-x-1.5 font-semibold text-slate-200">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Single-Owner Deployment Architecture</span>
            </div>
            <p className="leading-relaxed">
              In this database-free zero-persistence security model, parent authentication is tied to environment configuration (<span className="font-mono text-emerald-400">PARENT_EMAIL</span> and bcrypt <span className="font-mono text-emerald-400">PARENT_PASSWORD_HASH</span>).
            </p>
          </div>
        )}

        {/* Security Disclosures */}
        <div className="text-[11px] text-slate-500 text-center space-y-1 pt-2 border-t border-slate-800/80">
          <p>Protected by secure HttpOnly + SameSite session cookies.</p>
          <p>JavaScript cannot read or extract authentication tokens.</p>
        </div>
      </div>
    </div>
  );
};
