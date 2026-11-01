import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../../api/client.ts';
import { ArrowRight, CheckCircle2, Clock, FileText } from 'lucide-react';

export const FreeTestsPage: React.FC = () => {
  const [freeTests, setFreeTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<{ free_tests: any[] }>('/api/v1/public/stats')
      .then((res) => setFreeTests(res.free_tests || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div>
        <p className="text-xs font-medium text-blue-700">OPEN DIAGNOSTIC EXAMINATIONS</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900 font-display">
          Platform-Designated Free Mock Tests
        </h1>
        <p className="mt-3 text-sm text-slate-600 max-w-2xl leading-relaxed">
          PrimePrep designates two global free examinations across the platform—one Sectional Test
          and one Previous Year Question (PYQ) Test—accessible to every registered student without
          purchasing a subject series.
        </p>
      </div>

      {loading ? (
        <div className="mt-8 space-y-4">
          <div className="h-32 bg-white border border-slate-200 rounded-xl animate-pulse" />
          <div className="h-32 bg-white border border-slate-200 rounded-xl animate-pulse" />
        </div>
      ) : freeTests.length === 0 ? (
        <div className="mt-8 p-8 bg-white border border-slate-200 rounded-xl text-center">
          <p className="text-sm text-slate-600">
            No global free tests are currently designated by the administrator.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          {freeTests.map((t) => (
            <div
              key={t.id}
              className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-2 text-xs text-emerald-700 font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Free Access</span>
                  <span>·</span>
                  <span>
                    {t.category_slug === 'sectional' ? 'Sectional Test' : 'PYQ Official Paper'}
                  </span>
                  <span>·</span>
                  <span>{t.subject_name}</span>
                </div>

                <h2 className="mt-3 text-lg font-bold text-slate-900 font-display">{t.title}</h2>

                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-600 font-mono tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    {t.duration_minutes} Minutes
                  </span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    {t.total_questions} Questions
                  </span>
                  <span>·</span>
                  <span>Max {t.maximum_marks} Marks (+4 / -1)</span>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
                <Link
                  to={`/subjects/${t.subject_slug}`}
                  className="text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  View {t.subject_name} Catalogue
                </Link>

                <Link
                  to={`/tests/${t.id}/instructions`}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
                >
                  <span>Proceed to Instructions</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-10 p-6 bg-slate-100 border border-slate-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            Ready for Complete Subject-Wise Preparation?
          </h3>
          <p className="mt-1 text-xs text-slate-600">
            Unlock all 15 Sectional Tests, 10 Full-Length Tests, and 5 PYQ Tests in your target
            CUET PG subject with a single subject-series package.
          </p>
        </div>
        <Link
          to="/subjects"
          className="px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap shrink-0"
        >
          Browse All 7 Subjects
        </Link>
      </div>
    </div>
  );
};
