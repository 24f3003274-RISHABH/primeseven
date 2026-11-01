import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export const Footer: React.FC = () => {
  const location = useLocation();

  if (location.pathname.startsWith('/exam/')) {
    return null;
  }

  return (
    <footer className="bg-white border-t border-slate-200 mt-20">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div className="md:col-span-2">
            <Link
              to="/"
              className="text-lg font-bold tracking-tight text-slate-900 font-display"
            >
              PrimePrep
            </Link>
            <p className="mt-3 text-sm text-slate-600 max-w-md leading-relaxed">
              Dedicated online examination and test-series platform for CUET PG aspirants.
              Structured around complete subject-wise test packages with NTA-standard
              marking (+4 / -1), server-authoritative timers, and detailed post-test analytics.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>CUET PG Examination Pattern</span>
              <span aria-hidden="true">·</span>
              <span>7 Postgraduate Subjects</span>
              <span aria-hidden="true">·</span>
              <span>Razorpay Verified Checkout</span>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-slate-900 tracking-wide">
              Postgraduate Subjects
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>
                <Link to="/subjects/political-science" className="hover:text-blue-700">
                  Political Science (HUQP18)
                </Link>
              </li>
              <li>
                <Link to="/subjects/philosophy" className="hover:text-blue-700">
                  Philosophy (HUQP16)
                </Link>
              </li>
              <li>
                <Link to="/subjects/psychology" className="hover:text-blue-700">
                  Psychology (HUQP20)
                </Link>
              </li>
              <li>
                <Link to="/subjects/history" className="hover:text-blue-700">
                  History (HUQP09)
                </Link>
              </li>
              <li>
                <Link to="/subjects/economics" className="hover:text-blue-700">
                  Economics (COQP10)
                </Link>
              </li>
              <li>
                <Link to="/subjects/geography" className="hover:text-blue-700">
                  Geography (HUQP08)
                </Link>
              </li>
              <li>
                <Link to="/subjects/disaster-management" className="hover:text-blue-700">
                  Disaster Management (COQP08)
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-slate-900 tracking-wide">
              Platform Navigation
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>
                <Link to="/subjects" className="hover:text-blue-700">
                  Subject Catalogue
                </Link>
              </li>
              <li>
                <Link to="/free-tests" className="hover:text-blue-700">
                  Global Free Diagnostic Tests
                </Link>
              </li>
              <li>
                <Link to="/dashboard" className="hover:text-blue-700">
                  Student Dashboard
                </Link>
              </li>
              <li>
                <Link to="/results" className="hover:text-blue-700">
                  My Results & Analytics
                </Link>
              </li>
              <li>
                <Link to="/purchases" className="hover:text-blue-700">
                  Subject Purchase History
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>© {new Date().getFullYear()} PrimePrep Academic Systems. All rights reserved.</p>
          <div className="flex items-center gap-3">
            <span>One-Attempt Examination Integrity</span>
            <span aria-hidden="true">·</span>
            <span>Server-Enforced Deadlines</span>
            <span aria-hidden="true">·</span>
            <span>INR (Paise) Precision Billing</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
