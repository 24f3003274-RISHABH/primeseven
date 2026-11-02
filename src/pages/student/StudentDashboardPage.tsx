import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest, formatPaiseToINR } from '../../api/client.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { listUserBookmarksFromFirestore, FirestoreBookmarkDoc } from '../../lib/firebase.ts';
import {
  ArrowRight,
  CheckCircle2,
  PlayCircle,
  Shield,
  Bookmark,
  Copy,
  Share2,
  Gift,
  Wallet,
  KeyRound,
  Check,
  MessageCircle,
} from 'lucide-react';

export const StudentDashboardPage: React.FC = () => {
  const { profile } = useAuth();
  const [subjects, setSubjects] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [freeTests, setFreeTests] = useState<any[]>([]);
  const [referralData, setReferralData] = useState<any>(null);
  const [bookmarks, setBookmarks] = useState<FirestoreBookmarkDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedType, setCopiedType] = useState<'code' | 'link' | null>(null);

  useEffect(() => {
    Promise.all([
      apiRequest<{ subjects: any[] }>('/api/v1/subjects'),
      apiRequest<{ results: any[] }>('/api/v1/results/my'),
      apiRequest<{ free_tests: any[] }>('/api/v1/public/stats'),
      apiRequest<any>('/api/v1/referrals/my').catch(() => null),
    ])
      .then(([subjRes, resData, pubStats, refRes]) => {
        setSubjects(subjRes.subjects || []);
        setResults(resData.results || []);
        setFreeTests(pubStats.free_tests || []);
        setReferralData(refRes);
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
      ? Number(
          (completedAttempts.reduce((acc, r) => acc + r.accuracy, 0) / completedAttempts.length).toFixed(2)
        )
      : 0;

  const referralCode = referralData?.referral_code || profile?.referral_code || '';
  const referralLink = referralCode
    ? `${window.location.origin}/register?ref=${encodeURIComponent(referralCode)}`
    : '';

  const handleCopy = async (text: string, type: 'code' | 'link') => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 2000);
    } catch {
      // Fallback
    }
  };

  const handleWhatsAppShare = () => {
    if (!referralCode) return;
    const friendDisc = referralData?.referral_settings?.friend_discount_percent || 10;
    const msg = `Join me on PrimePrep CUET PG Test Series! Use my referral code ${referralCode} to get ${friendDisc}% OFF your first subject package: ${referralLink}`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.location.assign(waUrl);
  };

  const handleNativeShare = async () => {
    if (!referralCode) return;
    const friendDisc = referralData?.referral_settings?.friend_discount_percent || 10;
    const shareText = `Use my referral code ${referralCode} on PrimePrep CUET PG for ${friendDisc}% OFF your subject package!`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'PrimePrep CUET PG Referral',
          text: shareText,
          url: referralLink,
        });
        return;
      } catch {
        // Fallback to copy link
      }
    }
    await handleCopy(referralLink, 'link');
  };

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
          <Link
            to="/change-password"
            className="inline-flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
          >
            <KeyRound className="w-3.5 h-3.5 text-slate-600" />
            <span>Change Password</span>
          </Link>
          {profile?.role === 'admin' && (
            <Link
              to="/admin"
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
            >
              <Shield className="w-4 h-4 text-blue-400" />
              <span>Open Admin Console</span>
            </Link>
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
            {avgAccuracy.toFixed(2)}%
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

      {/* FEATURE 2: STUDENT REFER-A-FRIEND PROGRAMME SECTION */}
      <div className="mt-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-6 sm:p-8 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-mono text-blue-700 font-semibold uppercase">
              <Gift className="w-4 h-4" />
              <span>STUDENT REFERRAL & REWARDS PROGRAMME</span>
            </div>
            <h2 className="mt-1.5 text-xl sm:text-2xl font-bold text-slate-900 font-display">
              Refer a Friend & Earn Rewards
            </h2>
            <p className="mt-1.5 text-xs sm:text-sm text-slate-600 leading-relaxed">
              Invite fellow CUET PG aspirants with your personal referral code or link. Your friend
              receives a{' '}
              <strong>
                {referralData?.referral_settings?.friend_discount_percent ?? 10}% discount
              </strong>{' '}
              on their first subject-series purchase, and you earn{' '}
              <strong>
                {referralData?.referral_settings?.referrer_reward_percent ?? 10}% of the base
                package price
              </strong>{' '}
              as promotional wallet credit once their payment is verified.
            </p>
          </div>

          {/* Referral Code & Sharing Actions */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 shrink-0 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <span className="text-[11px] font-mono text-slate-500 uppercase block">
                  My Referral Code
                </span>
                <span className="mt-0.5 text-xl font-extrabold font-mono text-slate-900 tracking-wider block">
                  {referralCode || 'GENERATING...'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(referralCode, 'code')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                {copiedType === 'code' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">Copied Code</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-600" />
                    <span>Copy Referral Code</span>
                  </>
                )}
              </button>
            </div>

            <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopy(referralLink, 'link')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                {copiedType === 'link' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Link Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Referral Link</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleWhatsAppShare}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-900 bg-emerald-100 hover:bg-emerald-200 rounded-lg cursor-pointer"
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-700" />
                <span>Share on WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={handleNativeShare}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-lg cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5 text-blue-700" />
                <span>Share</span>
              </button>
            </div>
          </div>
        </div>

        {/* 5 Real Referral & Wallet Metrics */}
        <div className="p-6 bg-slate-50/70 grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <span className="text-xs text-slate-500 block">Total Friends Referred</span>
            <span className="mt-1 text-xl font-bold text-slate-900 font-mono tabular-nums block">
              {referralData?.stats?.total_friends_referred ?? 0}
            </span>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <span className="text-xs text-slate-500 block">Successful Referral Purchases</span>
            <span className="mt-1 text-xl font-bold text-emerald-700 font-mono tabular-nums block">
              {referralData?.stats?.successful_referral_purchases ?? 0}
            </span>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <span className="text-xs text-slate-500 block">Pending Referrals</span>
            <span className="mt-1 text-xl font-bold text-amber-700 font-mono tabular-nums block">
              {referralData?.stats?.pending_referrals ?? 0}
            </span>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <span className="text-xs text-slate-500 block">Total Rewards Earned</span>
            <span className="mt-1 text-xl font-bold text-blue-700 font-mono tabular-nums block">
              {formatPaiseToINR(referralData?.stats?.total_rewards_earned_paise ?? 0)}
            </span>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4 col-span-2 sm:col-span-1">
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Wallet className="w-3.5 h-3.5 text-emerald-700" />
              <span>Available Wallet Credit</span>
            </span>
            <span className="mt-1 text-xl font-bold text-emerald-700 font-mono tabular-nums block">
              {formatPaiseToINR(referralData?.stats?.available_wallet_credit_paise ?? 0)}
            </span>
          </div>
        </div>

        {/* Referral Activity & Auditable Wallet Ledger */}
        {((referralData?.referrals && referralData.referrals.length > 0) ||
          (referralData?.wallet_ledger && referralData.wallet_ledger.length > 0)) && (
          <div className="p-6 border-t border-slate-200 grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
            <div>
              <h3 className="font-bold text-slate-900 font-display text-sm mb-2">
                Referred Friends Status
              </h3>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold">Friend</th>
                      <th className="py-2.5 px-3 font-semibold">Status</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Reward Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(referralData.referrals || []).map((ref: any) => (
                      <tr key={ref.id}>
                        <td className="py-2.5 px-3">
                          <p className="font-medium text-slate-900">{ref.referred_user_name}</p>
                          <p className="text-[11px] text-slate-500 font-mono">
                            {ref.referred_user_email}
                          </p>
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[11px] font-mono font-semibold uppercase ${
                              ref.status === 'rewarded'
                                ? 'bg-emerald-50 text-emerald-700'
                                : ref.status === 'reversed'
                                ? 'bg-red-50 text-red-700'
                                : 'bg-amber-50 text-amber-800'
                            }`}
                          >
                            {ref.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                          {ref.status === 'rewarded'
                            ? `+${formatPaiseToINR(ref.referrer_reward_paise)}`
                            : ref.status === 'reversed'
                            ? 'Reversed'
                            : 'Pending Purchase'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="font-bold text-slate-900 font-display text-sm mb-2">
                Promotional Wallet Ledger (Non-Withdrawable Credit)
              </h3>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold">Description</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Amount</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(referralData.wallet_ledger || []).map((tx: any) => (
                      <tr key={tx.id}>
                        <td className="py-2.5 px-3">
                          <p className="text-slate-800">{tx.description}</p>
                          <p className="text-[11px] text-slate-400 font-mono">
                            {new Date(tx.created_at).toLocaleString('en-IN')}
                          </p>
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-mono font-bold tabular-nums ${
                            tx.amount_paise >= 0 ? 'text-emerald-700' : 'text-red-600'
                          }`}
                        >
                          {tx.amount_paise >= 0
                            ? `+${formatPaiseToINR(tx.amount_paise)}`
                            : `-${formatPaiseToINR(Math.abs(tx.amount_paise))}`}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-900 tabular-nums">
                          {formatPaiseToINR(tx.balance_after_paise)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

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
                        {Number(r.accuracy).toFixed(2)}%
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
