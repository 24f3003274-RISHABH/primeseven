import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest, formatPaiseToINR } from '../../api/client.ts';
import { CheckCircle2, ArrowRight, Clock, XCircle } from 'lucide-react';

export const MyPurchasesPage: React.FC = () => {
  const [purchases, setPurchases] = useState<any[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<{ purchases: any[]; payment_history?: any[] }>('/api/v1/purchases/my')
      .then((res) => {
        setPurchases(res.purchases || []);
        setPaymentHistory(res.payment_history || []);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-10">
      <div>
        <p className="text-xs font-medium text-blue-700">ENTITLEMENTS & BILLING LEDGER</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900 font-display">
          My Purchases & Payment History
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Verified subject-series packages, active examination entitlements, and complete Razorpay
          transaction history linked to your candidate account.
        </p>
      </div>

      {/* Section 1: Active Subject Entitlements */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 font-display">
          Subject-Series Entitlements ({purchases.length})
        </h2>
        <div className="mt-3 bg-white border border-slate-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-xs text-slate-500">
              Loading subject entitlements...
            </div>
          ) : purchases.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-semibold text-slate-900">
                No Subject Series Purchased Yet
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Purchase any CUET PG subject test series once to unlock all Sectional, Full-Length,
                and PYQ tests in that subject.
              </p>
              <Link
                to="/subjects"
                className="mt-4 inline-block px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg"
              >
                Explore 7 Subject Packages
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                    <th className="py-3.5 px-4 font-semibold">Subject Package</th>
                    <th className="py-3.5 px-4 font-semibold">Payment ID</th>
                    <th className="py-3.5 px-4 font-semibold">Amount Paid</th>
                    <th className="py-3.5 px-4 font-semibold">Purchased Date</th>
                    <th className="py-3.5 px-4 font-semibold">Entitlement Status</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {purchases.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/80">
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-slate-900">{p.subject_name}</p>
                        <p className="text-xs text-slate-500">{p.package_name}</p>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-600">
                        {p.gateway_payment_id}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 tabular-nums">
                        {formatPaiseToINR(p.amount_paise)}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-600 tabular-nums">
                        {new Date(p.purchased_at).toLocaleDateString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4">
                        {p.entitlement_status === 'active' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Active
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-red-600">Revoked</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Link
                          to={`/subjects/${p.subject_slug}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"
                        >
                          <span>Open Tests</span>
                          <ArrowRight className="w-3.5 h-3.5" />
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

      {/* Section 2: Payment Transaction History (Captured, Pending, Failed) */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 font-display">
          Payment Transaction History ({paymentHistory.length})
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          Complete audit log of Razorpay orders and payment verification states (`captured`,
          `pending`, `failed`).
        </p>

        <div className="mt-3 bg-white border border-slate-200 rounded-xl overflow-hidden">
          {paymentHistory.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No payment transactions recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                    <th className="py-3 px-4 font-semibold">Subject</th>
                    <th className="py-3 px-4 font-semibold">Gateway Order ID</th>
                    <th className="py-3 px-4 font-semibold">Gateway Payment ID</th>
                    <th className="py-3 px-4 font-semibold text-right">Amount</th>
                    <th className="py-3 px-4 font-semibold">Payment Status</th>
                    <th className="py-3 px-4 font-semibold">Verification</th>
                    <th className="py-3 px-4 font-semibold">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {paymentHistory.map((txn) => (
                    <tr key={txn.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {txn.subject_name || 'Subject Package'}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {txn.gateway_order_id}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {txn.gateway_payment_id}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                        {formatPaiseToINR(txn.amount_paise)}
                      </td>
                      <td className="py-3 px-4">
                        {txn.payment_status === 'captured' ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Captured
                          </span>
                        ) : txn.payment_status === 'pending' ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                            <Clock className="w-3.5 h-3.5" />
                            Pending
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-semibold text-red-700">
                            <XCircle className="w-3.5 h-3.5" />
                            Failed
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono uppercase">
                        {txn.verification_status}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500 tabular-nums">
                        {new Date(txn.created_at).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
