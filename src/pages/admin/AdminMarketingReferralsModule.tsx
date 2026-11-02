import React, { useEffect, useState, useCallback } from 'react';
import { apiRequest, formatPaiseToINR } from '../../api/client.ts';
import {
  Users,
  Gift,
  Tag,
  Settings,
  BarChart3,
  Plus,
  Download,
  Edit3,
  Search,
  CheckCircle2,
  X,
} from 'lucide-react';

type SubTab = 'agents' | 'referrals' | 'promo_codes' | 'referral_settings' | 'analytics';

interface Props {
  subjects: any[];
  notify: (type: 'success' | 'error', text: string) => void;
}

export const AdminMarketingReferralsModule: React.FC<Props> = ({ subjects, notify }) => {
  const [subTab, setSubTab] = useState<SubTab>('agents');
  const [loading, setLoading] = useState(false);

  // Data states
  const [agents, setAgents] = useState<any[]>([]);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [walletTransactions, setWalletTransactions] = useState<any[]>([]);
  const [promoCodes, setPromoCodes] = useState<any[]>([]);
  const [referralSettings, setReferralSettings] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);

  // Agent Modal State
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<any | null>(null);
  const [agentForm, setAgentForm] = useState({
    name: '',
    email: '',
    phone: '',
    promo_code: '',
    discount_percent: 10,
    commission_percent: 10,
    status: 'active' as 'active' | 'inactive' | 'suspended',
    notes: '',
  });
  const [inspectedAgent, setInspectedAgent] = useState<any | null>(null);

  // Promo Code Modal State
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [editingPromo, setEditingPromo] = useState<any | null>(null);
  const [promoForm, setPromoForm] = useState({
    code: '',
    code_type: 'campaign' as 'agent' | 'campaign',
    agent_id: '',
    discount_percent: 10,
    min_purchase_paise: 0,
    max_total_uses: '',
    max_uses_per_user: 1,
    valid_from: '',
    valid_until: '',
    applicable_subject_ids: [] as string[],
    is_active: true,
    description: '',
  });

  // Filters
  const [referralSearch, setReferralSearch] = useState('');
  const [referralStatusFilter, setReferralStatusFilter] = useState('');
  const [analyticsFilters, setAnalyticsFilters] = useState({
    agent_id: '',
    promo_code: '',
    subject_id: '',
    status: '',
    date_from: '',
    date_to: '',
  });

  const loadMarketingData = useCallback(async () => {
    setLoading(true);
    try {
      const [agentsRes, refRes, promoRes, settingsRes, overviewRes] = await Promise.all([
        apiRequest<{ agents: any[] }>('/api/v1/admin/marketing/agents'),
        apiRequest<{ referrals: any[]; wallet_transactions: any[] }>(
          '/api/v1/admin/marketing/referrals'
        ),
        apiRequest<{ promo_codes: any[] }>('/api/v1/admin/marketing/promo-codes'),
        apiRequest<{ referral_settings: any }>('/api/v1/admin/marketing/referral-settings'),
        apiRequest<any>('/api/v1/admin/marketing/overview'),
      ]);
      setAgents(agentsRes.agents || []);
      setReferrals(refRes.referrals || []);
      setWalletTransactions(refRes.wallet_transactions || []);
      setPromoCodes(promoRes.promo_codes || []);
      setReferralSettings(settingsRes.referral_settings || null);
      setAnalytics(overviewRes);
    } catch (err: any) {
      notify('error', err.message || 'Failed to load marketing & referral data');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadMarketingData();
  }, [loadMarketingData]);

  const handleFilterAnalytics = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      const qs = new URLSearchParams();
      if (analyticsFilters.agent_id) qs.set('agent_id', analyticsFilters.agent_id);
      if (analyticsFilters.promo_code) qs.set('promo_code', analyticsFilters.promo_code);
      if (analyticsFilters.subject_id) qs.set('subject_id', analyticsFilters.subject_id);
      if (analyticsFilters.status) qs.set('status', analyticsFilters.status);
      if (analyticsFilters.date_from) qs.set('date_from', analyticsFilters.date_from);
      if (analyticsFilters.date_to) qs.set('date_to', analyticsFilters.date_to);
      const res = await apiRequest(`/api/v1/admin/marketing/overview?${qs.toString()}`);
      setAnalytics(res);
    } catch (err: any) {
      notify('error', err.message || 'Failed to filter analytics');
    }
  };

  // Save Agent Handler
  const handleSaveAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingAgent) {
        await apiRequest(`/api/v1/admin/marketing/agents/${editingAgent.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            ...agentForm,
            discount_percent: Number(agentForm.discount_percent),
            commission_percent: Number(agentForm.commission_percent),
          }),
        });
        notify('success', `Updated sales agent "${agentForm.name}".`);
      } else {
        await apiRequest('/api/v1/admin/marketing/agents', {
          method: 'POST',
          body: JSON.stringify({
            ...agentForm,
            discount_percent: Number(agentForm.discount_percent),
            commission_percent: Number(agentForm.commission_percent),
          }),
        });
        notify('success', `Created sales agent "${agentForm.name}".`);
      }
      setShowAgentModal(false);
      setEditingAgent(null);
      await loadMarketingData();
    } catch (err: any) {
      notify('error', err.message || 'Failed to save sales agent');
    }
  };

  // Quick Agent Status Update
  const handleQuickAgentStatus = async (
    agent: any,
    newStatus: 'active' | 'inactive' | 'suspended'
  ) => {
    try {
      await apiRequest(`/api/v1/admin/marketing/agents/${agent.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      notify('success', `Agent ${agent.name} status set to ${newStatus}.`);
      await loadMarketingData();
    } catch (err: any) {
      notify('error', err.message || 'Could not update agent status');
    }
  };

  // Export Agent Performance Report CSV
  const handleExportAgentsCsv = () => {
    const headers = [
      'Agent Name',
      'Email',
      'Phone',
      'Promo Code',
      'Status',
      'Discount %',
      'Students Used Code',
      'Successful Purchases',
      'Pending Purchases',
      'Failed Purchases',
      'Conversion Rate %',
      'Total Sales Value (INR)',
      'Total Discount Given (INR)',
    ];
    const rows = agents.map((a) => [
      `"${(a.name || '').replace(/"/g, '""')}"`,
      `"${a.email || ''}"`,
      `"${a.phone || ''}"`,
      a.promo_code,
      a.status,
      a.discount_percent,
      a.stats?.students_used_count ?? 0,
      a.stats?.successful_purchases_count ?? 0,
      a.stats?.pending_purchases_count ?? 0,
      a.stats?.failed_purchases_count ?? 0,
      a.stats?.conversion_rate_percent ?? 0,
      ((a.stats?.total_sales_paise ?? 0) / 100).toFixed(2),
      ((a.stats?.total_discount_paise ?? 0) / 100).toFixed(2),
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `primeprep-sales-agents-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Save Promo Code Handler
  const handleSavePromoCode = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...promoForm,
        discount_percent: Number(promoForm.discount_percent),
        min_purchase_paise: Math.round(Number(promoForm.min_purchase_paise)),
        max_total_uses:
          promoForm.max_total_uses === '' ? null : Number(promoForm.max_total_uses),
        max_uses_per_user: Number(promoForm.max_uses_per_user) || 1,
        valid_until: promoForm.valid_until || null,
      };
      if (editingPromo) {
        await apiRequest(`/api/v1/admin/marketing/promo-codes/${editingPromo.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        notify('success', `Updated promo code "${promoForm.code}".`);
      } else {
        await apiRequest('/api/v1/admin/marketing/promo-codes', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify('success', `Created promo code "${promoForm.code}".`);
      }
      setShowPromoModal(false);
      setEditingPromo(null);
      await loadMarketingData();
    } catch (err: any) {
      notify('error', err.message || 'Could not save promo code');
    }
  };

  // Save Referral Settings Handler
  const handleSaveReferralSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!referralSettings) return;
    try {
      await apiRequest('/api/v1/admin/marketing/referral-settings', {
        method: 'PUT',
        body: JSON.stringify(referralSettings),
      });
      notify('success', 'Referral programme settings updated.');
      await loadMarketingData();
    } catch (err: any) {
      notify('error', err.message || 'Failed to update referral settings');
    }
  };

  const filteredReferrals = referrals.filter((r) => {
    if (referralStatusFilter && r.status !== referralStatusFilter) return false;
    if (referralSearch.trim()) {
      const q = referralSearch.trim().toLowerCase();
      return (
        r.referrer_name?.toLowerCase().includes(q) ||
        r.referrer_email?.toLowerCase().includes(q) ||
        r.referred_name?.toLowerCase().includes(q) ||
        r.referred_email?.toLowerCase().includes(q) ||
        r.referral_code?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Sub-navigation Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-mono font-semibold text-blue-700 uppercase">
            GROWTH, AFFILIATES & STUDENT REFERRALS
          </span>
          <h1 className="text-xl font-bold text-slate-900 font-display mt-0.5">
            Marketing & Referrals Management
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Manage Sales Agent promo codes, Student Refer-a-Friend rewards, campaign discounts, and
            real-time conversion analytics.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl">
          {(
            [
              { id: 'agents', label: 'A. Sales Agents', icon: Users },
              { id: 'referrals', label: 'B. Student Referrals', icon: Gift },
              { id: 'promo_codes', label: 'C. Promo Codes', icon: Tag },
              { id: 'referral_settings', label: 'D. Referral Settings', icon: Settings },
              { id: 'analytics', label: 'E. Marketing Analytics', icon: BarChart3 },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSubTab(t.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  subTab === t.id
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* SUB-TAB A: SALES AGENTS */}
      {subTab === 'agents' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 font-display">
                Sales Agents & Promo Attribution ({agents.length})
              </h2>
              <p className="text-xs text-slate-600">
                Only verified, captured Razorpay payments count as completed agent sales.
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleExportAgentsCsv}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV Report</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingAgent(null);
                  setAgentForm({
                    name: '',
                    email: '',
                    phone: '',
                    promo_code: '',
                    discount_percent: 10,
                    commission_percent: 10,
                    status: 'active',
                    notes: '',
                  });
                  setShowAgentModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Sales Agent</span>
              </button>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Agent Details</th>
                    <th className="py-3 px-4 font-semibold">Promo Code</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Students Used</th>
                    <th className="py-3 px-4 font-semibold text-right">Captured / Pending / Failed</th>
                    <th className="py-3 px-4 font-semibold text-right">Sales Value</th>
                    <th className="py-3 px-4 font-semibold text-right">Total Discount</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {agents.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">
                        No sales agents registered yet. Click "Create Sales Agent" to add your
                        first promotional partner.
                      </td>
                    </tr>
                  ) : (
                    agents.map((ag) => (
                      <tr key={ag.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <p className="font-bold text-slate-900">{ag.name}</p>
                          <p className="text-[11px] text-slate-500 font-mono">
                            {ag.email} {ag.phone ? `· ${ag.phone}` : ''}
                          </p>
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2.5 py-1 bg-blue-50 text-blue-800 border border-blue-200 rounded font-mono font-bold">
                            {ag.promo_code}
                          </span>
                          <span className="ml-1.5 text-[11px] font-mono text-slate-500">
                            ({ag.discount_percent}% OFF)
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <select
                            value={ag.status}
                            onChange={(e) =>
                              handleQuickAgentStatus(ag, e.target.value as any)
                            }
                            className={`px-2 py-1 rounded text-[11px] font-mono font-semibold uppercase border cursor-pointer ${
                              ag.status === 'active'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : ag.status === 'suspended'
                                ? 'bg-red-50 text-red-800 border-red-200'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            <option value="active">ACTIVE</option>
                            <option value="inactive">INACTIVE</option>
                            <option value="suspended">SUSPENDED</option>
                          </select>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                          {ag.stats?.students_used_count ?? 0}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          <span className="font-bold text-emerald-700">
                            {ag.stats?.successful_purchases_count ?? 0}
                          </span>
                          <span className="text-slate-400"> / </span>
                          <span className="text-amber-700">
                            {ag.stats?.pending_purchases_count ?? 0}
                          </span>
                          <span className="text-slate-400"> / </span>
                          <span className="text-red-600">
                            {ag.stats?.failed_purchases_count ?? 0}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700 tabular-nums">
                          {formatPaiseToINR(ag.stats?.total_sales_paise ?? 0)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-700 tabular-nums">
                          {formatPaiseToINR(ag.stats?.total_discount_paise ?? 0)}
                        </td>
                        <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setInspectedAgent(ag)}
                            className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded cursor-pointer"
                          >
                            History
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAgent(ag);
                              setAgentForm({
                                name: ag.name,
                                email: ag.email,
                                phone: ag.phone || '',
                                promo_code: ag.promo_code,
                                discount_percent: ag.discount_percent,
                                commission_percent: ag.commission_percent || 10,
                                status: ag.status,
                                notes: ag.notes || '',
                              });
                              setShowAgentModal(true);
                            }}
                            className="p-1 text-slate-600 hover:text-slate-900 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5 inline" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Agent Sales History Drawer / Modal */}
          {inspectedAgent && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 font-display">
                    Sales & Referral History — {inspectedAgent.name} ({inspectedAgent.promo_code})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Conversion Rate: {inspectedAgent.stats?.conversion_rate_percent ?? 0}% · Total
                    Captured Revenue:{' '}
                    {formatPaiseToINR(inspectedAgent.stats?.total_sales_paise ?? 0)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectedAgent(null)}
                  className="text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3">Student</th>
                      <th className="py-2 px-3">Subject</th>
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 px-3 text-right">Original</th>
                      <th className="py-2 px-3 text-right">Discount</th>
                      <th className="py-2 px-3 text-right">Final Paid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(inspectedAgent.recent_orders || []).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-4 text-center text-slate-500">
                          No orders recorded with code {inspectedAgent.promo_code} yet.
                        </td>
                      </tr>
                    ) : (
                      (inspectedAgent.recent_orders || []).map((ord: any) => (
                        <tr key={ord.id}>
                          <td className="py-2 px-3 font-mono text-slate-500">
                            {new Date(ord.created_at).toLocaleString('en-IN')}
                          </td>
                          <td className="py-2 px-3">
                            <span className="font-medium text-slate-900">{ord.student_name}</span>{' '}
                            <span className="text-slate-400 font-mono">({ord.student_email})</span>
                          </td>
                          <td className="py-2 px-3">{ord.subject_name}</td>
                          <td className="py-2 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                                ord.status === 'paid'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : ord.status === 'failed'
                                  ? 'bg-red-50 text-red-700'
                                  : 'bg-amber-50 text-amber-800'
                              }`}
                            >
                              {ord.status}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums">
                            {formatPaiseToINR(ord.original_amount_paise)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-emerald-700 tabular-nums">
                            -{formatPaiseToINR(ord.discount_amount_paise)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold tabular-nums">
                            {formatPaiseToINR(ord.final_amount_paise)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB B: STUDENT REFERRALS */}
      {subTab === 'referrals' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 font-display">
                Student Referral Attributions ({filteredReferrals.length})
              </h2>
              <p className="text-xs text-slate-600">
                Tracks referring student, referred friend, first-purchase 10% discount, and
                auditable wallet reward status.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={referralSearch}
                  onChange={(e) => setReferralSearch(e.target.value)}
                  placeholder="Search referrer, friend, or code..."
                  className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                />
              </div>
              <select
                value={referralStatusFilter}
                onChange={(e) => setReferralStatusFilter(e.target.value)}
                className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
              >
                <option value="">All Statuses</option>
                <option value="registered">Registered</option>
                <option value="pending_payment">Pending Payment</option>
                <option value="rewarded">Rewarded</option>
                <option value="reversed">Reversed</option>
              </select>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Referring Student</th>
                    <th className="py-3 px-4 font-semibold">Referred Friend</th>
                    <th className="py-3 px-4 font-semibold">Code Used</th>
                    <th className="py-3 px-4 font-semibold">Subject Purchased</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Friend Discount</th>
                    <th className="py-3 px-4 font-semibold text-right">Referrer Wallet Reward</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredReferrals.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        No student referral records match the current filter.
                      </td>
                    </tr>
                  ) : (
                    filteredReferrals.map((r) => (
                      <tr key={r.id}>
                        <td className="py-3 px-4">
                          <p className="font-bold text-slate-900">{r.referrer_name}</p>
                          <p className="text-[11px] text-slate-500 font-mono">{r.referrer_email}</p>
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-900">{r.referred_name}</p>
                          <p className="text-[11px] text-slate-500 font-mono">{r.referred_email}</p>
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-blue-700">
                          {r.referral_code}
                        </td>
                        <td className="py-3 px-4">{r.subject_name || '—'}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold uppercase ${
                              r.status === 'rewarded'
                                ? 'bg-emerald-50 text-emerald-700'
                                : r.status === 'reversed'
                                ? 'bg-red-50 text-red-700'
                                : 'bg-amber-50 text-amber-800'
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          {formatPaiseToINR(r.friend_discount_paise || 0)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700 tabular-nums">
                          {formatPaiseToINR(r.referrer_reward_paise || 0)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Wallet Ledger Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900 font-display">
                Auditable Student Wallet Transactions Ledger ({walletTransactions.length})
              </h3>
            </div>
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2.5 px-4">Timestamp</th>
                    <th className="py-2.5 px-4">Type</th>
                    <th className="py-2.5 px-4">Reference ID</th>
                    <th className="py-2.5 px-4">Description</th>
                    <th className="py-2.5 px-4 text-right">Amount</th>
                    <th className="py-2.5 px-4 text-right">Balance After</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {walletTransactions.map((tx) => (
                    <tr key={tx.id}>
                      <td className="py-2.5 px-4 font-mono text-slate-500">
                        {new Date(tx.created_at).toLocaleString('en-IN')}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-bold uppercase text-slate-800">
                        {tx.transaction_type}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-500">{tx.reference_id}</td>
                      <td className="py-2.5 px-4 text-slate-700">{tx.description}</td>
                      <td
                        className={`py-2.5 px-4 text-right font-mono font-bold tabular-nums ${
                          tx.amount_paise >= 0 ? 'text-emerald-700' : 'text-red-600'
                        }`}
                      >
                        {tx.amount_paise >= 0
                          ? `+${formatPaiseToINR(tx.amount_paise)}`
                          : `-${formatPaiseToINR(Math.abs(tx.amount_paise))}`}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
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

      {/* SUB-TAB C: PROMO CODES */}
      {subTab === 'promo_codes' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 font-display">
                Promo Codes & Campaign Discounts ({promoCodes.length})
              </h2>
              <p className="text-xs text-slate-600">
                Create and manage agent or campaign promo codes, usage limits, expiry dates, and
                subject restrictions.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingPromo(null);
                setPromoForm({
                  code: '',
                  code_type: 'campaign',
                  agent_id: '',
                  discount_percent: 10,
                  min_purchase_paise: 0,
                  max_total_uses: '',
                  max_uses_per_user: 1,
                  valid_from: new Date().toISOString().slice(0, 10),
                  valid_until: '',
                  applicable_subject_ids: [],
                  is_active: true,
                  description: '',
                });
                setShowPromoModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Promo Code</span>
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Promo Code</th>
                    <th className="py-3 px-4 font-semibold">Type / Agent</th>
                    <th className="py-3 px-4 font-semibold">Discount %</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Uses / Max</th>
                    <th className="py-3 px-4 font-semibold text-right">Revenue Generated</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {promoCodes.map((pc) => (
                    <tr key={pc.id}>
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-slate-900">{pc.code}</span>
                        <p className="text-[11px] text-slate-500">{pc.description}</p>
                      </td>
                      <td className="py-3 px-4">
                        <span className="uppercase font-mono text-[11px] font-semibold text-slate-700">
                          {pc.code_type}
                        </span>
                        {pc.agent_name && (
                          <p className="text-[11px] text-blue-700 font-medium">{pc.agent_name}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-emerald-700">
                        {pc.discount_percent}% OFF
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold uppercase ${
                            pc.is_active
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {pc.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {pc.stats?.successful_uses ?? pc.current_uses} /{' '}
                        {pc.max_total_uses ?? '∞'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                        {formatPaiseToINR(pc.stats?.total_sales_paise ?? 0)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPromo(pc);
                            setPromoForm({
                              code: pc.code,
                              code_type: pc.code_type,
                              agent_id: pc.agent_id || '',
                              discount_percent: pc.discount_percent,
                              min_purchase_paise: pc.min_purchase_paise || 0,
                              max_total_uses:
                                pc.max_total_uses === null ? '' : String(pc.max_total_uses),
                              max_uses_per_user: pc.max_uses_per_user || 1,
                              valid_from: pc.valid_from ? pc.valid_from.slice(0, 10) : '',
                              valid_until: pc.valid_until ? pc.valid_until.slice(0, 10) : '',
                              applicable_subject_ids: pc.applicable_subject_ids || [],
                              is_active: pc.is_active,
                              description: pc.description || '',
                            });
                            setShowPromoModal(true);
                          }}
                          className="p-1 text-slate-600 hover:text-slate-900 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5 inline" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB D: REFERRAL SETTINGS */}
      {subTab === 'referral_settings' && referralSettings && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-2xl">
          <h2 className="text-base font-bold text-slate-900 font-display">
            Student Referral Programme Configuration
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            Configure the discount awarded to referred friends and the promotional wallet credit
            earned by referring students after verified payment capture.
          </p>

          <form onSubmit={handleSaveReferralSettings} className="mt-5 space-y-4 text-xs">
            <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-lg">
              <div>
                <p className="font-bold text-slate-900">Enable Student Referral Programme</p>
                <p className="text-slate-500 mt-0.5">
                  Allow students to apply friend referral codes and earn wallet rewards.
                </p>
              </div>
              <input
                type="checkbox"
                checked={referralSettings.is_enabled}
                onChange={(e) =>
                  setReferralSettings({ ...referralSettings, is_enabled: e.target.checked })
                }
                className="w-4 h-4 accent-blue-700 cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Referred Friend Discount (%)
                </label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={referralSettings.friend_discount_percent}
                  onChange={(e) =>
                    setReferralSettings({
                      ...referralSettings,
                      friend_discount_percent: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Referrer Wallet Reward (% of Base Package Price)
                </label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={referralSettings.referrer_reward_percent}
                  onChange={(e) =>
                    setReferralSettings({
                      ...referralSettings,
                      referrer_reward_percent: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Minimum Eligible Purchase Amount (in Paise)
                </label>
                <input
                  type="number"
                  min={0}
                  value={referralSettings.min_purchase_paise}
                  onChange={(e) =>
                    setReferralSettings({
                      ...referralSettings,
                      min_purchase_paise: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Reward Credit Expiry (Days)
                </label>
                <input
                  type="number"
                  min={1}
                  value={referralSettings.reward_expiry_days || 365}
                  onChange={(e) =>
                    setReferralSettings({
                      ...referralSettings,
                      reward_expiry_days: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                className="px-5 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
              >
                Save Referral Configuration
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SUB-TAB E: MARKETING ANALYTICS */}
      {subTab === 'analytics' && analytics && (
        <div className="space-y-6">
          {/* Filter Bar */}
          <form
            onSubmit={handleFilterAnalytics}
            className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 sm:grid-cols-6 gap-3 text-xs items-end"
          >
            <div>
              <label className="block font-semibold text-slate-600 mb-1">Sales Agent</label>
              <select
                value={analyticsFilters.agent_id}
                onChange={(e) =>
                  setAnalyticsFilters({ ...analyticsFilters, agent_id: e.target.value })
                }
                className="w-full px-2.5 py-2 border border-slate-200 rounded-lg"
              >
                <option value="">All Agents</option>
                {agents.map((ag) => (
                  <option key={ag.id} value={ag.id}>
                    {ag.name} ({ag.promo_code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-600 mb-1">Promo Code</label>
              <input
                type="text"
                value={analyticsFilters.promo_code}
                onChange={(e) =>
                  setAnalyticsFilters({
                    ...analyticsFilters,
                    promo_code: e.target.value.toUpperCase(),
                  })
                }
                placeholder="e.g. ADITYA10"
                className="w-full px-2.5 py-2 border border-slate-200 rounded-lg font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-600 mb-1">Subject</label>
              <select
                value={analyticsFilters.subject_id}
                onChange={(e) =>
                  setAnalyticsFilters({ ...analyticsFilters, subject_id: e.target.value })
                }
                className="w-full px-2.5 py-2 border border-slate-200 rounded-lg"
              >
                <option value="">All Subjects</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-600 mb-1">Order Status</label>
              <select
                value={analyticsFilters.status}
                onChange={(e) =>
                  setAnalyticsFilters({ ...analyticsFilters, status: e.target.value })
                }
                className="w-full px-2.5 py-2 border border-slate-200 rounded-lg"
              >
                <option value="">All Statuses</option>
                <option value="paid">Paid / Captured</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-600 mb-1">From Date</label>
              <input
                type="date"
                value={analyticsFilters.date_from}
                onChange={(e) =>
                  setAnalyticsFilters({ ...analyticsFilters, date_from: e.target.value })
                }
                className="w-full px-2.5 py-2 border border-slate-200 rounded-lg"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg cursor-pointer"
              >
                Apply Filters
              </button>
            </div>
          </form>

          {/* 9 Real Database-Backed Marketing Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <span className="text-xs text-slate-500 block">Total Active Sales Agents</span>
              <span className="mt-1 text-2xl font-bold text-slate-900 font-mono tabular-nums block">
                {analytics.metrics?.total_active_sales_agents ?? 0}
              </span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <span className="text-xs text-slate-500 block">Total Promo Code Applications</span>
              <span className="mt-1 text-2xl font-bold text-slate-900 font-mono tabular-nums block">
                {analytics.metrics?.total_promo_code_applications ?? 0}
              </span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <span className="text-xs text-slate-500 block">
                Total Successful Agent Purchases
              </span>
              <span className="mt-1 text-2xl font-bold text-emerald-700 font-mono tabular-nums block">
                {analytics.metrics?.total_successful_agent_purchases ?? 0}
              </span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <span className="text-xs text-slate-500 block">Total Agent-Generated Revenue</span>
              <span className="mt-1 text-2xl font-bold text-emerald-700 font-mono tabular-nums block">
                {formatPaiseToINR(analytics.metrics?.total_agent_generated_revenue_paise ?? 0)}
              </span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <span className="text-xs text-slate-500 block">Total Student Referrals</span>
              <span className="mt-1 text-2xl font-bold text-slate-900 font-mono tabular-nums block">
                {analytics.metrics?.total_student_referrals ?? 0}
              </span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <span className="text-xs text-slate-500 block">
                Total Successful Referral Purchases
              </span>
              <span className="mt-1 text-2xl font-bold text-blue-700 font-mono tabular-nums block">
                {analytics.metrics?.total_successful_referral_purchases ?? 0}
              </span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <span className="text-xs text-slate-500 block">Total Referral Rewards Issued</span>
              <span className="mt-1 text-2xl font-bold text-blue-700 font-mono tabular-nums block">
                {formatPaiseToINR(analytics.metrics?.total_referral_rewards_issued_paise ?? 0)}
              </span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <span className="text-xs text-slate-500 block">Total Discounts Granted</span>
              <span className="mt-1 text-2xl font-bold text-slate-900 font-mono tabular-nums block">
                {formatPaiseToINR(analytics.metrics?.total_discounts_granted_paise ?? 0)}
              </span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <span className="text-xs text-slate-500 block">Referral Conversion Rate</span>
              <span className="mt-1 text-2xl font-bold text-slate-900 font-mono tabular-nums block">
                {analytics.metrics?.referral_conversion_rate_percent ?? 0}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT SALES AGENT MODAL */}
      {showAgentModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900 font-display">
                {editingAgent ? 'Edit Sales Agent' : 'Create Sales Agent Account'}
              </h3>
              <button
                type="button"
                onClick={() => setShowAgentModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAgent} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Agent Name *</label>
                  <input
                    type="text"
                    required
                    value={agentForm.name}
                    onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })}
                    placeholder="e.g. Aditya Kumar"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Unique Promo Code
                  </label>
                  <input
                    type="text"
                    value={agentForm.promo_code}
                    onChange={(e) =>
                      setAgentForm({ ...agentForm, promo_code: e.target.value.toUpperCase() })
                    }
                    placeholder="e.g. ADITYA10 (auto if blank)"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={agentForm.email}
                    onChange={(e) => setAgentForm({ ...agentForm, email: e.target.value })}
                    placeholder="agent@example.com"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={agentForm.phone}
                    onChange={(e) => setAgentForm({ ...agentForm, phone: e.target.value })}
                    placeholder="+91 9876543210"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Student Discount (%)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={agentForm.discount_percent}
                    onChange={(e) =>
                      setAgentForm({ ...agentForm, discount_percent: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Agent Status</label>
                  <select
                    value={agentForm.status}
                    onChange={(e) =>
                      setAgentForm({ ...agentForm, status: e.target.value as any })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={agentForm.notes}
                  onChange={(e) => setAgentForm({ ...agentForm, notes: e.target.value })}
                  placeholder="Optional campus or territory notes"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAgentModal(false)}
                  className="px-4 py-2 font-semibold text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                >
                  {editingAgent ? 'Save Changes' : 'Create Agent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE / EDIT PROMO CODE MODAL */}
      {showPromoModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900 font-display">
                {editingPromo ? 'Edit Promo Code' : 'Create Promo Code'}
              </h3>
              <button
                type="button"
                onClick={() => setShowPromoModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePromoCode} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Promo Code *</label>
                  <input
                    type="text"
                    required
                    value={promoForm.code}
                    onChange={(e) =>
                      setPromoForm({ ...promoForm, code: e.target.value.toUpperCase() })
                    }
                    placeholder="e.g. CUETPG10"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Discount Percentage (%) *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    required
                    value={promoForm.discount_percent}
                    onChange={(e) =>
                      setPromoForm({ ...promoForm, discount_percent: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Max Total Uses (blank = unlimited)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={promoForm.max_total_uses}
                    onChange={(e) =>
                      setPromoForm({ ...promoForm, max_total_uses: e.target.value })
                    }
                    placeholder="Unlimited"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Expiry Date (blank = no expiry)
                  </label>
                  <input
                    type="date"
                    value={promoForm.valid_until}
                    onChange={(e) =>
                      setPromoForm({ ...promoForm, valid_until: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Description</label>
                <input
                  type="text"
                  value={promoForm.description}
                  onChange={(e) => setPromoForm({ ...promoForm, description: e.target.value })}
                  placeholder="Campaign description"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="promo-active-check"
                  checked={promoForm.is_active}
                  onChange={(e) => setPromoForm({ ...promoForm, is_active: e.target.checked })}
                  className="w-4 h-4 accent-blue-700"
                />
                <label htmlFor="promo-active-check" className="font-semibold text-slate-700">
                  Promo Code Active
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPromoModal(false)}
                  className="px-4 py-2 font-semibold text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                >
                  {editingPromo ? 'Save Promo Code' : 'Create Promo Code'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
