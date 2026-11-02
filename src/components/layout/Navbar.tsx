import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.tsx';
import { LogOut, ChevronDown } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { profile, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  // Hide standard top bar inside active full-screen examination hall
  if (location.pathname.startsWith('/exam/')) {
    return null;
  }

  const handleSignInClick = () => {
    if (location.pathname === '/login') return;
    navigate('/login');
  };

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-8 px-6 py-4">
        {/* Zone 1: Single text element wordmark */}
        <Link
          to="/"
          className="text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 font-display"
        >
          PrimePrep
        </Link>

        {/* Zone 2: 4–5 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
          <Link
            to="/subjects"
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 py-1 ${
              isActive('/subjects')
                ? 'text-blue-700 underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            Subjects
          </Link>
          <Link
            to="/tests"
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 py-1 ${
              location.pathname === '/tests'
                ? 'text-blue-700 underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            Test Catalogue
          </Link>
          <Link
            to="/free-tests"
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 py-1 ${
              isActive('/free-tests')
                ? 'text-blue-700 underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            Free Tests
          </Link>
          {profile && (
            <Link
              to="/dashboard"
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 py-1 ${
                isActive('/dashboard')
                  ? 'text-blue-700 underline underline-offset-8 decoration-2'
                  : ''
              }`}
            >
              Dashboard
            </Link>
          )}
          {profile && (
            <Link
              to="/results"
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 py-1 ${
                isActive('/results')
                  ? 'text-blue-700 underline underline-offset-8 decoration-2'
                  : ''
              }`}
            >
              My Results
            </Link>
          )}
          {profile?.role === 'admin' && (
            <Link
              to="/admin"
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 py-1 ${
                isActive('/admin')
                  ? 'text-blue-700 underline underline-offset-8 decoration-2'
                  : ''
              }`}
            >
              Admin Console
            </Link>
          )}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="relative flex items-center shrink-0">
          {!profile ? (
            <button
              onClick={handleSignInClick}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sign In
            </button>
          ) : (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((prev) => !prev)}
                className="flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-slate-800 bg-slate-100 hover:bg-slate-200/80 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span className="truncate max-w-[150px]">{profile.full_name}</span>
                {profile.role === 'admin' && (
                  <>
                    <span className="text-xs text-slate-500">·</span>
                    <span className="text-xs font-mono uppercase text-blue-700">Admin</span>
                  </>
                )}
                <ChevronDown className="w-4 h-4 text-slate-500" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-lg py-2 z-50">
                  <div className="px-4 py-2.5 border-b border-slate-100">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {profile.full_name}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{profile.email}</p>
                  </div>

                  <div className="py-1">
                    <Link
                      to="/dashboard"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Student Dashboard
                    </Link>
                    <Link
                      to="/subjects"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Subject Catalogue (7 Subjects)
                    </Link>
                    <Link
                      to="/tests"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Individual Test Catalogue (210 Tests)
                    </Link>
                    <Link
                      to="/results"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      My Results & Analytics
                    </Link>
                    <Link
                      to="/purchases"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      My Purchases
                    </Link>
                    <Link
                      to="/change-password"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Change Password
                    </Link>
                    {profile.role === 'admin' && (
                      <Link
                        to="/admin"
                        onClick={() => setMenuOpen(false)}
                        className="block px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50/50"
                      >
                        Open Admin Console
                      </Link>
                    )}
                  </div>

                  <div className="border-t border-slate-100 pt-1 mt-1">
                    <button
                      onClick={async () => {
                        setMenuOpen(false);
                        await logout();
                        navigate('/');
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-xs font-medium text-red-600 hover:bg-red-50/60 text-left cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Secondary Navigation Strip */}
      <div className="flex md:hidden items-center gap-5 overflow-x-auto px-6 py-2.5 bg-slate-50 border-t border-slate-200 text-xs font-medium text-slate-600">
        <Link to="/subjects" className="whitespace-nowrap shrink-0 hover:text-slate-900">
          Subjects
        </Link>
        <Link to="/tests" className="whitespace-nowrap shrink-0 hover:text-slate-900">
          All Tests
        </Link>
        <Link to="/free-tests" className="whitespace-nowrap shrink-0 hover:text-slate-900">
          Free Tests
        </Link>
        {profile && (
          <>
            <Link to="/dashboard" className="whitespace-nowrap shrink-0 hover:text-slate-900">
              Dashboard
            </Link>
            <Link to="/results" className="whitespace-nowrap shrink-0 hover:text-slate-900">
              Results
            </Link>
          </>
        )}
        {profile?.role === 'admin' && (
          <Link
            to="/admin"
            className="whitespace-nowrap shrink-0 font-semibold text-blue-700"
          >
            Admin Console
          </Link>
        )}
      </div>
    </header>
  );
};
