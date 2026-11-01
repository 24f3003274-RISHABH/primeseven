import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../../api/client.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  Clock,
  FileText,
  Lock,
  PlayCircle,
  Search,
  LayoutGrid,
  List,
} from 'lucide-react';

export const IndividualTestCataloguePage: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tests, setTests] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedSubject, setSelectedSubject] = useState<string>(
    searchParams.get('subject') || 'all'
  );
  const [selectedCategory, setSelectedCategory] = useState<string>(
    searchParams.get('category') || 'all'
  );
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'free' | 'unlocked' | 'locked' | 'completed'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  useEffect(() => {
    setLoading(true);
    apiRequest<{ tests: any[]; subjects: any[] }>('/api/v1/tests?limit=250')
      .then((res) => {
        setTests(res.tests || []);
        setSubjects(res.subjects || []);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [profile]);

  const handleSubjectFilterChange = (slug: string) => {
    setSelectedSubject(slug);
    const next = new URLSearchParams(searchParams);
    if (slug === 'all') next.delete('subject');
    else next.set('subject', slug);
    setSearchParams(next, { replace: true });
  };

  const handleCategoryFilterChange = (cat: string) => {
    setSelectedCategory(cat);
    const next = new URLSearchParams(searchParams);
    if (cat === 'all') next.delete('category');
    else next.set('category', cat);
    setSearchParams(next, { replace: true });
  };

  /**
   * Critical behavior:
   * - Students can browse every published test without purchasing.
   * - When an authenticated student clicks a locked premium test, redirect them
   *   directly to the purchase page for that test's subject.
   * - Never display raw HTTP 403 errors for missing subject entitlements.
   */
  const handleTestAction = (test: any) => {
    const intendedUrl = `/tests/${test.id}/instructions`;

    if (test.student_status === 'completed' && test.attempt_summary?.attempt_id) {
      navigate(`/results/${test.attempt_summary.attempt_id}`);
      return;
    }

    if (test.is_unlocked) {
      if (!profile) {
        navigate(`/login?redirect=${encodeURIComponent(intendedUrl)}`);
      } else {
        navigate(intendedUrl);
      }
      return;
    }

    // Locked premium test -> Redirect to the purchase page for that test's subject
    const purchaseUrl = `/subjects/${test.subject_slug}/purchase?returnTo=${encodeURIComponent(
      intendedUrl
    )}&highlightTest=${encodeURIComponent(test.title)}`;

    if (!profile) {
      navigate(`/login?redirect=${encodeURIComponent(purchaseUrl)}`);
    } else {
      navigate(purchaseUrl);
    }
  };

  const filteredTests = tests.filter((t) => {
    if (selectedSubject !== 'all' && t.subject_slug !== selectedSubject) return false;
    if (selectedCategory !== 'all' && t.category_slug !== selectedCategory) return false;
    if (statusFilter === 'free' && t.access_type !== 'free') return false;
    if (statusFilter === 'unlocked' && !t.is_unlocked) return false;
    if (statusFilter === 'locked' && t.is_unlocked) return false;
    if (statusFilter === 'completed' && t.student_status !== 'completed') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const match =
        t.title.toLowerCase().includes(q) ||
        t.subject_name.toLowerCase().includes(q) ||
        t.paper_code.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q);
      if (!match) return false;
    }

    return true;
  });

  const sectionalCount = filteredTests.filter((t) => t.category_slug === 'sectional').length;
  const fullLengthCount = filteredTests.filter((t) => t.category_slug === 'full_length').length;
  const pyqCount = filteredTests.filter((t) => t.category_slug === 'pyq').length;

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div>
          <p className="text-xs font-medium text-blue-700 uppercase tracking-wide">
            COMPLETE CUET PG EXAMINATION DIRECTORY
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 font-display">
            Individual Test Catalogue
          </h1>
          <p className="mt-2 text-sm text-slate-600 max-w-2xl">
            Browse all {tests.length} published CUET PG mock examinations across 7 postgraduate
            subjects and 3 test categories. Click any unlocked test to start or any locked premium
            test to unlock its complete subject series.
          </p>
        </div>

        {/* Summary Counters */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-600 bg-white border border-slate-200 rounded-xl px-4 py-3 tabular-nums">
          <span>
            <strong className="text-slate-900">{filteredTests.length}</strong> Matching Tests
          </span>
          <span>·</span>
          <span>{sectionalCount} Sectional</span>
          <span>·</span>
          <span>{fullLengthCount} Full-Length</span>
          <span>·</span>
          <span>{pyqCount} PYQ</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="mt-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        {/* Three Test-Category Sections Selector */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'all', label: 'All 3 Categories' },
              { id: 'sectional', label: 'Sectional Tests (15 / Subject)' },
              { id: 'full_length', label: 'Full-Length Mock Tests (10 / Subject)' },
              { id: 'pyq', label: 'Previous Year Question Tests (5 / Subject)' },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleCategoryFilterChange(cat.id)}
                className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  selectedCategory === cat.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              onClick={() => setViewMode('grid')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer ${
                viewMode === 'grid' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Cards</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer ${
                viewMode === 'table' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
          </div>
        </div>

        {/* Subject, Status & Search Filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedSubject}
              onChange={(e) => handleSubjectFilterChange(e.target.value)}
              className="px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600"
            >
              <option value="all">All 7 Subjects</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.slug}>
                  {s.name} ({s.paper_code})
                </option>
              ))}
            </select>

            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  { id: 'all', label: 'All States' },
                  { id: 'free', label: 'Free Diagnostic' },
                  { id: 'unlocked', label: 'Unlocked / Purchased' },
                  { id: 'locked', label: 'Locked Premium' },
                  { id: 'completed', label: 'Completed' },
                ] as const
              ).map((st) => (
                <button
                  key={st.id}
                  onClick={() => setStatusFilter(st.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    statusFilter === st.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search test title, paper code, topic..."
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600"
            />
          </div>
        </div>
      </div>

      {/* Catalogue Content */}
      {loading ? (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="h-36 bg-white border border-slate-200 rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : filteredTests.length === 0 ? (
        <div className="mt-6 p-12 bg-white border border-slate-200 rounded-xl text-center">
          <p className="text-sm font-medium text-slate-900">
            No published tests match your selected filters.
          </p>
          <button
            onClick={() => {
              handleSubjectFilterChange('all');
              handleCategoryFilterChange('all');
              setStatusFilter('all');
              setSearchQuery('');
            }}
            className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg cursor-pointer"
          >
            Reset All Filters
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTests.map((t) => (
            <div
              key={t.id}
              onClick={() => handleTestAction(t)}
              className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between hover:border-blue-300 transition-colors cursor-pointer"
            >
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 text-slate-500 font-mono">
                    <Link
                      to={`/subjects/${t.subject_slug}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-semibold text-blue-700 hover:underline font-sans"
                    >
                      {t.subject_name}
                    </Link>
                    <span>·</span>
                    <span>{t.paper_code}</span>
                    <span>·</span>
                    <span className="uppercase">{t.category_slug.replace('_', '-')}</span>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    {t.access_type === 'free' ? (
                      <span className="text-emerald-700 font-semibold">Global Free</span>
                    ) : (
                      <span className="text-slate-600">Premium</span>
                    )}
                    <span>·</span>
                    {t.student_status === 'completed' ? (
                      <span className="text-blue-700 font-semibold">Completed</span>
                    ) : t.student_status === 'in_progress' ? (
                      <span className="text-amber-700 font-semibold">In Progress</span>
                    ) : t.is_unlocked ? (
                      <span className="text-emerald-700 font-medium">Unlocked</span>
                    ) : (
                      <span className="text-slate-500 inline-flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        Locked
                      </span>
                    )}
                  </div>
                </div>

                <h3 className="mt-2 text-base font-bold text-slate-900 font-display">{t.title}</h3>
                <p className="mt-1 text-xs text-slate-600 line-clamp-2">{t.description}</p>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-xs text-slate-600 font-mono tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    {t.duration_minutes}m
                  </span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    {t.total_questions} Qs
                  </span>
                  <span>·</span>
                  <span>{t.maximum_marks} Marks</span>
                </div>

                {t.student_status === 'completed' ? (
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono font-semibold text-slate-800 tabular-nums">
                      {t.attempt_summary?.total_score}/{t.attempt_summary?.maximum_marks}
                    </span>
                    <span className="px-3.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 rounded-lg">
                      View Result
                    </span>
                  </div>
                ) : t.student_status === 'in_progress' ? (
                  <span className="px-3.5 py-1.5 text-xs font-semibold text-white bg-amber-600 rounded-lg">
                    Resume Attempt
                  </span>
                ) : t.is_unlocked ? (
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 rounded-lg">
                    <PlayCircle className="w-3.5 h-3.5" />
                    <span>Start Test</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg">
                    <Lock className="w-3.5 h-3.5 text-slate-500" />
                    <span>Unlock {t.subject_name}</span>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6 bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500 bg-slate-50">
                <th className="py-3.5 px-4 font-semibold">Subject</th>
                <th className="py-3.5 px-4 font-semibold">Category</th>
                <th className="py-3.5 px-4 font-semibold">Test Title</th>
                <th className="py-3.5 px-4 font-semibold text-right">Duration</th>
                <th className="py-3.5 px-4 font-semibold text-right">Questions / Marks</th>
                <th className="py-3.5 px-4 font-semibold">Access State</th>
                <th className="py-3.5 px-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredTests.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => handleTestAction(t)}
                  className="hover:bg-slate-50/80 cursor-pointer"
                >
                  <td className="py-3 px-4 text-xs font-medium text-slate-800 whitespace-nowrap">
                    {t.subject_name}{' '}
                    <span className="font-mono text-slate-400">({t.paper_code})</span>
                  </td>
                  <td className="py-3 px-4 text-xs font-mono uppercase text-slate-600 whitespace-nowrap">
                    {t.category_slug.replace('_', '-')}
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-900">{t.title}</td>
                  <td className="py-3 px-4 text-right text-xs font-mono text-slate-600 tabular-nums whitespace-nowrap">
                    {t.duration_minutes} mins
                  </td>
                  <td className="py-3 px-4 text-right text-xs font-mono text-slate-600 tabular-nums whitespace-nowrap">
                    {t.total_questions} Qs · {t.maximum_marks}M
                  </td>
                  <td className="py-3 px-4 text-xs whitespace-nowrap">
                    {t.access_type === 'free' ? (
                      <span className="text-emerald-700 font-semibold">Global Free</span>
                    ) : t.student_status === 'completed' ? (
                      <span className="text-blue-700 font-semibold">
                        Completed ({t.attempt_summary?.total_score}/{t.attempt_summary?.maximum_marks})
                      </span>
                    ) : t.is_unlocked ? (
                      <span className="text-emerald-700 font-medium">Purchased / Unlocked</span>
                    ) : (
                      <span className="text-slate-500 inline-flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        Locked Premium
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTestAction(t);
                      }}
                      className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
                    >
                      {t.student_status === 'completed'
                        ? 'View Result'
                        : t.student_status === 'in_progress'
                        ? 'Resume'
                        : t.is_unlocked
                        ? 'Start Test'
                        : 'Unlock Subject'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
