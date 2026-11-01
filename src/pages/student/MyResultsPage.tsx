import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest, formatDurationSeconds } from '../../api/client.ts';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';
import { FileText, Filter, Award } from 'lucide-react';

export const MyResultsPage: React.FC = () => {
  const [results, setResults] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('');

  useEffect(() => {
    Promise.all([
      apiRequest<{ results: any[] }>('/api/v1/results/my'),
      apiRequest<{ subjects: any[] }>('/api/v1/subjects'),
    ])
      .then(([resData, subjData]) => {
        setResults(resData.results || []);
        setSubjects(subjData.subjects || []);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const filteredResults = useMemo(() => {
    return results.filter((r) => {
      if (subjectFilter !== 'all' && r.subject_slug !== subjectFilter) return false;
      if (categoryFilter !== 'all' && r.category_slug !== categoryFilter) return false;
      if (statusFilter === 'completed' && r.status === 'in_progress') return false;
      if (statusFilter === 'in_progress' && r.status !== 'in_progress') return false;
      if (dateFilter) {
        const dStr = (r.submitted_at || r.started_at || '').slice(0, 10);
        if (dStr !== dateFilter) return false;
      }
      return true;
    });
  }, [results, subjectFilter, categoryFilter, statusFilter, dateFilter]);

  const completedResults = useMemo(
    () => filteredResults.filter((r) => r.status !== 'in_progress'),
    [filteredResults]
  );

  // Build Recharts data from real backend attempts
  const trendChartData = useMemo(() => {
    return [...completedResults]
      .reverse()
      .map((r, idx) => ({
        attemptLabel: `#${idx + 1}`,
        testTitle: r.test_title,
        percentage: r.percentage,
        accuracy: r.accuracy,
        score: r.total_score,
      }));
  }, [completedResults]);

  const subjectChartData = useMemo(() => {
    const map = new Map<string, { subject: string; totalPct: number; count: number }>();
    completedResults.forEach((r) => {
      const existing = map.get(r.subject_name) || {
        subject: r.subject_name,
        totalPct: 0,
        count: 0,
      };
      existing.totalPct += r.percentage;
      existing.count += 1;
      map.set(r.subject_name, existing);
    });
    return Array.from(map.values()).map((item) => ({
      subject: item.subject,
      avgPercentage: Math.round((item.totalPct / item.count) * 10) / 10,
      attempts: item.count,
    }));
  }, [completedResults]);

  const avgAccuracy =
    completedResults.length > 0
      ? Math.round(
          (completedResults.reduce((acc, r) => acc + r.accuracy, 0) / completedResults.length) * 10
        ) / 10
      : 0;

  const avgPercentage =
    completedResults.length > 0
      ? Math.round(
          (completedResults.reduce((acc, r) => acc + r.percentage, 0) / completedResults.length) *
            10
        ) / 10
      : 0;

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-blue-700">CONSOLIDATED PERFORMANCE ANALYTICS</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 font-display">
            My Results & Analytics
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Track your examination scores, accuracy rates, and category-wise trends across all
            seven CUET PG subjects.
          </p>
        </div>

        {/* Summary KPI Strip */}
        <div className="flex items-center gap-6 bg-white border border-slate-200 rounded-xl px-5 py-3 text-xs">
          <div>
            <span className="text-slate-500 block">Completed Tests</span>
            <span className="font-mono text-lg font-bold text-slate-900 tabular-nums">
              {completedResults.length}
            </span>
          </div>
          <div className="h-8 w-px bg-slate-200" />
          <div>
            <span className="text-slate-500 block">Avg Score %</span>
            <span className="font-mono text-lg font-bold text-blue-700 tabular-nums">
              {avgPercentage}%
            </span>
          </div>
          <div className="h-8 w-px bg-slate-200" />
          <div>
            <span className="text-slate-500 block">Avg Accuracy</span>
            <span className="font-mono text-lg font-bold text-emerald-700 tabular-nums">
              {avgAccuracy}%
            </span>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="mt-6 bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
            Subject
          </label>
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
          >
            <option value="all">All Subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.slug}>
                {s.name} ({s.paper_code})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
            Test Category
          </label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
          >
            <option value="all">All Categories</option>
            <option value="sectional">Sectional Tests</option>
            <option value="full_length">Full-Length Tests</option>
            <option value="pyq">PYQ Tests</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
            Completion Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
          >
            <option value="all">All Attempts</option>
            <option value="completed">Submitted & Evaluated</option>
            <option value="in_progress">In Progress</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
            Filter by Date
          </label>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
          />
        </div>
      </div>

      {/* Recharts Analytics Section (Only rendered from real completed attempts) */}
      {completedResults.length > 0 && (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-sm font-bold text-slate-900 font-display">
              Score Percentage & Accuracy Progression
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Chronological progression across your completed mock examinations
            </p>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="attemptLabel" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="percentage"
                    name="Score %"
                    stroke="#1d4ed8"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="accuracy"
                    name="Accuracy %"
                    stroke="#059669"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-sm font-bold text-slate-900 font-display">
              Subject-Wise Average Score Percentage
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Aggregated performance across attempted CUET PG subjects
            </p>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={subjectChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="subject" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="avgPercentage" name="Avg Score %" fill="#0f172a" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Results Table */}
      <div className="mt-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-xs text-slate-500">Loading your results...</div>
        ) : filteredResults.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-semibold text-slate-900">No Examination Attempts Found</p>
            <p className="mt-1 text-xs text-slate-600">
              Attempt one of the global free diagnostic tests or a test from your purchased subject
              series to see your analytics here.
            </p>
            <Link
              to="/free-tests"
              className="mt-4 inline-block px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg"
            >
              Attempt a Free Diagnostic Test
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <th className="py-3.5 px-4 font-semibold">Subject</th>
                  <th className="py-3.5 px-4 font-semibold">Test Title</th>
                  <th className="py-3.5 px-4 font-semibold">Category</th>
                  <th className="py-3.5 px-4 font-semibold">Date</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Score</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Accuracy</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Time</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredResults.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80">
                    <td className="py-3.5 px-4 text-xs font-semibold text-slate-800">
                      {r.subject_name} ({r.paper_code})
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-900">{r.test_title}</td>
                    <td className="py-3.5 px-4 text-xs text-slate-600">{r.category_name}</td>
                    <td className="py-3.5 px-4 text-xs text-slate-600 font-mono tabular-nums">
                      {new Date(r.submitted_at || r.started_at).toLocaleDateString('en-IN')}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                      {r.status === 'in_progress'
                        ? 'In Progress'
                        : `${r.total_score} / ${r.maximum_marks} (${r.percentage}%)`}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-emerald-700 tabular-nums">
                      {r.status === 'in_progress' ? '—' : `${r.accuracy}%`}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-600 tabular-nums">
                      {r.status === 'in_progress'
                        ? '—'
                        : formatDurationSeconds(r.time_taken_seconds)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {r.status === 'in_progress' ? (
                        <Link
                          to={`/exam/${r.id}`}
                          className="text-xs font-semibold text-amber-700 hover:underline"
                        >
                          Resume Exam
                        </Link>
                      ) : (
                        <Link
                          to={`/results/${r.id}`}
                          className="text-xs font-semibold text-blue-700 hover:underline"
                        >
                          View Solutions
                        </Link>
                      )}
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
