import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../../api/client.ts';
import { OptionKey, SanitizedQuestion } from '../../types/domain.ts';
import {
  Clock,
  ChevronLeft,
  ChevronRight,
  Flag,
  RotateCcw,
  Send,
  AlertTriangle,
  CheckCircle2,
  WifiOff,
} from 'lucide-react';

interface LocalAnswerState {
  selected_option: OptionKey | null;
  is_marked_for_review: boolean;
  is_visited: boolean;
}

export const ExaminationHallPage: React.FC = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<any>(null);
  const [questions, setQuestions] = useState<SanitizedQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answersMap, setAnswersMap] = useState<Record<string, LocalAnswerState>>({});
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Offset between server time and browser clock to prevent device clock tampering
  const serverOffsetMsRef = useRef<number>(0);
  const expiresAtMsRef = useRef<number>(0);
  const autoSubmittedRef = useRef<boolean>(false);

  const loadSession = useCallback(async () => {
    if (!attemptId) return;
    try {
      const data = await apiRequest(`/api/v1/attempts/${attemptId}/session`);
      if (data.attempt.status !== 'in_progress') {
        navigate(`/results/${attemptId}`, { replace: true });
        return;
      }

      const serverNowMs = new Date(data.server_now).getTime();
      serverOffsetMsRef.current = serverNowMs - Date.now();
      expiresAtMsRef.current = new Date(data.attempt.expires_at).getTime();

      const qs: SanitizedQuestion[] = data.questions || [];
      setSession(data);
      setQuestions(qs);

      const initialMap: Record<string, LocalAnswerState> = {};
      qs.forEach((q, idx) => {
        initialMap[q.id] = {
          selected_option: null,
          is_marked_for_review: false,
          is_visited: idx === 0,
        };
      });

      (data.answers || []).forEach((ans: any) => {
        initialMap[ans.question_id] = {
          selected_option: ans.selected_option,
          is_marked_for_review: Boolean(ans.is_marked_for_review),
          is_visited: Boolean(ans.is_visited ?? true),
        };
      });

      setAnswersMap(initialMap);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load exam session:', err);
      navigate('/dashboard');
    }
  }, [attemptId, navigate]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // Persist answer state to backend
  const persistQuestionState = useCallback(
    async (questionId: string, state: LocalAnswerState) => {
      if (!attemptId) return;
      setSavingStatus('saving');
      try {
        await apiRequest(`/api/v1/attempts/${attemptId}/answers`, {
          method: 'PUT',
          body: JSON.stringify({
            question_id: questionId,
            selected_option: state.selected_option,
            is_marked_for_review: state.is_marked_for_review,
            is_visited: state.is_visited,
          }),
        });
        setSavingStatus('saved');
      } catch (err: any) {
        if (err.status === 409) {
          navigate(`/results/${attemptId}`, { replace: true });
          return;
        }
        setSavingStatus('error');
      }
    },
    [attemptId, navigate]
  );

  const handleFinalSubmit = useCallback(async () => {
    if (!attemptId || submitting) return;
    setSubmitting(true);
    try {
      await apiRequest(`/api/v1/attempts/${attemptId}/submit`, {
        method: 'POST',
      });
      navigate(`/results/${attemptId}`, { replace: true });
    } catch (err) {
      console.error('Submit error:', err);
      setSubmitting(false);
    }
  }, [attemptId, submitting, navigate]);

  // Authoritative Countdown Timer calibrated against Server Clock Offset
  useEffect(() => {
    if (loading || !expiresAtMsRef.current) return;

    const tick = () => {
      const authoritativeNowMs = Date.now() + serverOffsetMsRef.current;
      const diffSec = Math.max(
        0,
        Math.floor((expiresAtMsRef.current - authoritativeNowMs) / 1000)
      );
      setRemainingSeconds(diffSec);

      if (diffSec <= 0 && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        handleFinalSubmit();
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [loading, handleFinalSubmit]);

  const currentQuestion = questions[currentIdx];
  const currentState: LocalAnswerState = currentQuestion
    ? answersMap[currentQuestion.id] || {
        selected_option: null,
        is_marked_for_review: false,
        is_visited: true,
      }
    : { selected_option: null, is_marked_for_review: false, is_visited: true };

  const jumpToQuestion = (targetIdx: number) => {
    if (targetIdx < 0 || targetIdx >= questions.length) return;
    const targetQ = questions[targetIdx];
    const existing = answersMap[targetQ.id] || {
      selected_option: null,
      is_marked_for_review: false,
      is_visited: false,
    };
    if (!existing.is_visited) {
      const updated = { ...existing, is_visited: true };
      setAnswersMap((prev) => ({ ...prev, [targetQ.id]: updated }));
      persistQuestionState(targetQ.id, updated);
    }
    setCurrentIdx(targetIdx);
  };

  const handleSelectOption = (opt: OptionKey) => {
    if (!currentQuestion) return;
    const updated: LocalAnswerState = {
      ...currentState,
      selected_option: opt,
      is_visited: true,
    };
    setAnswersMap((prev) => ({ ...prev, [currentQuestion.id]: updated }));
    persistQuestionState(currentQuestion.id, updated);
  };

  const handleClearResponse = () => {
    if (!currentQuestion) return;
    const updated: LocalAnswerState = {
      ...currentState,
      selected_option: null,
      is_visited: true,
    };
    setAnswersMap((prev) => ({ ...prev, [currentQuestion.id]: updated }));
    persistQuestionState(currentQuestion.id, updated);
  };

  const handleToggleMarkReview = () => {
    if (!currentQuestion) return;
    const updated: LocalAnswerState = {
      ...currentState,
      is_marked_for_review: !currentState.is_marked_for_review,
      is_visited: true,
    };
    setAnswersMap((prev) => ({ ...prev, [currentQuestion.id]: updated }));
    persistQuestionState(currentQuestion.id, updated);
  };

  const handleSaveAndNext = () => {
    if (!currentQuestion) return;
    const updated: LocalAnswerState = {
      ...currentState,
      is_visited: true,
    };
    setAnswersMap((prev) => ({ ...prev, [currentQuestion.id]: updated }));
    persistQuestionState(currentQuestion.id, updated);
    if (currentIdx < questions.length - 1) {
      jumpToQuestion(currentIdx + 1);
    }
  };

  if (loading || !currentQuestion) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-800">
            Loading Examination Session & Synchronizing Server Timer...
          </p>
        </div>
      </div>
    );
  }

  // Palette summary counts
  let answeredCount = 0;
  let notAnsweredVisitedCount = 0;
  let markedUnansweredCount = 0;
  let answeredAndMarkedCount = 0;
  let notVisitedCount = 0;

  questions.forEach((q) => {
    const st = answersMap[q.id];
    if (!st || !st.is_visited) {
      notVisitedCount++;
    } else if (st.selected_option && st.is_marked_for_review) {
      answeredAndMarkedCount++;
    } else if (st.selected_option) {
      answeredCount++;
    } else if (st.is_marked_for_review) {
      markedUnansweredCount++;
    } else {
      notAnsweredVisitedCount++;
    }
  });

  const formatTimer = (secs: number | null) => {
    if (secs === null) return '--:--';
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const remSecs = secs % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    if (hrs > 0) return `${pad(hrs)}:${pad(mins)}:${pad(remSecs)}`;
    return `${pad(mins)}:${pad(remSecs)}`;
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Top Examination Header Bar */}
      <header className="bg-slate-900 text-white px-6 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-blue-300 font-mono">
            <span>PrimePrep CBT</span>
            <span>·</span>
            <span>{session.subject?.name} ({session.subject?.paper_code})</span>
          </div>
          <h1 className="text-sm sm:text-base font-bold font-display truncate max-w-xl">
            {session.test?.title}
          </h1>
        </div>

        <div className="flex items-center gap-4">
          {/* Persistence Indicator */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-300">
            {savingStatus === 'saving' ? (
              <span>Syncing response...</span>
            ) : savingStatus === 'error' ? (
              <span className="text-red-400 inline-flex items-center gap-1">
                <WifiOff className="w-3.5 h-3.5" />
                Retry saving
              </span>
            ) : (
              <span className="text-emerald-400 inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Responses Saved
              </span>
            )}
          </div>

          {/* Authoritative Countdown Clock */}
          <div
            className={`px-4 py-2 rounded-lg border font-mono text-sm sm:text-base font-bold tabular-nums flex items-center gap-2 ${
              remainingSeconds !== null && remainingSeconds < 300
                ? 'bg-red-950 border-red-700 text-red-300'
                : 'bg-slate-800 border-slate-700 text-white'
            }`}
          >
            <Clock className="w-4 h-4 text-blue-400" />
            <span>Time Left: {formatTimer(remainingSeconds)}</span>
          </div>

          <button
            onClick={() => setShowSubmitModal(true)}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            Submit Test
          </button>
        </div>
      </header>

      {/* Main Split Examination Workspace */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Question Stage (8 cols) */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl flex flex-col justify-between min-h-[540px]">
          <div>
            {/* Question Number & Marking Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between text-xs">
              <span className="font-bold text-slate-900 font-mono">
                Question {currentIdx + 1} of {questions.length}
              </span>
              <div className="flex items-center gap-3 font-mono tabular-nums">
                <span className="text-emerald-700 font-semibold">
                  Correct: +{currentQuestion.marks}
                </span>
                <span>·</span>
                <span className="text-red-600 font-semibold">
                  Incorrect: -{currentQuestion.negative_marks}
                </span>
              </div>
            </div>

            {/* Question Stem */}
            <div className="p-6">
              <p className="text-base sm:text-lg font-medium text-slate-900 leading-relaxed">
                {currentQuestion.question_text}
              </p>

              {/* Four MCQ Options */}
              <div className="mt-6 space-y-3">
                {(
                  [
                    { key: 'A' as OptionKey, text: currentQuestion.option_a },
                    { key: 'B' as OptionKey, text: currentQuestion.option_b },
                    { key: 'C' as OptionKey, text: currentQuestion.option_c },
                    { key: 'D' as OptionKey, text: currentQuestion.option_d },
                  ] as const
                ).map((opt) => {
                  const isSelected = currentState.selected_option === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => handleSelectOption(opt.key)}
                      className={`w-full text-left p-4 rounded-xl border transition-colors flex items-start gap-3.5 cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50/90 border-blue-700 text-slate-900'
                          : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <span
                        className={`w-7 h-7 rounded-lg font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 ${
                          isSelected
                            ? 'bg-blue-700 text-white'
                            : 'bg-slate-100 text-slate-700 border border-slate-300'
                        }`}
                      >
                        {opt.key}
                      </span>
                      <span className="text-sm leading-relaxed">{opt.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bottom Control Deck */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 rounded-b-xl">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleToggleMarkReview}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                  currentState.is_marked_for_review
                    ? 'bg-amber-100 border-amber-400 text-amber-900'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Flag className="w-3.5 h-3.5" />
                <span>
                  {currentState.is_marked_for_review
                    ? 'Unmark for Review'
                    : 'Mark for Review'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleClearResponse}
                disabled={!currentState.selected_option}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear Response</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => jumpToQuestion(currentIdx - 1)}
                disabled={currentIdx === 0}
                className="inline-flex items-center gap-1 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-100 disabled:opacity-40 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>

              <button
                type="button"
                onClick={handleSaveAndNext}
                className="inline-flex items-center gap-1 px-5 py-2 text-xs font-semibold rounded-lg bg-blue-700 hover:bg-blue-800 text-white transition-colors cursor-pointer"
              >
                <span>{currentIdx === questions.length - 1 ? 'Save Answer' : 'Save & Next'}</span>
                {currentIdx < questions.length - 1 && <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Right: Question Navigation Palette (4 cols) */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
            Question Navigation Palette
          </h2>

          {/* 5-State Summary Grid */}
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs border-b border-slate-200 pb-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded bg-emerald-600 text-white font-mono text-xs font-bold flex items-center justify-center tabular-nums">
                {answeredCount}
              </span>
              <span className="text-slate-600">Answered</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded bg-red-600 text-white font-mono text-xs font-bold flex items-center justify-center tabular-nums">
                {notAnsweredVisitedCount}
              </span>
              <span className="text-slate-600">Not Answered</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded bg-slate-200 text-slate-800 font-mono text-xs font-bold flex items-center justify-center tabular-nums">
                {notVisitedCount}
              </span>
              <span className="text-slate-600">Not Visited</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded bg-amber-500 text-white font-mono text-xs font-bold flex items-center justify-center tabular-nums">
                {markedUnansweredCount}
              </span>
              <span className="text-slate-600">Marked Review</span>
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <span className="w-6 h-6 rounded bg-blue-700 text-white font-mono text-xs font-bold flex items-center justify-center tabular-nums">
                {answeredAndMarkedCount}
              </span>
              <span className="text-slate-600">Answered & Marked for Review</span>
            </div>
          </div>

          {/* Question Number Buttons */}
          <div className="mt-4 grid grid-cols-5 gap-2.5">
            {questions.map((q, idx) => {
              const st = answersMap[q.id];
              let btnStyle = 'bg-slate-200 text-slate-800 hover:bg-slate-300'; // Not visited
              if (st?.is_visited) {
                if (st.selected_option && st.is_marked_for_review) {
                  btnStyle = 'bg-blue-700 text-white';
                } else if (st.selected_option) {
                  btnStyle = 'bg-emerald-600 text-white';
                } else if (st.is_marked_for_review) {
                  btnStyle = 'bg-amber-500 text-white';
                } else {
                  btnStyle = 'bg-red-600 text-white';
                }
              }

              const isCurrent = idx === currentIdx;
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => jumpToQuestion(idx)}
                  className={`h-10 rounded-lg font-mono text-xs font-bold transition-all cursor-pointer tabular-nums ${btnStyle} ${
                    isCurrent ? 'ring-2 ring-offset-2 ring-slate-900' : ''
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setShowSubmitModal(true)}
              className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Finish & Submit Examination</span>
            </button>
          </div>
        </div>
      </div>

      {/* Submission Confirmation Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center gap-2 text-amber-700 text-xs font-bold uppercase">
              <AlertTriangle className="w-4 h-4" />
              <span>Confirm Final Examination Submission</span>
            </div>

            <h3 className="mt-2 text-lg font-bold text-slate-900 font-display">
              Are you ready to submit your test?
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              Once submitted, no further changes can be made to your answers due to the one-attempt
              examination policy.
            </p>

            <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs font-mono tabular-nums">
              <div className="flex justify-between">
                <span className="font-sans text-slate-600">Total Questions</span>
                <span className="font-bold text-slate-900">{questions.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-sans text-emerald-700">
                  Answered (including Answered & Marked)
                </span>
                <span className="font-bold text-emerald-700">
                  {answeredCount + answeredAndMarkedCount}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-sans text-red-600">Visited but Unanswered</span>
                <span className="font-bold text-red-600">
                  {notAnsweredVisitedCount + markedUnansweredCount}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-sans text-slate-500">Not Visited</span>
                <span className="font-bold text-slate-700">{notVisitedCount}</span>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Return to Questions
              </button>
              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={submitting}
                className="px-5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
              >
                {submitting ? 'Evaluating on Server...' : 'Confirm & Submit Test'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
