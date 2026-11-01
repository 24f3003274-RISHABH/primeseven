import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { apiRequest, formatPaiseToINR } from '../../api/client.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Lock,
  ShieldCheck,
  AlertTriangle,
  Clock,
  X,
} from 'lucide-react';

export const SubjectPurchasePage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo');
  const highlightTest = searchParams.get('highlightTest');

  const { profile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Checkout Modal State
  const [checkoutOrder, setCheckoutOrder] = useState<any>(null);
  const [processingOrder, setProcessingOrder] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<{
    type: 'success' | 'pending' | 'error';
    text: string;
    orderId?: string;
  } | null>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    apiRequest(`/api/v1/packages/${slug}`)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => setError(err.message || 'Failed to load package details'))
      .finally(() => setLoading(false));
  }, [slug, profile]);

  const handleInitiateOrder = async () => {
    if (!profile) {
      const currentPath = `/subjects/${slug}/purchase${
        returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''
      }`;
      navigate(`/login?redirect=${encodeURIComponent(currentPath)}`);
      return;
    }

    if (!data?.package?.id) return;
    setProcessingOrder(true);
    setPaymentMessage(null);

    try {
      const orderRes = await apiRequest('/api/v1/payments/create-order', {
        method: 'POST',
        body: JSON.stringify({ package_id: data.package.id }),
      });
      setCheckoutOrder(orderRes);
    } catch (err: any) {
      setPaymentMessage({
        type: 'error',
        text: err.message || 'Could not initiate Razorpay order.',
      });
    } finally {
      setProcessingOrder(false);
    }
  };

  const handleCompleteTestCheckout = async (
    simulationMode: 'success' | 'pending' | 'failed' | 'tampered_signature'
  ) => {
    if (!checkoutOrder?.order?.gateway_order_id) return;
    setProcessingOrder(true);

    try {
      const authRes = await apiRequest('/api/v1/payments/test-checkout-authorize', {
        method: 'POST',
        body: JSON.stringify({
          gateway_order_id: checkoutOrder.order.gateway_order_id,
          simulation_mode: simulationMode,
        }),
      });

      if (simulationMode === 'pending') {
        setCheckoutOrder(null);
        setPaymentMessage({
          type: 'pending',
          text: authRes.message,
          orderId: checkoutOrder.order.id,
        });
        return;
      }

      if (simulationMode === 'failed') {
        setCheckoutOrder(null);
        setPaymentMessage({
          type: 'error',
          text: authRes.message,
        });
        return;
      }

      // Verify signature on backend (/api/v1/payments/verify)
      const verifyRes = await apiRequest('/api/v1/payments/verify', {
        method: 'POST',
        body: JSON.stringify({
          razorpay_order_id: authRes.razorpay_order_id,
          razorpay_payment_id: authRes.razorpay_payment_id,
          razorpay_signature: authRes.razorpay_signature,
          amount_paise: checkoutOrder.order.expected_amount_paise,
        }),
      });

      if (verifyRes.verified) {
        setCheckoutOrder(null);
        await refreshProfile();
        // Reload package status
        const updatedPkg = await apiRequest(`/api/v1/packages/${slug}`);
        setData(updatedPkg);
        setPaymentMessage({
          type: 'success',
          text: `Payment verified! The complete ${data.subject.name} Test Series is now unlocked.`,
        });

        if (returnTo && returnTo.startsWith('/')) {
          setTimeout(() => {
            navigate(returnTo);
          }, 1200);
        }
      }
    } catch (err: any) {
      setCheckoutOrder(null);
      setPaymentMessage({
        type: 'error',
        text: err.message || 'Payment verification failed on server.',
      });
    } finally {
      setProcessingOrder(false);
    }
  };

  const handleCheckOrderStatus = async (orderId: string) => {
    try {
      const statusRes = await apiRequest(`/api/v1/payments/orders/${orderId}/status`);
      if (statusRes.is_unlocked) {
        await refreshProfile();
        setPaymentMessage({
          type: 'success',
          text: 'Order confirmed! Subject Test Series is unlocked.',
        });
      } else {
        setPaymentMessage({
          type: 'pending',
          text: `Order ${statusRes.order.gateway_order_id} is still in "${statusRes.order.status}" state. Entitlement is granted only after payment capture.`,
          orderId,
        });
      }
    } catch (err: any) {
      setPaymentMessage({
        type: 'error',
        text: err.message || 'Could not check order status.',
      });
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="h-96 bg-white border border-slate-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error || !data?.subject || !data?.package) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-16 text-center">
        <h1 className="text-xl font-bold text-slate-900">Package Unavailable</h1>
        <p className="mt-2 text-sm text-slate-600">{error}</p>
        <Link
          to="/subjects"
          className="mt-4 inline-block px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg"
        >
          Back to Subject Catalogue
        </Link>
      </div>
    );
  }

  const { subject, package: pkg, is_purchased, total_tests, category_counts } = data;

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Link
          to={`/subjects/${subject.slug}`}
          className="inline-flex items-center gap-1 hover:text-slate-900"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to {subject.name}</span>
        </Link>
        <span>/</span>
        <span className="text-slate-900 font-medium">Complete Subject Series Package</span>
      </div>

      {highlightTest && !is_purchased && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-3">
          <Lock className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-800">
            <span className="font-semibold">You selected "{highlightTest}".</span> This is a
            premium test in {subject.name}. Unlock the complete {subject.name} Test Series below
            to attempt this test and all other premium tests in {subject.name}.
          </div>
        </div>
      )}

      {paymentMessage && (
        <div
          className={`mt-4 p-4 rounded-xl border flex items-start justify-between gap-4 ${
            paymentMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : paymentMessage.type === 'pending'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <div className="flex items-start gap-3 text-xs">
            {paymentMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            ) : paymentMessage.type === 'pending' ? (
              <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-semibold">{paymentMessage.text}</p>
              {paymentMessage.orderId && (
                <button
                  onClick={() => handleCheckOrderStatus(paymentMessage.orderId!)}
                  className="mt-2 underline font-semibold cursor-pointer"
                >
                  Check Order Confirmation Status
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Package Specification */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
            <span className="font-semibold text-blue-700">{subject.paper_code}</span>
            <span>·</span>
            <span>SUBJECT-WISE COMPLETE ENTITLEMENT</span>
          </div>

          <h1 className="mt-2 text-2xl sm:text-3xl font-bold text-slate-900 font-display">
            {subject.name} — Complete Test Series
          </h1>

          <p className="mt-4 text-sm text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-lg border border-slate-200">
            Purchase the complete {subject.name} Test Series once and unlock all eligible premium
            tests included in this subject package. You do not need to pay separately for each
            test.
          </p>

          <h2 className="mt-6 text-sm font-bold text-slate-900">
            Included Examination Categories ({total_tests} Total Published Tests)
          </h2>

          <div className="mt-3 divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  All Eligible Premium Sectional Tests
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  30-minute topic & unit assessments across the {subject.name} syllabus
                </p>
              </div>
              <span className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                {category_counts.sectional} Tests
              </span>
            </div>

            <div className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  All Eligible Premium Full-Length Tests
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  90-minute complete syllabus mock examinations (+4 / -1 NTA pattern)
                </p>
              </div>
              <span className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                {category_counts.full_length} Tests
              </span>
            </div>

            <div className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  All Eligible Premium PYQ Tests
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Past CUET PG official question papers with detailed step-by-step solutions
                </p>
              </div>
              <span className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                {category_counts.pyq} Tests
              </span>
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-slate-200 text-xs text-slate-600 space-y-2">
            <p>
              <strong className="text-slate-900">Free Diagnostic Tests Note:</strong> The two
              globally designated free tests (one Sectional Test and one PYQ Test across the
              platform) remain available without purchasing any subject series.
            </p>
            <p>
              <strong className="text-slate-900">Subject Isolation Policy:</strong> This package
              unlocks {subject.name} ({subject.paper_code}) exclusively. Other postgraduate
              subjects require their respective subject-series packages.
            </p>
          </div>
        </div>

        {/* Right Checkout Summary Card */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
          <div className="flex items-center justify-between pb-4 border-b border-slate-200">
            <span className="text-xs font-semibold text-slate-500 uppercase">Package Status</span>
            {is_purchased ? (
              <span className="text-xs font-semibold text-emerald-700 inline-flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                Subject Series Unlocked
              </span>
            ) : (
              <span className="text-xs font-semibold text-slate-700">Not Yet Purchased</span>
            )}
          </div>

          <div className="mt-5">
            <p className="text-xs text-slate-500">Complete Subject Package Price</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-4xl font-extrabold text-slate-900 font-mono tabular-nums">
                {formatPaiseToINR(pkg.price_paise)}
              </span>
              <span className="text-xs text-slate-500 font-mono">
                ({pkg.price_paise} paise · INR)
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-600">
              One-time payment for the complete {subject.name} series ({total_tests} tests).
            </p>
          </div>

          {/* Part 7.3: Already Purchased State */}
          {is_purchased ? (
            <div className="mt-6 space-y-3">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900">
                You already own the <strong>{subject.name} Test Series</strong>. Duplicate
                purchases are automatically prevented.
              </div>
              <Link
                to={returnTo || `/subjects/${subject.slug}`}
                className="block w-full py-3 px-4 text-center text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
              >
                {returnTo ? 'Continue to Selected Test' : `Explore ${subject.name} Tests`}
              </Link>
            </div>
          ) : (
            <div className="mt-6">
              <button
                onClick={handleInitiateOrder}
                disabled={processingOrder || !pkg.is_available_for_sale}
                className="w-full py-3.5 px-5 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <CreditCard className="w-4 h-4" />
                <span>
                  {processingOrder
                    ? 'Creating Razorpay Order...'
                    : `Purchase ${subject.name} Test Series`}
                </span>
              </button>

              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500">
                <ShieldCheck className="w-4 h-4 text-emerald-700" />
                <span>Razorpay Test Mode · Server-Side HMAC Verification</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Razorpay Test Mode Checkout Modal */}
      {checkoutOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full overflow-hidden shadow-xl">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-mono text-blue-300">RAZORPAY CHECKOUT (TEST MODE)</p>
                <h3 className="text-base font-bold font-display">
                  {checkoutOrder.razorpay_config.subject_name} Test Series
                </h3>
              </div>
              <button
                onClick={() => setCheckoutOrder(null)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Gateway Order ID</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {checkoutOrder.razorpay_config.gateway_order_id}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Candidate</span>
                  <span className="font-medium text-slate-900">
                    {checkoutOrder.razorpay_config.student_email}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200">
                  <span className="text-slate-700 font-semibold">Payable Amount</span>
                  <span className="font-mono text-base font-bold text-slate-900 tabular-nums">
                    {formatPaiseToINR(checkoutOrder.razorpay_config.amount_paise)}
                  </span>
                </div>
              </div>

              <p className="mt-4 text-xs text-slate-600 leading-relaxed">
                Select a Razorpay Test Mode outcome below. The backend will verify the HMAC-SHA256
                signature and grant access strictly for verified captured payments.
              </p>

              <div className="mt-5 space-y-2.5">
                <button
                  onClick={() => handleCompleteTestCheckout('success')}
                  disabled={processingOrder}
                  className="w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-between cursor-pointer"
                >
                  <span>Complete Verified Payment (Success)</span>
                  <span className="font-mono">
                    {formatPaiseToINR(checkoutOrder.razorpay_config.amount_paise)}
                  </span>
                </button>

                <button
                  onClick={() => handleCompleteTestCheckout('pending')}
                  disabled={processingOrder}
                  className="w-full py-2.5 px-4 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-semibold rounded-lg transition-colors text-left cursor-pointer"
                >
                  Simulate Pending Bank Confirmation (No Premature Access)
                </button>

                <button
                  onClick={() => handleCompleteTestCheckout('failed')}
                  disabled={processingOrder}
                  className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-semibold rounded-lg transition-colors text-left cursor-pointer"
                >
                  Simulate Gateway Payment Failure (Subject Remains Locked)
                </button>

                <button
                  onClick={() => handleCompleteTestCheckout('tampered_signature')}
                  disabled={processingOrder}
                  className="w-full py-2.5 px-4 bg-red-50 hover:bg-red-100 text-red-900 border border-red-200 text-xs font-semibold rounded-lg transition-colors text-left cursor-pointer"
                >
                  Simulate Forged / Invalid Signature (Rejected by Server)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
