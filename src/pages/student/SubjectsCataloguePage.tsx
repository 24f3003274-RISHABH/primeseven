import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest, formatPaiseToINR } from '../../api/client.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { CheckCircle2, Lock, Search } from 'lucide-react';

export const SubjectsCataloguePage: React.FC = () => {
  const { profile } = useAuth();
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unlocked' | 'locked'>('all');

  useEffect(() => {
    setLoading(true);
    apiRequest<{ subjects: any[] }>('/api/v1/subjects')
      .then((res) => setSubjects(res.subjects || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [profile]);

  const filtered = subjects.filter((s) => {
    const matchesQuery =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.paper_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesQuery) return false;
    if (statusFilter === 'unlocked') return Boolean(s.is_purchased);
    if (statusFilter === 'locked') return !s.is_purchased;
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <p className="text-xs font-medium text-blue-700">CUET PG SUBJECT CATALOGUE</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 font-display">
            Subject-Wise Test Series
          </h1>
          <p className="mt-2 text-sm text-slate-600 max-w-2xl">
            Select your postgraduate paper to browse Sectional Tests, Full-Length Mock
            Examinations, and Previous Year Question papers. Purchasing a subject unlocks all
            eligible premium tests within that subject.
          </p>
        </div>

        {/* Search & Interactive Filter Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search subject or code..."
              className="pl-9 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600"
            />
          </div>

          {profile && (
            <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({subjects.length})
              </button>
              <button
                onClick={() => setStatusFilter('unlocked')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  statusFilter === 'unlocked'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Purchased
              </button>
              <button
                onClick={() => setStatusFilter('locked')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  statusFilter === 'locked'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Available to Buy
              </button>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div
              key={i}
              className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-8 p-10 bg-white border border-slate-200 rounded-xl text-center">
          <p className="text-sm text-slate-600">No subjects match your current filter.</p>
          <button
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('all');
            }}
            className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((subj) => (
            <div
              key={subj.id}
              className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between hover:border-slate-300 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <div className="flex items-center gap-1.5 font-mono">
                    <span className="font-semibold text-slate-800">{subj.paper_code}</span>
                    <span>·</span>
                    <span className="tabular-nums">{subj.total_tests} Tests</span>
                  </div>

                  {subj.is_purchased ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Series Unlocked
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-slate-600">
                      <Lock className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-mono font-bold text-slate-900 tabular-nums">
                        {subj.package ? formatPaiseToINR(subj.package.price_paise) : '—'}
                      </span>
                    </span>
                  )}
                </div>

                <h2 className="mt-3 text-xl font-bold text-slate-900 font-display">{subj.name}</h2>

                <p className="mt-2 text-sm text-slate-600 leading-relaxed">{subj.description}</p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums">
                  <span>{subj.category_counts?.sectional || 15} Sectional</span>
                  <span>·</span>
                  <span>{subj.category_counts?.full_length || 10} Full-Length</span>
                  <span>·</span>
                  <span>{subj.category_counts?.pyq || 5} PYQ</span>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <Link
                    to={`/subjects/${subj.slug}`}
                    className="flex-1 py-2.5 px-4 text-center text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
                  >
                    Explore Subject
                  </Link>
                  {!subj.is_purchased && subj.package?.is_available_for_sale && (
                    <Link
                      to={`/subjects/${subj.slug}/purchase`}
                      className="py-2.5 px-4 text-center text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
                    >
                      Buy Series ({formatPaiseToINR(subj.package.price_paise)})
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
