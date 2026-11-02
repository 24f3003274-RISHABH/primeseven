import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiRequest, formatDurationSeconds } from '../../api/client.ts';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Clock,
  Target,
  BookOpen,
  ListChecks,
  LayoutDashboard,
  FileBarChart,
} from 'lucide-react';

export const ResultDetailPage: React.FC = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<
    'all' | 'correct' | 'incorrect' | 'unanswered'
  >('all');
  const solutionsSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!attemptId) return;
    setLoading(true);
    apiRequest(`/api/v1/results/${attemptId}`)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => setError(err.message || 'Failed to load examination result'))
      .finally(() => setLoading(false));
  }, [attemptId]);

  const scrollToSolutions = (filter?: 'all' | 'correct' | 'incorrect' | 'unanswered') => {
    if (filter) {
      setFilterStatus(filter);
    }
    solutionsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error || !data?.attempt) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-16 text-center">
        <h1 className="text-xl font-bold text-slate-900">Result Unavailable</h1>
        <p className="mt-2 text-sm text-slate-600">{error}</p>
        <Link
          to="/results"
          className="mt-4 inline-block px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg"
        >
          Go to My Results
        </Link>
      </div>
    );
  }

  const { attempt, test, subject, category, question_analysis } = data;
  const formattedAccuracy = Number(attempt.accuracy ?? 0).toFixed(2);
  const filteredQuestions = (question_analysis || []).filter((q: any) => {
    if (filterStatus === 'all') return true;
    return q.status === filterStatus;
  });

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Link to="/results" className="inline-flex items-center gap-1 hover:text-slate-900">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>My Results</span>
          </Link>
          <span>/</span>
          <Link to={`/subjects/${subject?.slug || ''}`} className="hover:text-slate-900">
            {subject?.name}
          </Link>
          <span>/</span>
          <span className="text-slate-900 font-medium">Scorecard & Solutions</span>
        </div>

        <Link
          to={`/subjects/${subject?.slug || ''}`}
          className="text-xs font-semibold text-blue-700 hover:underline"
        >
          Back to {subject?.name} Tests
        </Link>
      </div>

      {/* Scorecard Banner (Feature 5: Complete 11-metric summary + 4 Action Buttons) */}
      <div className="mt-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-6 sm:p-8 bg-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-blue-300">
              <span>Subject: {subject?.name} ({subject?.paper_code})</span>
              <span>·</span>
              <span>Category: {category?.name || attempt.category_slug}</span>
              <span>·</span>
              <span>
                {attempt.status === 'expired_submitted'
                  ? 'AUTO-SUBMITTED ON DEADLINE'
                  : 'VERIFIED SUBMISSION'}
              </span>
            </div>

            <h1 className="mt-2 text-2xl sm:text-3xl font-bold font-display">{test?.title}</h1>
            <p className="mt-1.5 text-xs text-slate-300 font-mono">
              Submission Time:{' '}
              {attempt.submitted_at
                ? new Date(attempt.submitted_at).toLocaleString('en-IN')
                : '—'}
            </p>
          </div>

          <div className="p-5 rounded-xl bg-slate-800 border border-slate-700 text-right shrink-0">
            <span className="text-xs text-slate-400 block">Total Score Obtained</span>
            <div className="mt-1 text-3xl font-extrabold font-mono text-white tabular-nums">
              {attempt.total_score}{' '}
              <span className="text-lg text-slate-400 font-normal">/ {attempt.maximum_marks}</span>
            </div>
            <span className="mt-1 text-xs font-mono text-blue-300 block tabular-nums">
              Maximum Possible Score: {attempt.maximum_marks} ({attempt.percentage}%)
            </span>
          </div>
        </div>

        {/* 5-Column Analytical Breakdown */}
        <div className="p-6 grid grid-cols-2 sm:grid-cols-5 gap-6 bg-slate-50 border-t border-slate-200 text-xs">
          <div>
            <span className="text-slate-500 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Correct Answers
            </span>
            <p className="mt-1.5 text-xl font-bold text-emerald-700 font-mono tabular-nums">
              {attempt.correct_count}
            </p>
          </div>

          <div>
            <span className="text-slate-500 flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5 text-red-600" />
              Incorrect Answers
            </span>
            <p className="mt-1.5 text-xl font-bold text-red-600 font-mono tabular-nums">
              {attempt.incorrect_count}
            </p>
          </div>

          <div>
            <span className="text-slate-500 flex items-center gap-1.5">
              <MinusCircle className="w-3.5 h-3.5 text-slate-400" />
              Unattempted Questions
            </span>
            <p className="mt-1.5 text-xl font-bold text-slate-700 font-mono tabular-nums">
              {attempt.unanswered_count}
            </p>
          </div>

          <div>
            <span className="text-slate-500 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-blue-700" />
              Accuracy Percentage
            </span>
            <p className="mt-1.5 text-xl font-bold text-slate-900 font-mono tabular-nums">
              {formattedAccuracy}%
            </p>
          </div>

          <div>
            <span className="text-slate-500 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              Time Taken
            </span>
            <p className="mt-1.5 text-xl font-bold text-slate-900 font-mono tabular-nums">
              {formatDurationSeconds(attempt.time_taken_seconds)}
            </p>
          </div>
        </div>

        {/* Action Buttons Bar (Feature 5 Requirement) */}
        <div className="px-6 py-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => scrollToSolutions('all')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>View Solutions</span>
            </button>

            <button
              type="button"
              onClick={() => scrollToSolutions('incorrect')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
            >
              <ListChecks className="w-3.5 h-3.5 text-slate-700" />
              <span>Review Answers</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              to="/results"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
            >
              <FileBarChart className="w-3.5 h-3.5 text-blue-700" />
              <span>View My Results</span>
            </Link>

            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Return to Dashboard</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Question-Wise Analysis & Solutions */}
      <div ref={solutionsSectionRef} className="mt-10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 font-display">
              Question-by-Question Analysis & Verified Solutions
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Review your selected option, the official answer key, and detailed academic
              explanation.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start">
            {(
              [
                { id: 'all', label: `All (${question_analysis.length})` },
                { id: 'correct', label: `Correct (${attempt.correct_count})` },
                { id: 'incorrect', label: `Incorrect (${attempt.incorrect_count})` },
                { id: 'unanswered', label: `Unanswered (${attempt.unanswered_count})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterStatus(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  filterStatus === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 space-y-5">
          {filteredQuestions.map((q: any) => (
            <div
              key={q.question_id}
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
            >
              {/* Question Header */}
              <div className="flex items-center justify-between gap-4 text-xs border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 font-mono">
                  <span className="font-bold text-slate-900">Question #{q.question_number}</span>
                  <span>·</span>
                  {q.status === 'correct' ? (
                    <span className="text-emerald-700 font-sans font-semibold inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Correct Response
                    </span>
                  ) : q.status === 'incorrect' ? (
                    <span className="text-red-600 font-sans font-semibold inline-flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" />
                      Incorrect Response
                    </span>
                  ) : (
                    <span className="text-slate-500 font-sans font-medium inline-flex items-center gap-1">
                      <MinusCircle className="w-3.5 h-3.5" />
                      Unanswered
                    </span>
                  )}
                </div>

                <span
                  className={`font-mono font-bold tabular-nums ${
                    q.marks_awarded > 0
                      ? 'text-emerald-700'
                      : q.marks_awarded < 0
                      ? 'text-red-600'
                      : 'text-slate-500'
                  }`}
                >
                  {q.marks_awarded > 0 ? `+${q.marks_awarded}` : q.marks_awarded} Marks
                </span>
              </div>

              <p className="text-sm sm:text-base font-medium text-slate-900 leading-relaxed">
                {q.question_text}
              </p>

              {/* Options Comparison */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(
                  [
                    { key: 'A', text: q.option_a },
                    { key: 'B', text: q.option_b },
                    { key: 'C', text: q.option_c },
                    { key: 'D', text: q.option_d },
                  ] as const
                ).map((opt) => {
                  const isCorrectOpt = q.correct_option === opt.key;
                  const isStudentSelected = q.selected_option === opt.key;

                  let boxClass = 'bg-slate-50 border-slate-200 text-slate-700';
                  if (isCorrectOpt) {
                    boxClass = 'bg-emerald-50 border-emerald-300 text-emerald-950 font-medium';
                  } else if (isStudentSelected && !isCorrectOpt) {
                    boxClass = 'bg-red-50 border-red-300 text-red-950';
                  }

                  return (
                    <div
                      key={opt.key}
                      className={`p-3.5 rounded-lg border text-xs flex items-start gap-2.5 ${boxClass}`}
                    >
                      <span className="font-mono font-bold shrink-0">{opt.key}.</span>
                      <div className="flex-1">
                        <span>{opt.text}</span>
                        <div className="mt-1 flex items-center gap-2 text-[11px] font-mono">
                          {isCorrectOpt && (
                            <span className="text-emerald-700 font-semibold">✓ Correct Answer</span>
                          )}
                          {isStudentSelected && (
                            <span
                              className={
                                isCorrectOpt
                                  ? 'text-emerald-700 font-semibold'
                                  : 'text-red-700 font-semibold'
                              }
                            >
                              {isCorrectOpt ? '(Your Choice)' : '✗ Your Choice'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Official Solution / Explanation */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 leading-relaxed">
                <div className="flex items-center gap-2 font-mono text-slate-900 font-semibold mb-1">
                  <span>Verified Answer Key: Option {q.correct_option}</span>
                  <span>·</span>
                  <span>Your Answer: {q.selected_option || 'Not Answered'}</span>
                </div>
                <p className="text-slate-600">{q.explanation}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
