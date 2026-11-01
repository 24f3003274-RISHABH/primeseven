import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest, formatPaiseToINR } from '../../api/client.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { listUserBookmarksFromFirestore, FirestoreBookmarkDoc } from '../../lib/firebase.ts';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Lock,
  PlayCircle,
  Shield,
  Bookmark,
} from 'lucide-react';

export const StudentDashboardPage: React.FC = () => {
  const { profile, switchRoleView } = useAuth();
  const [subjects, setSubjects] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [freeTests, setFreeTests] = useState<any[]>([]);
  const [bookmarks, setBookmarks] = useState<FirestoreBookmarkDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiRequest<{ subjects: any[] }>('/api/v1/subjects'),
      apiRequest<{ results: any[] }>('/api/v1/results/my'),
      apiRequest<{ free_tests: any[] }>('/api/v1/public/stats'),
    ])
      .then(([subjRes, resData, pubStats]) => {
        setSubjects(subjRes.subjects || []);
        setResults(resData.results || []);
        setFreeTests(pubStats.free_tests || []);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));

    if (profile) {
      listUserBookmarksFromFirestore(profile.id)
        .then(setBookmarks)
        .catch(() => {});
    }
  }, [profile]);

  const purchasedSubjects = subjects.filter((s) => s.is_purchased);
  const lockedSubjects = subjects.filter((s) => !s.is_purchased);
  const completedAttempts = results.filter((r) => r.status !== 'in_progress');
  const inProgressAttempts = results.filter((r) => r.status === 'in_progress');

  const avgAccuracy =
    completedAttempts.length > 0
      ? Math.round(
          (completedAttempts.reduce((acc, r) => acc + r.accuracy, 0) / completedAttempts.length) *
            10
        ) / 10
      : 0;

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Top Candidate Welcome & Role Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>CANDIDATE PREPARATION WORKSPACE</span>
            <span>·</span>
            <span className="font-mono text-blue-700 font-semibold uppercase">
              {profile?.role}
            </span>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-slate-900 font-display">
            Welcome back, {profile?.full_name}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage your unlocked CUET PG subject test series, resume active mock examinations, and
            analyze your performance metrics.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {profile?.role === 'admin' ? (
            <Link
              to="/admin"
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
            >
              <Shield className="w-4 h-4 text-blue-400" />
              <span>Open Admin Console</span>
            </Link>
          ) : (
            <button
              onClick={() => switchRoleView('admin')}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
            >
              <Shield className="w-4 h-4 text-blue-700" />
              <span>Switch to Admin Console View</span>
            </button>
          )}
          <Link
            to="/subjects"
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
          >
            <span>Browse All 7 Subjects</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Real Database Performance Metrics Strip */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs text-slate-500 block">Available Subjects</span>
          <span className="mt-1 text-2xl font-bold text-slate-900 font-mono tabular-nums block">
            {subjects.length}
          </span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs text-slate-500 block">Purchased Series</span>
          <span className="mt-1 text-2xl font-bold text-emerald-700 font-mono tabular-nums block">
            {purchasedSubjects.length}
          </span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs text-slate-500 block">Tests Attempted</span>
          <span className="mt-1 text-2xl font-bold text-slate-900 font-mono tabular-nums block">
            {results.length}
          </span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs text-slate-500 block">Completed Tests</span>
          <span className="mt-1 text-2xl font-bold text-blue-700 font-mono tabular-nums block">
            {completedAttempts.length}
          </span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 col-span-2 md:col-span-1">
          <span className="text-xs text-slate-500 block">Average Accuracy</span>
          <span className="mt-1 text-2xl font-bold text-slate-900 font-mono tabular-nums block">
            {avgAccuracy}%
          </span>
        </div>
      </div>

      {/* Active In-Progress Attempt Banner ("Continue Preparation") */}
      {inProgressAttempts.length > 0 && (
        <div className="mt-6 p-5 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-amber-900 uppercase">
              Active Examination in Progress
            </p>
            <p className="mt-1 text-sm font-bold text-slate-900">
              {inProgressAttempts[0].test_title} ({inProgressAttempts[0].subject_name})
            </p>
            <p className="text-xs text-slate-600 mt-0.5">
              Your timer is running on the server. Resume now to review and submit your answers.
            </p>
          </div>
          <Link
            to={`/exam/${inProgressAttempts[0].id}`}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg whitespace-nowrap shrink-0"
          >
            <PlayCircle className="w-4 h-4" />
            <span>Resume Examination</span>
          </Link>
        </div>
      )}

      {/* Purchased Subject Series vs Locked Subject Series */}
      <div className="mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7 space-y-8">
          {/* Purchased Subject Series */}
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 font-display">
                Your Purchased Subject Series ({purchasedSubjects.length})
              </h2>
              <Link to="/purchases" className="text-xs font-semibold text-blue-700 hover:underline">
                View Purchase Receipts
              </Link>
            </div>

            {purchasedSubjects.length === 0 ? (
              <div className="mt-3 p-6 bg-white border border-slate-200 rounded-xl">
                <p className="text-sm font-medium text-slate-900">
                  You have not purchased a complete subject series yet.
                </p>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  You can immediately attempt the two globally designated free diagnostic tests
                  below, or unlock all 30 tests in your chosen CUET PG subject with a single
                  subject package purchase.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {freeTests.map((ft) => (
                    <Link
                      key={ft.id}
                      to={`/tests/${ft.id}/instructions`}
                      className="px-3.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg"
                    >
                      Attempt Free: {ft.title}
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {purchasedSubjects.map((s) => (
                  <div
                    key={s.id}
                    className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-xs text-emerald-700 font-medium">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Series Unlocked</span>
                        <span>·</span>
                        <span className="font-mono">{s.paper_code}</span>
                      </div>
                      <h3 className="mt-1 text-base font-bold text-slate-900 font-display">
                        {s.name}
                      </h3>
                      <p className="text-xs text-slate-500 font-mono mt-0.5 tabular-nums">
                        {s.total_tests} Published Tests ({s.category_counts?.sectional} Sectional ·{' '}
                        {s.category_counts?.full_length} Full-Length · {s.category_counts?.pyq} PYQ)
                      </p>
                    </div>
                    <Link
                      to={`/subjects/${s.slug}`}
                      className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap shrink-0"
                    >
                      Continue Preparation
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Locked Subject Series */}
          <div>
            <h2 className="text-lg font-bold text-slate-900 font-display">
              Available Subject Series to Unlock ({lockedSubjects.length})
            </h2>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {lockedSubjects.map((s) => (
                <div
                  key={s.id}
                  className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
                      <span>{s.paper_code}</span>
                      <span className="font-bold text-slate-900 tabular-nums">
                        {s.package ? formatPaiseToINR(s.package.price_paise) : '—'}
                      </span>
                    </div>
                    <h3 className="mt-1.5 text-sm font-bold text-slate-900 font-display">
                      {s.name}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                      {s.total_tests} Tests included
                    </p>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <Link
                      to={`/subjects/${s.slug}`}
                      className="flex-1 py-1.5 px-3 text-center text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                    >
                      Browse
                    </Link>
                    <Link
                      to={`/subjects/${s.slug}/purchase`}
                      className="flex-1 py-1.5 px-3 text-center text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
                    >
                      Unlock
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Recent Results & Firestore Bookmarks */}
        <div className="lg:col-span-5 space-y-8">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 font-display">Recent Test Results</h2>
              <Link to="/results" className="text-xs font-semibold text-blue-700 hover:underline">
                All Results
              </Link>
            </div>

            {completedAttempts.length === 0 ? (
              <div className="mt-3 p-6 bg-white border border-slate-200 rounded-xl text-xs text-slate-600">
                No completed examinations yet. Start with a free diagnostic test to generate your
                first scorecard.
              </div>
            ) : (
              <div className="mt-3 bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                {completedAttempts.slice(0, 5).map((r) => (
                  <div key={r.id} className="p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500">{r.subject_name}</p>
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {r.test_title}
                      </p>
                      <p className="text-xs text-slate-500 font-mono mt-0.5 tabular-nums">
                        Score: {r.total_score}/{r.maximum_marks} ({r.percentage}%) · Accuracy:{' '}
                        {r.accuracy}%
                      </p>
                    </div>
                    <Link
                      to={`/results/${r.id}`}
                      className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg whitespace-nowrap shrink-0"
                    >
                      Solutions
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Firestore Saved Test Bookmarks */}
          <div>
            <div className="flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-blue-700" />
              <h2 className="text-base font-bold text-slate-900 font-display">
                Saved Study Bookmarks ({bookmarks.length})
              </h2>
            </div>
            {bookmarks.length === 0 ? (
              <div className="mt-3 p-5 bg-white border border-slate-200 rounded-xl text-xs text-slate-500">
                Click the bookmark icon on any test card in a Subject Catalogue to save it here.
              </div>
            ) : (
              <div className="mt-3 bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                {bookmarks.map((bm) => (
                  <div key={bm.id} className="p-3.5 flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-800 truncate">{bm.note}</p>
                    <Link
                      to={`/tests/${bm.testId}/instructions`}
                      className="text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap shrink-0"
                    >
                      Open Test
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
