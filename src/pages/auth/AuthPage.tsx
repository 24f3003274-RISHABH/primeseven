import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.tsx';
import { apiRequest } from '../../api/client.ts';
import {
  ShieldCheck,
  Lock,
  BookOpen,
  CheckCircle2,
  Eye,
  EyeOff,
  Gift,
  AlertCircle,
} from 'lucide-react';

const REF_STORAGE_KEY = 'primeprep_ref_code';

export const AuthPage: React.FC = () => {
  const { profile, loading, authError, loginWithEmail, registerWithEmail } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const redirectUrl = searchParams.get('redirect');
  const queryRefCode = searchParams.get('ref');

  const [mode, setMode] = useState<'signin' | 'register'>(
    location.pathname === '/register' || Boolean(queryRefCode) ? 'register' : 'signin'
  );
  const [candidateName, setCandidateName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [referralBanner, setReferralBanner] = useState<{
    valid: boolean;
    referrer_name?: string;
    agent_name?: string;
    friend_discount_percent?: number;
    code?: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Capture ?ref=CODE from URL or sessionStorage so navigation does not lose referral attribution
  useEffect(() => {
    const incomingRef = (
      queryRefCode ||
      sessionStorage.getItem(REF_STORAGE_KEY) ||
      ''
    )
      .trim()
      .toUpperCase();

    if (incomingRef) {
      sessionStorage.setItem(REF_STORAGE_KEY, incomingRef);
      setReferralCode(incomingRef);
      apiRequest<any>(`/api/v1/referrals/lookup/${encodeURIComponent(incomingRef)}`)
        .then((res) => {
          if (res?.valid) {
            setReferralBanner(res);
          } else {
            setReferralBanner(null);
          }
        })
        .catch(() => setReferralBanner(null));
    }
  }, [queryRefCode]);

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

  const passwordsEntered = mode === 'register' && confirmPassword.length > 0;
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const passwordsMismatch = passwordsEntered && password !== confirmPassword;

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!email.trim() || !email.includes('@')) {
      setLocalError('Please enter a valid email address.');
      return;
    }

    if (!password) {
      setLocalError('Please enter your password.');
      return;
    }

    if (mode === 'register') {
      if (candidateName.trim().length < 2) {
        setLocalError('Please enter your full name (minimum 2 characters).');
        return;
      }
      if (password.length < 6) {
        setLocalError('Password must be at least 6 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setLocalError('Passwords do not match.');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === 'register') {
        const userProfile = await registerWithEmail(
          candidateName.trim(),
          email.trim(),
          password,
          confirmPassword,
          referralCode.trim() || undefined
        );
        if (userProfile) {
          sessionStorage.removeItem(REF_STORAGE_KEY);
        }
        routeAfterAuth(userProfile);
      } else {
        const userProfile = await loginWithEmail(email.trim(), password);
        routeAfterAuth(userProfile);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-14">
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
              Sign in with your registered email and password to access your purchased subject test
              series, attempt the two globally designated free diagnostic examinations, synchronize
              saved answers during live tests, and review question-by-question solutions.
            </p>

            {referralBanner?.valid && (
              <div className="mt-6 p-4 bg-blue-950/80 border border-blue-700/60 rounded-xl flex items-start gap-3">
                <Gift className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  <p className="font-semibold text-white">
                    Referral Benefit Unlocked ({referralBanner.code})
                  </p>
                  <p className="text-slate-300 mt-0.5">
                    Invited by{' '}
                    <span className="font-semibold text-white">
                      {referralBanner.referrer_name || referralBanner.agent_name}
                    </span>
                    . Register now to receive a{' '}
                    <span className="font-mono font-bold text-emerald-400">
                      {referralBanner.friend_discount_percent || 10}% discount
                    </span>{' '}
                    on your first CUET PG Subject Test Series purchase!
                  </p>
                </div>
              </div>
            )}

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
                    Step-by-Step Solutions & Score Analytics
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Review detailed explanations, positive and negative marks breakdown, and
                    accuracy metrics immediately after submitting each test.
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
        <div className="lg:col-span-5 p-8 sm:p-10 flex flex-col justify-center">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-blue-700" />
            <span>Encrypted Session Authentication</span>
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
              Sign In
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
              : 'Enter your registered email and password to access your account.'}
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
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
                  placeholder="Enter your full name"
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
                placeholder="name@example.com"
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'Minimum 6 characters' : 'Enter your password'}
                  className="w-full pl-3.5 pr-10 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-blue-600"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      className={`w-full pl-3.5 pr-10 py-2.5 text-sm bg-slate-50 border rounded-lg text-slate-900 focus:outline-none ${
                        passwordsMismatch
                          ? 'border-red-500 focus:border-red-600'
                          : passwordsMatch
                          ? 'border-emerald-500 focus:border-emerald-600'
                          : 'border-slate-200 focus:border-blue-600'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {passwordsMismatch && (
                    <p className="mt-1.5 text-xs font-medium text-red-600 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Passwords do not match.</span>
                    </p>
                  )}
                  {passwordsMatch && (
                    <p className="mt-1.5 text-xs font-medium text-emerald-700 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Passwords match.</span>
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Referral Code{' '}
                    <span className="font-normal text-slate-400">(Optional — Get 10% Off)</span>
                  </label>
                  <input
                    type="text"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                    placeholder="e.g. RISHABH10"
                    className="w-full px-3.5 py-2 text-xs font-mono uppercase bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-blue-600"
                  />
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading || submitting || (mode === 'register' && passwordsMismatch)}
              className="w-full py-3 px-4 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
            >
              {submitting
                ? 'Authenticating...'
                : mode === 'register'
                ? 'Create Candidate Account'
                : 'Sign In to Examination Portal'}
            </button>
          </form>

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
