import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.tsx';
import { ShieldCheck, Lock, BookOpen, CheckCircle2, UserCheck, Shield } from 'lucide-react';

export const AuthPage: React.FC = () => {
  const { profile, loading, authError, loginWithEmail, registerWithEmail } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const redirectUrl = searchParams.get('redirect');

  const [mode, setMode] = useState<'signin' | 'register'>(
    location.pathname === '/register' ? 'register' : 'signin'
  );
  const [candidateName, setCandidateName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && profile) {
      if (redirectUrl && redirectUrl.startsWith('/')) {
        navigate(redirectUrl, { replace: true });
      } else if (profile.role === 'admin') {
        navigate('/admin', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [profile, loading, redirectUrl, navigate]);

  const routeAfterAuth = (userProfile: { role: 'student' | 'admin' } | null) => {
    if (!userProfile) return;
    if (redirectUrl && redirectUrl.startsWith('/')) {
      navigate(redirectUrl, { replace: true });
    } else if (userProfile.role === 'admin') {
      navigate('/admin', { replace: true });
    } else {
      navigate('/dashboard', { replace: true });
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!email.trim() || !email.includes('@')) {
      setLocalError('Please enter a valid candidate email address.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'register') {
        if (candidateName.trim().length < 2) {
          setLocalError('Please enter your full name (minimum 2 characters).');
          return;
        }
        if (password.length < 6) {
          setLocalError('Password must be at least 6 characters.');
          return;
        }
        const userProfile = await registerWithEmail(candidateName.trim(), email.trim(), password);
        routeAfterAuth(userProfile);
      } else {
        const userProfile = await loginWithEmail(email.trim(), password);
        routeAfterAuth(userProfile);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickDemoLogin = async (demoEmail: string, demoName: string) => {
    setLocalError(null);
    setSubmitting(true);
    try {
      const userProfile = await loginWithEmail(demoEmail, '', demoName);
      routeAfterAuth(userProfile);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch bg-white border border-slate-200 rounded-2xl overflow-hidden">
        {/* Left Academic Briefing */}
        <div className="lg:col-span-7 p-8 sm:p-12 bg-slate-900 text-white flex flex-col justify-between">
          <div>
            <p className="text-xs font-mono text-blue-300">
              CUET PG ONLINE EXAMINATION PORTAL
            </p>
            <h1 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight font-display">
              Candidate Registration & Examination Login
            </h1>
            <p className="mt-4 text-sm text-slate-300 leading-relaxed">
              Sign in with your candidate email and password to access your purchased subject test
              series, attempt the two globally designated free diagnostic examinations, synchronize
              saved answers during live tests, and review question-by-question solutions.
            </p>

            <div className="mt-8 space-y-4 border-t border-slate-800 pt-6">
              <div className="flex items-start gap-3">
                <BookOpen className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Subject-Wise Complete Series Entitlements
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    One purchase unlocks all 15 Sectional, 10 Full-Length, and 5 PYQ tests in your
                    chosen subject.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Lock className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Authoritative Server-Side Timer & Answer Persistence
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Every response is saved in real time to PostgreSQL. Browser refreshes never
                    erase your answers or reset your deadline.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Role-Based Student & Administrator Workspaces
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Students are routed to their preparation dashboard; administrators are routed
                    to the 13-module platform console.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>NTA Marking Scheme (+4 / -1 / 0)</span>
            <span>·</span>
            <span>7 Postgraduate Subjects</span>
          </div>
        </div>

        {/* Right Sign-In / Registration Action Panel */}
        <div className="lg:col-span-5 p-8 sm:p-12 flex flex-col justify-center">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-blue-700" />
            <span>Supabase / JWT Authenticated Session</span>
          </div>

          {/* Mode Toggle: Sign In vs Register */}
          <div className="mt-4 grid grid-cols-2 p-1 bg-slate-100 rounded-lg text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setLocalError(null);
              }}
              className={`py-2 rounded-md transition-colors cursor-pointer ${
                mode === 'signin'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Candidate Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setLocalError(null);
              }}
              className={`py-2 rounded-md transition-colors cursor-pointer ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              New Registration
            </button>
          </div>

          <h2 className="mt-5 text-xl font-bold text-slate-900 font-display">
            {mode === 'register' ? 'Create Candidate Account' : 'Sign in to PrimePrep'}
          </h2>
          <p className="mt-1.5 text-sm text-slate-600">
            {mode === 'register'
              ? 'Register with your email address to begin CUET PG mock examinations.'
              : 'Enter your registered email and password to resume your preparation.'}
          </p>

          {redirectUrl && (
            <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700">
              Your selected destination (<span className="font-mono">{redirectUrl}</span>) will
              open automatically after authentication.
            </div>
          )}

          {(localError || authError) && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {localError || authError}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="mt-5 space-y-3.5">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Candidate Full Name
                </label>
                <input
                  type="text"
                  required
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
                  placeholder="e.g., Aarav Sharma"
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-blue-600"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="candidate@university.edu"
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Password
              </label>
              <input
                type="password"
                required={mode === 'register'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'Minimum 6 characters' : 'Enter your password'}
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-blue-600"
              />
            </div>

            <button
              type="submit"
              disabled={loading || submitting}
              className="w-full py-3 px-4 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
            >
              {submitting
                ? 'Authenticating...'
                : mode === 'register'
                ? 'Create Candidate Account'
                : 'Sign In to Examination Portal'}
            </button>
          </form>

          {/* Instant Demo Access for Testing */}
          <div className="mt-6 pt-5 border-t border-slate-200">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">
              Quick Demo Access
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleQuickDemoLogin('student@primeprep.in', 'Aarav Sharma')}
                className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5 text-blue-700" />
                <span>Demo Student</span>
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() =>
                  handleQuickDemoLogin('rishabhkesharwani8218@gmail.com', 'Rishabh Kesharwani')
                }
                className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                <Shield className="w-3.5 h-3.5 text-blue-700" />
                <span>Admin Console</span>
              </button>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-200 text-xs text-slate-500">
            <p>
              Want to explore the test catalogue before signing in?{' '}
              <Link to="/subjects" className="text-blue-700 font-medium hover:underline">
                Browse all 7 subjects
              </Link>{' '}
              or{' '}
              <Link to="/tests" className="text-blue-700 font-medium hover:underline">
                View all 210 tests
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
