import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../../api/client.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileText,
  Lock,
  PlayCircle,
  AlertCircle,
} from 'lucide-react';

export const TestInstructionsPage: React.FC = () => {
  const { testId } = useParams<{ testId: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!testId) return;
    setLoading(true);
    apiRequest<any>(`/api/v1/tests/${testId}`)
      .then((res) => {
        // When an authenticated student opens a locked premium test, redirect directly to that subject's purchase page
        if (profile && !res.has_access && res.subject?.slug) {
          navigate(
            `/subjects/${res.subject.slug}/purchase?returnTo=${encodeURIComponent(
              `/tests/${testId}/instructions`
            )}&highlightTest=${encodeURIComponent(res.test?.title || '')}`,
            { replace: true }
          );
          return;
        }
        setData(res);
        setError(null);
      })
      .catch((err) => setError(err.message || 'Could not load examination instructions'))
      .finally(() => setLoading(false));
  }, [testId, profile, navigate]);

  const handleStartExamination = async () => {
    if (!profile) {
      navigate(`/login?redirect=${encodeURIComponent(`/tests/${testId}/instructions`)}`);
      return;
    }

    setStarting(true);
    setError(null);
    try {
      const res = await apiRequest<{ attempt: any; resumed: boolean }>('/api/v1/attempts/start', {
        method: 'POST',
        body: JSON.stringify({ test_id: testId }),
      });
      navigate(`/exam/${res.attempt.id}`);
    } catch (err: any) {
      if (err.status === 403) {
        const targetSlug = err.data?.subject_slug || data?.subject?.slug;
        if (targetSlug) {
          navigate(
            `/subjects/${targetSlug}/purchase?returnTo=${encodeURIComponent(
              `/tests/${testId}/instructions`
            )}&highlightTest=${encodeURIComponent(data?.test?.title || '')}`,
            { replace: true }
          );
          return;
        }
      }
      if (err.data?.attempt_id && err.status === 409) {
        navigate(`/results/${err.data.attempt_id}`);
        return;
      }
      setError(err.message || 'Could not start examination.');
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="h-96 bg-white border border-slate-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!data?.test) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-16 text-center">
        <h1 className="text-xl font-bold text-slate-900">Test Not Found</h1>
        <p className="mt-2 text-sm text-slate-600">{error}</p>
        <Link
          to="/subjects"
          className="mt-4 inline-block px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg"
        >
          Return to Subjects
        </Link>
      </div>
    );
  }

  const { test, subject, category, has_access, existing_attempt } = data;
  const isCompleted =
    existing_attempt &&
    (existing_attempt.status === 'submitted' ||
      existing_attempt.status === 'expired_submitted');

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Link
          to={`/subjects/${subject?.slug || ''}`}
          className="inline-flex items-center gap-1 hover:text-slate-900"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{subject?.name || 'Subject'}</span>
        </Link>
        <span>/</span>
        <span>{category?.name || test.category_slug}</span>
        <span>/</span>
        <span className="text-slate-900 font-medium">Examination Instructions</span>
      </div>

      <div className="mt-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
        {/* Top Header */}
        <div className="p-6 sm:p-8 bg-slate-900 text-white">
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-blue-300">
            <span>{subject?.name} ({subject?.paper_code})</span>
            <span>·</span>
            <span>{category?.name}</span>
            <span>·</span>
            <span>{test.access_type === 'free' ? 'GLOBAL FREE TEST' : 'PREMIUM SERIES TEST'}</span>
          </div>

          <h1 className="mt-2 text-2xl sm:text-3xl font-bold font-display">{test.title}</h1>
          <p className="mt-2 text-xs text-slate-300">{test.description}</p>

          <div className="mt-6 pt-5 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-5 gap-4 text-xs font-mono tabular-nums">
            <div>
              <span className="text-slate-400 block font-sans">Duration</span>
              <span className="text-base font-bold text-white">{test.duration_minutes} Mins</span>
            </div>
            <div>
              <span className="text-slate-400 block font-sans">Total Questions</span>
              <span className="text-base font-bold text-white">{test.total_questions} MCQs</span>
            </div>
            <div>
              <span className="text-slate-400 block font-sans">Maximum Marks</span>
              <span className="text-base font-bold text-white">{test.maximum_marks}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-sans">Positive Marking</span>
              <span className="text-base font-bold text-emerald-400">+{test.positive_marks}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-sans">Negative Marking</span>
              <span className="text-base font-bold text-red-400">-{test.negative_marks}</span>
            </div>
          </div>
        </div>

        {/* Instructions Body */}
        <div className="p-6 sm:p-8 space-y-6 text-sm text-slate-700">
          <div>
            <h2 className="text-base font-bold text-slate-900 font-display">
              General Examination Instructions (CUET PG CBT Pattern)
            </h2>
            <ol className="mt-3 list-decimal list-inside space-y-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
              <li>
                The examination timer is managed authoritatively on the PrimePrep server. Refreshing
                your browser or changing your system clock will <strong>not</strong> reset or
                extend the remaining time.
              </li>
              <li>
                When the server countdown reaches zero, your examination will be{' '}
                <strong>automatically submitted</strong> and evaluated using all saved responses.
              </li>
              <li>
                Each question has four options (A, B, C, D) with exactly one correct option.
                Correct responses award <strong className="font-mono">+{test.positive_marks}</strong>{' '}
                marks, incorrect responses deduct{' '}
                <strong className="font-mono">-{test.negative_marks}</strong> mark, and unanswered
                questions carry <strong className="font-mono">0</strong> marks.
              </li>
              <li>
                <strong>One-Attempt Policy:</strong> You may attempt and submit each published test
                only once. After submission, full solutions and explanations are unlocked.
              </li>
            </ol>
          </div>

          {/* Question Palette Legend */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
              Question Navigation Palette States
            </h3>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-md bg-slate-200 text-slate-700 font-mono font-bold flex items-center justify-center">
                  1
                </span>
                <span>Not Visited</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-md bg-emerald-600 text-white font-mono font-bold flex items-center justify-center">
                  2
                </span>
                <span>Answered</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-md bg-red-600 text-white font-mono font-bold flex items-center justify-center">
                  3
                </span>
                <span>Visited · Not Answered</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-md bg-amber-500 text-white font-mono font-bold flex items-center justify-center">
                  4
                </span>
                <span>Marked for Review (Unanswered)</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-md bg-blue-700 text-white font-mono font-bold flex items-center justify-center">
                  5
                </span>
                <span>Answered & Marked for Review</span>
              </div>
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Action Footer */}
          <div className="pt-4 border-t border-slate-200">
            {isCompleted ? (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="text-xs text-slate-800">
                  <p className="font-bold">You have already completed this examination.</p>
                  <p className="mt-0.5 font-mono">
                    Final Score: {existing_attempt.total_score} / {existing_attempt.maximum_marks}
                  </p>
                </div>
                <Link
                  to={`/results/${existing_attempt.id}`}
                  className="px-5 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg whitespace-nowrap"
                >
                  View Result & Solutions
                </Link>
              </div>
            ) : !has_access ? (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-slate-100 border border-slate-200 rounded-xl">
                <div className="flex items-center gap-3 text-xs text-slate-700">
                  <Lock className="w-5 h-5 text-slate-500 shrink-0" />
                  <span>
                    This is a premium test in <strong>{subject?.name}</strong>. Unlock the complete{' '}
                    {subject?.name} Test Series to start this examination.
                  </span>
                </div>
                <Link
                  to={`/subjects/${subject?.slug}/purchase?returnTo=${encodeURIComponent(
                    `/tests/${test.id}/instructions`
                  )}&highlightTest=${encodeURIComponent(test.title)}`}
                  className="px-5 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg whitespace-nowrap shrink-0"
                >
                  Unlock {subject?.name} Series
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                <label className="flex items-start gap-3 text-xs text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                  />
                  <span>
                    I have read and understood all CUET PG computer-based test instructions,
                    marking scheme (+{test.positive_marks} / -{test.negative_marks}), and the
                    one-attempt rule.
                  </span>
                </label>

                <div className="flex items-center justify-end gap-4">
                  <button
                    onClick={handleStartExamination}
                    disabled={!agreed || starting}
                    className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-40 rounded-lg transition-colors cursor-pointer"
                  >
                    <PlayCircle className="w-4 h-4" />
                    <span>
                      {starting
                        ? 'Initializing Session...'
                        : existing_attempt?.status === 'in_progress'
                        ? 'Resume Examination'
                        : 'Start Test'}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
