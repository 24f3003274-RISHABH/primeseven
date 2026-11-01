import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiRequest, formatPaiseToINR } from '../../api/client.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { CategorySlug } from '../../types/domain.ts';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileText,
  Lock,
  PlayCircle,
  Bookmark,
  BookmarkCheck,
} from 'lucide-react';
import {
  listUserBookmarksFromFirestore,
  saveUserBookmarkToFirestore,
  deleteUserBookmarkFromFirestore,
} from '../../lib/firebase.ts';

export const SubjectDetailPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<CategorySlug>('sectional');
  const [accessFilter, setAccessFilter] = useState<'all' | 'free' | 'unlocked' | 'completed'>('all');
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    apiRequest(`/api/v1/subjects/${slug}`)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => setError(err.message || 'Failed to load subject details'))
      .finally(() => setLoading(false));
  }, [slug, profile]);

  useEffect(() => {
    if (profile) {
      listUserBookmarksFromFirestore(profile.id)
        .then((bms) => setBookmarkedIds(new Set(bms.map((b) => b.testId))))
        .catch(() => {});
    } else {
      setBookmarkedIds(new Set());
    }
  }, [profile]);

  const handleToggleBookmark = async (testId: string, testTitle: string) => {
    if (!profile) {
      navigate(`/login?redirect=/subjects/${slug}`);
      return;
    }
    const next = new Set(bookmarkedIds);
    if (next.has(testId)) {
      next.delete(testId);
      setBookmarkedIds(next);
      await deleteUserBookmarkFromFirestore(profile.id, testId).catch(() => {});
    } else {
      next.add(testId);
      setBookmarkedIds(next);
      await saveUserBookmarkToFirestore({
        userId: profile.id,
        testId,
        note: `Saved from ${data?.subject?.name || 'Subject'}: ${testTitle}`,
      }).catch(() => {});
    }
  };

  /**
   * Critical Business Requirement (Part 7.1):
   * When a student clicks a locked premium test without owning the relevant subject package:
   * 1. Check access status.
   * 2. Identify the test's subject.
   * 3. Navigate to the correct subject purchase page while preserving the intended test destination.
   */
  const handleTestCardAction = (test: any) => {
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

    // Locked premium test -> Redirect to subject purchase page preserving destination
    const purchaseUrl = `/subjects/${slug}/purchase?returnTo=${encodeURIComponent(
      intendedUrl
    )}&highlightTest=${encodeURIComponent(test.title)}`;

    if (!profile) {
      navigate(`/login?redirect=${encodeURIComponent(purchaseUrl)}`);
    } else {
      navigate(purchaseUrl);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="h-44 bg-white border border-slate-200 rounded-xl animate-pulse" />
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="h-32 bg-white border border-slate-200 rounded-xl animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data?.subject) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-16 text-center">
        <h1 className="text-xl font-bold text-slate-900">Subject Not Found</h1>
        <p className="mt-2 text-sm text-slate-600">{error}</p>
        <Link
          to="/subjects"
          className="mt-4 inline-block px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg"
        >
          Back to Subject Catalogue
        </Link>
      </div>
    );
  }

  const { subject, is_purchased, package: pkg, tests, subject_history } = data;

  const sectionalTests = tests.filter((t: any) => t.category_slug === 'sectional');
  const fullLengthTests = tests.filter((t: any) => t.category_slug === 'full_length');
  const pyqTests = tests.filter((t: any) => t.category_slug === 'pyq');

  const categoryTests = tests
    .filter((t: any) => t.category_slug === activeCategory)
    .filter((t: any) => {
      if (accessFilter === 'free') return t.access_type === 'free';
      if (accessFilter === 'unlocked') return t.is_unlocked;
      if (accessFilter === 'completed') return t.student_status === 'completed';
      return true;
    });

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Link to="/subjects" className="inline-flex items-center gap-1 hover:text-slate-900">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Subjects</span>
        </Link>
        <span>/</span>
        <span className="text-slate-900 font-medium">{subject.name}</span>
      </div>

      {/* Subject Header Banner */}
      <div className="mt-4 bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono">
              <span className="font-semibold text-blue-700">{subject.paper_code}</span>
              <span>·</span>
              <span className="tabular-nums">{tests.length} Published Tests</span>
              <span>·</span>
              <span className="tabular-nums">{sectionalTests.length} Sectional</span>
              <span>·</span>
              <span className="tabular-nums">{fullLengthTests.length} Full-Length</span>
              <span>·</span>
              <span className="tabular-nums">{pyqTests.length} PYQ</span>
            </div>

            <h1 className="mt-2 text-2xl sm:text-3xl font-bold text-slate-900 font-display">
              {subject.name} Test Series
            </h1>

            <p className="mt-2 text-sm text-slate-600 leading-relaxed">{subject.description}</p>
          </div>

          {/* Right Purchase / Entitlement Status Card */}
          <div className="lg:w-80 shrink-0 p-5 rounded-xl bg-slate-50 border border-slate-200">
            {is_purchased ? (
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-emerald-700">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Subject Series Unlocked</span>
                </div>
                <p className="mt-1.5 text-xs text-slate-600">
                  You have full access to all {tests.length} published Sectional, Full-Length, and
                  PYQ tests in {subject.name}.
                </p>
              </div>
            ) : (
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-medium text-slate-500">Complete Subject Series</span>
                  <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
                    {pkg ? formatPaiseToINR(pkg.price_paise) : '—'}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-slate-600">
                  One-time purchase unlocks all {tests.length} tests in {subject.name} (Sectional,
                  Full-Length & PYQ).
                </p>
                {pkg?.is_available_for_sale ? (
                  <Link
                    to={`/subjects/${subject.slug}/purchase`}
                    className="mt-4 block w-full py-2.5 px-4 text-center text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
                  >
                    Purchase {subject.name} Series
                  </Link>
                ) : (
                  <p className="mt-3 text-xs font-medium text-amber-700">
                    Sales temporarily paused by administrator.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Category Selector Tabs (Zero Chapters — Pure 3 Categories) */}
      <div className="mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveCategory('sectional')}
            className={`px-4 py-2.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              activeCategory === 'sectional'
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            Sectional Tests ({sectionalTests.length})
          </button>

          <button
            onClick={() => setActiveCategory('full_length')}
            className={`px-4 py-2.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              activeCategory === 'full_length'
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            Full-Length Tests ({fullLengthTests.length})
          </button>

          <button
            onClick={() => setActiveCategory('pyq')}
            className={`px-4 py-2.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              activeCategory === 'pyq'
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            Previous Year Question Tests ({pyqTests.length})
          </button>
        </div>

        {/* Access Filter */}
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start">
          {(['all', 'free', 'unlocked', 'completed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setAccessFilter(f)}
              className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition-colors cursor-pointer ${
                accessFilter === f
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Published Tests Grid */}
      {categoryTests.length === 0 ? (
        <div className="mt-6 p-10 bg-white border border-slate-200 rounded-xl text-center">
          <p className="text-sm text-slate-600">
            No tests in this category match the selected filter.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {categoryTests.map((t: any) => {
            const isBookmarked = bookmarkedIds.has(t.id);
            return (
              <div
                key={t.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between hover:border-slate-300 transition-colors"
              >
                <div>
                  {/* Clean unboxed metadata row */}
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 text-slate-500 font-mono tabular-nums">
                      <span className="font-semibold text-slate-800">Test #{t.test_number}</span>
                      <span>·</span>
                      {t.access_type === 'free' ? (
                        <span className="text-emerald-700 font-sans font-semibold">
                          Global Free Test
                        </span>
                      ) : (
                        <span className="text-slate-600 font-sans">Premium Series</span>
                      )}
                      <span>·</span>
                      {t.student_status === 'completed' ? (
                        <span className="text-blue-700 font-sans font-semibold">Completed</span>
                      ) : t.student_status === 'in_progress' ? (
                        <span className="text-amber-700 font-sans font-semibold">In Progress</span>
                      ) : t.is_unlocked ? (
                        <span className="text-emerald-700 font-sans font-medium">Unlocked</span>
                      ) : (
                        <span className="text-slate-500 font-sans inline-flex items-center gap-1">
                          <Lock className="w-3 h-3" />
                          Locked
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => handleToggleBookmark(t.id, t.title)}
                      title={isBookmarked ? 'Remove bookmark' : 'Bookmark test for later'}
                      className="text-slate-400 hover:text-blue-700 p-1 cursor-pointer"
                    >
                      {isBookmarked ? (
                        <BookmarkCheck className="w-4 h-4 text-blue-700" />
                      ) : (
                        <Bookmark className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  <h3 className="mt-2 text-base font-bold text-slate-900 font-display">
                    {t.title}
                  </h3>
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
                        Score: {t.attempt_summary?.total_score}/{t.attempt_summary?.maximum_marks}
                      </span>
                      <button
                        onClick={() => handleTestCardAction(t)}
                        className="px-3.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                      >
                        View Result
                      </button>
                    </div>
                  ) : t.student_status === 'in_progress' ? (
                    <button
                      onClick={() => handleTestCardAction(t)}
                      className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Resume Attempt
                    </button>
                  ) : t.is_unlocked ? (
                    <button
                      onClick={() => handleTestCardAction(t)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <PlayCircle className="w-3.5 h-3.5" />
                      <span>Start Test</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleTestCardAction(t)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5 text-slate-500" />
                      <span>Unlock Subject Series</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Subject-Specific Attempt History (Part 10) */}
      <div className="mt-14">
        <h2 className="text-lg font-bold text-slate-900 font-display">
          {subject.name} — Your Attempt History
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          Completed examinations in {subject.name} with server-evaluated scores and percentages.
        </p>

        {!profile ? (
          <div className="mt-4 p-6 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
            <p className="text-xs text-slate-600">
              Sign in to track your attempt history and performance analytics for {subject.name}.
            </p>
            <Link
              to={`/login?redirect=/subjects/${subject.slug}`}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg"
            >
              Sign In
            </Link>
          </div>
        ) : !subject_history || subject_history.length === 0 ? (
          <div className="mt-4 p-6 bg-white border border-slate-200 rounded-xl">
            <p className="text-xs text-slate-600">
              You have not completed any tests in {subject.name} yet.
            </p>
          </div>
        ) : (
          <div className="mt-4 bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500 bg-slate-50">
                  <th className="py-3 px-4 font-semibold">Test Title</th>
                  <th className="py-3 px-4 font-semibold">Category</th>
                  <th className="py-3 px-4 font-semibold">Attempt Date</th>
                  <th className="py-3 px-4 font-semibold text-right">Score</th>
                  <th className="py-3 px-4 font-semibold text-right">Percentage</th>
                  <th className="py-3 px-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {subject_history.map((h: any) => (
                  <tr key={h.attempt_id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-medium text-slate-900">{h.test_title}</td>
                    <td className="py-3 px-4 text-xs text-slate-600 uppercase font-mono">
                      {h.category_slug}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 font-mono tabular-nums">
                      {h.submitted_at ? new Date(h.submitted_at).toLocaleDateString('en-IN') : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {h.total_score} / {h.maximum_marks}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700 tabular-nums">
                      {h.percentage}%
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        to={`/results/${h.attempt_id}`}
                        className="text-xs font-semibold text-blue-700 hover:underline"
                      >
                        Detailed Analysis
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
