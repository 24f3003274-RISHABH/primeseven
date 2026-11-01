import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest, formatPaiseToINR } from '../../api/client.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { ArrowRight, CheckCircle2, Clock, FileText, Lock, ShieldCheck } from 'lucide-react';

interface PublicStats {
  total_subjects: number;
  total_published_tests: number;
  total_questions: number;
  categories_count: number;
  free_tests: Array<{
    id: string;
    title: string;
    category_slug: string;
    duration_minutes: number;
    total_questions: number;
    maximum_marks: number;
    subject_name: string;
    subject_slug: string;
  }>;
}

export const LandingPage: React.FC = () => {
  const { profile } = useAuth();
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiRequest<PublicStats>('/api/v1/public/stats'),
      apiRequest<{ subjects: any[] }>('/api/v1/subjects'),
    ])
      .then(([statsData, subjData]) => {
        setStats(statsData);
        setSubjects(subjData.subjects || []);
      })
      .catch((err) => console.error('Landing page load error:', err))
      .finally(() => setLoading(false));
  }, [profile]);

  return (
    <div>
      {/* Section 1: Institutional Hero */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-16 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch">
            <div className="lg:col-span-7 flex flex-col justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 font-medium">
                  <span>CUET PG Examination Series</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">+4 / -1 Marking Scheme</span>
                  <span aria-hidden="true">·</span>
                  <span>Subject-Wise Complete Access</span>
                </div>

                <h1 className="mt-4 text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 leading-[1.12] font-display [text-wrap:balance]">
                  Structured Online Mock Examinations for CUET PG Preparation.
                </h1>

                <p className="mt-5 text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl">
                  Practice with subject-specific Sectional Tests, Full-Length Mock Papers, and
                  Previous Year Question (PYQ) papers in an authentic examination interface with
                  server-enforced timers and question-by-question explanations.
                </p>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  to="/subjects"
                  className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <span>Explore 7 Subject Series</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>

                <Link
                  to="/free-tests"
                  className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <span>Attempt Free Diagnostic Tests</span>
                </Link>
              </div>
            </div>

            {/* Right Column: Live Examination Architecture Preview */}
            <div className="lg:col-span-5 bg-slate-900 text-white rounded-2xl p-8 flex flex-col justify-between border border-slate-800">
              <div>
                <div className="flex items-center justify-between text-xs text-slate-400 pb-4 border-b border-slate-800">
                  <span>NTA CUET PG EXAMINATION SPECIFICATION</span>
                  <span className="font-mono text-blue-400">CBT MODE</span>
                </div>

                <h2 className="mt-5 text-xl font-bold text-white font-display">
                  Two Globally Designated Free Diagnostic Tests
                </h2>
                <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                  Evaluate the examination interface, question palette, and post-submission
                  solution key before purchasing any subject test series.
                </p>

                <div className="mt-5 space-y-3">
                  {stats?.free_tests && stats.free_tests.length > 0 ? (
                    stats.free_tests.map((ft) => (
                      <div
                        key={ft.id}
                        className="p-4 rounded-xl bg-slate-800/90 border border-slate-700 flex items-center justify-between gap-4"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
                            <span>Global Free Test</span>
                            <span>·</span>
                            <span>{ft.subject_name}</span>
                          </div>
                          <p className="mt-1 text-sm font-semibold text-white truncate">
                            {ft.title}
                          </p>
                          <div className="mt-1 flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
                            <span>{ft.duration_minutes} mins</span>
                            <span>·</span>
                            <span>{ft.total_questions} Qs</span>
                            <span>·</span>
                            <span>{ft.maximum_marks} Marks</span>
                          </div>
                        </div>

                        <Link
                          to={`/tests/${ft.id}/instructions`}
                          className="px-3.5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors whitespace-nowrap shrink-0"
                        >
                          Start Test
                        </Link>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 rounded-xl bg-slate-800 text-xs text-slate-300">
                      Loading designated free tests...
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 pt-5 border-t border-slate-800 grid grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block">Correct Response</span>
                  <span className="font-mono font-semibold text-emerald-400 text-sm tabular-nums">
                    +4 Marks
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Negative Marking</span>
                  <span className="font-mono font-semibold text-red-400 text-sm tabular-nums">
                    -1 Mark
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Unanswered</span>
                  <span className="font-mono font-semibold text-slate-200 text-sm tabular-nums">
                    0 Marks
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Full-Width Database Metric Strip Below Hero Split */}
          <div className="mt-12 pt-8 border-t border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-8">
            <div>
              <p className="text-xs text-slate-500">Postgraduate Subjects</p>
              <p className="mt-1 text-3xl font-bold text-slate-900 font-mono tabular-nums">
                {stats?.total_subjects ?? 7}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Complete syllabus coverage per paper code
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Published Mock Examinations</p>
              <p className="mt-1 text-3xl font-bold text-slate-900 font-mono tabular-nums">
                {stats?.total_published_tests ?? 210}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                15 Sectional · 10 Full-Length · 5 PYQ per subject
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Verified Question Bank</p>
              <p className="mt-1 text-3xl font-bold text-slate-900 font-mono tabular-nums">
                {(stats?.total_questions ?? 1400).toLocaleString('en-IN')}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Single-choice MCQs with step-by-step solutions
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Global Free Diagnostic Tests</p>
              <p className="mt-1 text-3xl font-bold text-slate-900 font-mono tabular-nums">
                {stats?.free_tests?.length ?? 2}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                1 Sectional Test & 1 PYQ Paper open to all
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Seven Active CUET PG Subjects */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-blue-700">SUBJECT-WISE TEST SERIES CATALOGUE</p>
            <h2 className="mt-1 text-2xl sm:text-3xl font-bold text-slate-900 font-display">
              Seven CUET PG Postgraduate Subjects
            </h2>
          </div>
          <p className="text-sm text-slate-600 max-w-md">
            Each subject series is purchased once to unlock all published Sectional, Full-Length,
            and Previous Year Question tests in that subject.
          </p>
        </div>

        {loading ? (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div
                key={n}
                className="h-64 bg-white border border-slate-200 rounded-xl p-6 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {subjects.map((subj) => (
              <div
                key={subj.id}
                className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between hover:border-slate-300 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="font-mono font-semibold text-slate-700">
                      {subj.paper_code}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{subj.total_tests} Published Tests</span>
                    <span className="ml-auto font-medium text-slate-700">
                      {subj.is_purchased ? (
                        <span className="text-emerald-700 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Series Unlocked
                        </span>
                      ) : subj.package ? (
                        <span className="font-mono font-bold text-slate-900 tabular-nums">
                          {formatPaiseToINR(subj.package.price_paise)}
                        </span>
                      ) : null}
                    </span>
                  </div>

                  <h3 className="mt-3 text-xl font-bold text-slate-900 font-display">
                    {subj.name}
                  </h3>

                  <p className="mt-2 text-sm text-slate-600 line-clamp-3 leading-relaxed">
                    {subj.description}
                  </p>
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
                      Explore Tests
                    </Link>
                    {!subj.is_purchased && (
                      <Link
                        to={`/subjects/${subj.slug}/purchase`}
                        className="py-2.5 px-4 text-center text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap"
                      >
                        Buy Series
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Section 3: How the Platform & Subject-Wise Model Works */}
      <section className="bg-white border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="max-w-2xl">
            <p className="text-xs font-medium text-blue-700">EXAMINATION ARCHITECTURE</p>
            <h2 className="mt-1 text-2xl sm:text-3xl font-bold text-slate-900 font-display">
              Transparent Subject-Wise Purchasing & Examination Workflow
            </h2>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              No confusing chapter locks or per-test micro-charges. Navigate directly from
              Subjects to Test Categories, review the instructions, and sit the timed CBT
              examination.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-xs font-mono font-semibold text-blue-700">01. BROWSE & DIAGNOSE</p>
              <h3 className="mt-2 text-lg font-bold text-slate-900 font-display">
                Direct Category Navigation
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Every subject is organized cleanly into three categories: Sectional Tests (30
                minutes), Full-Length Tests (90 minutes), and PYQ Tests. Browse the full published
                catalogue without restriction and attempt the two global free tests immediately.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-xs font-mono font-semibold text-blue-700">
                02. ONE PURCHASE PER SUBJECT
              </p>
              <h3 className="mt-2 text-lg font-bold text-slate-900 font-display">
                Complete Subject-Series Unlock
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Purchasing a subject package (for example, Political Science at ₹499) unlocks all
                eligible published Sectional, Full-Length, and PYQ tests in that subject. You never
                pay separately for individual mock tests within your purchased subject.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-xs font-mono font-semibold text-blue-700">
                03. SERVER-EVALUATED CBT
              </p>
              <h3 className="mt-2 text-lg font-bold text-slate-900 font-display">
                Real-Time Persistence & Analytics
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Attempt each examination once under strict server-enforced deadlines. Answers and
                review flags persist across refreshes, and submission unlocks complete accuracy
                metrics and question-by-question explanations.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
