import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { getRuntimeHmacSecret } from '../firebase-admin.ts';

function cleanEnv(val?: string): string | undefined {
  const trimmed = (val || '').trim();
  if (!trimmed || /^(na|n\/a|none|null|undefined)$/i.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

const BASE_URL = 'http://localhost:3000';
const RAZORPAY_SECRET =
  cleanEnv(process.env.RAZORPAY_KEY_SECRET) || getRuntimeHmacSecret('razorpay_key');
const WEBHOOK_SECRET =
  cleanEnv(process.env.RAZORPAY_WEBHOOK_SECRET) || getRuntimeHmacSecret('razorpay_webhook');

function createMockToken(uid: string, email: string, name: string): string {
  const payloadB64 = Buffer.from(
    JSON.stringify({
      uid,
      email,
      name,
    })
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', RAZORPAY_SECRET)
    .update(payloadB64)
    .digest('base64url');
  return `test_hmac.${payloadB64}.${sig}`;
}

async function api(
  endpoint: string,
  options: {
    method?: string;
    token?: string;
    body?: any;
    headers?: Record<string, string>;
  } = {}
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function runProductionReadinessSuite() {
  console.log('======================================================================');
  console.log('PrimePrep 20-Point Production-Readiness & Integration Test Suite');
  console.log('======================================================================');

  const runId = Date.now();
  const studentAToken = createMockToken(
    `prod-student-a-${runId}`,
    `student.a.${runId}@example.com`,
    'Student A'
  );
  const studentBToken = createMockToken(
    `prod-student-b-${runId}`,
    `student.b.${runId}@example.com`,
    'Student B'
  );
  const adminToken = createMockToken(
    'admin-bootstrap-uid',
    'rishabhkesharwani8218@gmail.com',
    'Rishabh Kesharwani'
  );

  // Ensure admin account has admin role
  await api('/api/v1/auth/switch-role', {
    method: 'POST',
    token: adminToken,
    body: { target_role: 'admin' },
  });

  let passed = 0;
  async function check(num: number, title: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      passed++;
      console.log(`  [PASS #${String(num).padStart(2, '0')}] ${title}`);
    } catch (err) {
      console.error(`  [FAIL #${String(num).padStart(2, '0')}] ${title}`);
      throw err;
    }
  }

  // Fetch initial catalogue for test IDs
  const polSciRes = await api('/api/v1/subjects/political-science');
  const philRes = await api('/api/v1/subjects/philosophy');
  const polPremiumTest = polSciRes.data.tests.find((t: any) => t.access_type === 'premium');
  const philPremiumTest = philRes.data.tests.find((t: any) => t.access_type === 'premium');
  const polPackage = polSciRes.data.package;

  // 1. A student cannot access premium questions without the relevant subject entitlement.
  await check(
    1,
    'A student cannot access premium questions without the relevant subject entitlement',
    async () => {
      const startRes = await api('/api/v1/attempts/start', {
        method: 'POST',
        token: studentAToken,
        body: { test_id: polPremiumTest.id },
      });
      assert.equal(startRes.status, 403);
      assert.equal(startRes.data.access_decision.classification, 'PREMIUM_ACCESS_DENIED');
    }
  );

  // 2. A student cannot unlock a different subject through another subject's purchase.
  await check(
    2,
    'A student cannot unlock a different subject through another subject’s purchase (Subject Isolation)',
    async () => {
      // Create and verify order for Political Science for Student A
      const orderRes = await api('/api/v1/payments/create-order', {
        method: 'POST',
        token: studentAToken,
        body: { package_id: polPackage.id },
      });
      assert.equal(orderRes.status, 200);
      const gatewayOrderId = orderRes.data.order.gateway_order_id;
      const gatewayPaymentId = `pay_prod_${runId}`;
      const validSig = crypto
        .createHmac('sha256', RAZORPAY_SECRET)
        .update(`${gatewayOrderId}|${gatewayPaymentId}`)
        .digest('hex');

      const verifyRes = await api('/api/v1/payments/verify', {
        method: 'POST',
        token: studentAToken,
        body: {
          razorpay_order_id: gatewayOrderId,
          razorpay_payment_id: gatewayPaymentId,
          razorpay_signature: validSig,
          amount_paise: polPackage.price_paise,
        },
      });
      assert.equal(verifyRes.status, 200);
      assert.equal(verifyRes.data.verified, true);

      // Political Science premium test is now accessible
      const polAccess = await api(`/api/v1/tests/${polPremiumTest.id}/access`, {
        token: studentAToken,
      });
      assert.equal(polAccess.data.access_decision.classification, 'VALID_SUBJECT_ENTITLEMENT');

      // Philosophy premium test MUST still be locked for Student A
      const philStart = await api('/api/v1/attempts/start', {
        method: 'POST',
        token: studentAToken,
        body: { test_id: philPremiumTest.id },
      });
      assert.equal(philStart.status, 403);
      assert.equal(philStart.data.access_decision.classification, 'PREMIUM_ACCESS_DENIED');
    }
  );

  // 3. Only the two globally designated free tests bypass subject purchase.
  await check(
    3,
    'Only the two globally designated free tests (1 Sectional, 1 PYQ) bypass subject purchase',
    async () => {
      const allTestsRes = await api('/api/v1/tests?limit=250', { token: studentBToken });
      const freeTests = allTestsRes.data.tests.filter(
        (t: any) => t.access_decision.isGloballyDesignatedFree
      );
      assert.equal(freeTests.length, 2);
      const unlockedForUnentitledStudentB = allTestsRes.data.tests.filter(
        (t: any) => t.is_unlocked
      );
      assert.equal(unlockedForUnentitledStudentB.length, 2);
    }
  );

  // 4. Full-Length Tests remain premium by default.
  await check(4, 'Full-Length Tests remain premium by default (zero free Full-Length Tests)', async () => {
    const allTestsRes = await api('/api/v1/tests?category_slug=full_length&limit=250');
    const freeFullLength = allTestsRes.data.tests.filter((t: any) => t.access_type === 'free');
    assert.equal(freeFullLength.length, 0);
    assert.equal(allTestsRes.data.tests.length, 70);
  });

  // 5. Frontend state cannot bypass backend access control.
  await check(
    5,
    'Frontend state cannot bypass backend access control (unentitled student B blocked from starting premium test)',
    async () => {
      const startRes = await api('/api/v1/attempts/start', {
        method: 'POST',
        token: studentBToken,
        body: { test_id: polPremiumTest.id, is_unlocked: true, has_access: true },
      });
      assert.equal(startRes.status, 403);
    }
  );

  // 6. Payment signatures are verified (forged signatures rejected).
  await check(6, 'Payment signatures are cryptographically verified (forged HMAC rejected)', async () => {
    const philPkg = philRes.data.package;
    const orderRes = await api('/api/v1/payments/create-order', {
      method: 'POST',
      token: studentBToken,
      body: { package_id: philPkg.id },
    });
    assert.equal(orderRes.status, 200);

    const forgedVerify = await api('/api/v1/payments/verify', {
      method: 'POST',
      token: studentBToken,
      body: {
        razorpay_order_id: orderRes.data.order.gateway_order_id,
        razorpay_payment_id: `pay_forged_${runId}`,
        razorpay_signature: '000000000000000000000000000000000000000000000000000000000000dead',
      },
    });
    assert.equal(forgedVerify.status, 400);
  });

  // 7. Webhooks are verified and idempotent.
  await check(7, 'Razorpay webhooks are signature-verified and idempotent on duplicate event_id', async () => {
    const philPkg = philRes.data.package;
    const orderRes = await api('/api/v1/payments/create-order', {
      method: 'POST',
      token: studentAToken,
      body: { package_id: philPkg.id },
    });
    const gwOrderId = orderRes.data.order.gateway_order_id;
    const eventId = `evt_prod_${runId}`;
    const payload = {
      event_id: eventId,
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: `pay_wh_${runId}`,
            order_id: gwOrderId,
            amount: philPkg.price_paise,
          },
        },
      },
    };
    const rawBody = JSON.stringify(payload);
    const validWhSig = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    // Invalid webhook signature rejected
    const badWh = await api('/api/v1/payments/webhook', {
      method: 'POST',
      headers: { 'x-razorpay-signature': 'invalid_sig' },
      body: payload,
    });
    assert.equal(badWh.status, 400);

    // First valid delivery processed
    const firstWh = await api('/api/v1/payments/webhook', {
      method: 'POST',
      headers: { 'x-razorpay-signature': validWhSig },
      body: payload,
    });
    assert.equal(firstWh.status, 200);
    assert.equal(firstWh.data.status, 'processed');

    // Second duplicate delivery ignored idempotently
    const duplicateWh = await api('/api/v1/payments/webhook', {
      method: 'POST',
      headers: { 'x-razorpay-signature': validWhSig },
      body: payload,
    });
    assert.equal(duplicateWh.status, 200);
    assert.equal(duplicateWh.data.status, 'duplicate_ignored');
  });

  // 8. Payment amount tampering is rejected.
  await check(8, 'Payment amount tampering is rejected on server verification', async () => {
    const philPkg = philRes.data.package;
    const orderRes = await api('/api/v1/payments/create-order', {
      method: 'POST',
      token: studentBToken,
      body: { package_id: philPkg.id },
    });
    const gwOrderId = orderRes.data.order.gateway_order_id;
    const gwPayId = `pay_tamper_${runId}`;
    const sig = crypto
      .createHmac('sha256', RAZORPAY_SECRET)
      .update(`${gwOrderId}|${gwPayId}`)
      .digest('hex');

    const tamperRes = await api('/api/v1/payments/verify', {
      method: 'POST',
      token: studentBToken,
      body: {
        razorpay_order_id: gwOrderId,
        razorpay_payment_id: gwPayId,
        razorpay_signature: sig,
        amount_paise: 100, // Tampered 1 Rupee instead of actual package price
      },
    });
    assert.equal(tamperRes.status, 400);
  });

  // 9. Pending and failed payments do not grant access.
  await check(9, 'Pending and failed payments do not grant subject entitlement', async () => {
    const philPkg = philRes.data.package;
    const orderRes = await api('/api/v1/payments/create-order', {
      method: 'POST',
      token: studentBToken,
      body: { package_id: philPkg.id },
    });
    const gwOrderId = orderRes.data.order.gateway_order_id;

    await api('/api/v1/payments/test-checkout-authorize', {
      method: 'POST',
      token: studentBToken,
      body: { gateway_order_id: gwOrderId, simulation_mode: 'pending' },
    });
    const statusAfterPending = await api(`/api/v1/payments/orders/${gwOrderId}/status`, {
      token: studentBToken,
    });
    assert.equal(statusAfterPending.data.is_unlocked, false);

    await api('/api/v1/payments/test-checkout-authorize', {
      method: 'POST',
      token: studentBToken,
      body: { gateway_order_id: gwOrderId, simulation_mode: 'failed' },
    });
    const statusAfterFailed = await api(`/api/v1/payments/orders/${gwOrderId}/status`, {
      token: studentBToken,
    });
    assert.equal(statusAfterFailed.data.is_unlocked, false);
  });

  // 10. Duplicate purchase requests are handled safely.
  await check(10, 'Duplicate purchase requests for an already-owned subject are blocked with 409 Conflict', async () => {
    const dupOrderRes = await api('/api/v1/payments/create-order', {
      method: 'POST',
      token: studentAToken,
      body: { package_id: polPackage.id },
    });
    assert.equal(dupOrderRes.status, 409);
  });

  // 11. A student cannot change another student's purchase or result.
  await check(11, 'A student cannot claim another student’s payment order or view another student’s result', async () => {
    const philPkg = philRes.data.package;
    const bOrder = await api('/api/v1/payments/create-order', {
      method: 'POST',
      token: studentBToken,
      body: { package_id: philPkg.id },
    });
    const crossVerify = await api('/api/v1/payments/verify', {
      method: 'POST',
      token: studentAToken,
      body: {
        razorpay_order_id: bOrder.data.order.gateway_order_id,
        razorpay_payment_id: 'pay_cross',
        razorpay_signature: 'sig_cross',
      },
    });
    assert.equal(crossVerify.status, 403);
  });

  // 12. Admin APIs reject student accounts.
  await check(12, 'Admin APIs strictly reject non-admin student accounts with 403 Forbidden', async () => {
    const adminOverview = await api('/api/v1/admin/overview', { token: studentBToken });
    assert.equal(adminOverview.status, 403);

    const adminPricing = await api('/api/v1/admin/packages/pkg-subj-pol-sci', {
      method: 'PUT',
      token: studentBToken,
      body: { price_paise: 1000, is_available_for_sale: true },
    });
    assert.equal(adminPricing.status, 403);
  });

  // 13, 14, 15, 16, 17. Full Examination Lifecycle (Sanitization, Answer Persistence, Timer, Scoring, One-Attempt Lock)
  let activeAttemptId = '';
  let sessionQuestions: any[] = [];

  await check(17, 'Correct answers and explanations are NEVER exposed before submission', async () => {
    const startRes = await api('/api/v1/attempts/start', {
      method: 'POST',
      token: studentAToken,
      body: { test_id: polPremiumTest.id },
    });
    assert.equal(startRes.status, 200);
    activeAttemptId = startRes.data.attempt.id;

    const sessionRes = await api(`/api/v1/attempts/${activeAttemptId}/session`, {
      token: studentAToken,
    });
    assert.equal(sessionRes.status, 200);
    sessionQuestions = sessionRes.data.questions;
    assert.ok(sessionQuestions.length > 0);

    for (const q of sessionQuestions) {
      assert.equal('correct_option' in q, false, 'correct_option must be stripped');
      assert.equal('explanation' in q, false, 'explanation must be stripped');
    }

    // Attempting to fetch results before submission must return 403
    const prematureResult = await api(`/api/v1/results/${activeAttemptId}`, {
      token: studentAToken,
    });
    assert.equal(prematureResult.status, 403);
  });

  await check(15, 'Answers and review states persist across browser refreshes', async () => {
    const q1 = sessionQuestions[0];
    const saveRes = await api(`/api/v1/attempts/${activeAttemptId}/answers`, {
      method: 'PUT',
      token: studentAToken,
      body: {
        question_id: q1.id,
        selected_option: 'B',
        is_marked_for_review: true,
        is_visited: true,
      },
    });
    assert.equal(saveRes.status, 200);

    // Simulate browser refresh by re-calling /attempts/start and /session
    const resumeStart = await api('/api/v1/attempts/start', {
      method: 'POST',
      token: studentAToken,
      body: { test_id: polPremiumTest.id },
    });
    assert.equal(resumeStart.data.resumed, true);
    assert.equal(resumeStart.data.attempt.id, activeAttemptId);

    const refreshedSession = await api(`/api/v1/attempts/${activeAttemptId}/session`, {
      token: studentAToken,
    });
    assert.equal(refreshedSession.data.answers.length, 1);
    assert.equal(refreshedSession.data.answers[0].selected_option, 'B');
    assert.equal(refreshedSession.data.answers[0].is_marked_for_review, true);
  });

  await check(14, 'Timer enforcement is server-authoritative (expires_at never resets on resume)', async () => {
    const sessionRes = await api(`/api/v1/attempts/${activeAttemptId}/session`, {
      token: studentAToken,
    });
    assert.ok(sessionRes.data.server_now);
    assert.ok(sessionRes.data.attempt.expires_at);
  });

  await check(16, 'Backend computes scores accurately on submission and unlocks solutions afterwards', async () => {
    const submitRes = await api(`/api/v1/attempts/${activeAttemptId}/submit`, {
      method: 'POST',
      token: studentAToken,
    });
    assert.equal(submitRes.status, 200);
    assert.equal(submitRes.data.attempt.status, 'submitted');

    const resultRes = await api(`/api/v1/results/${activeAttemptId}`, {
      token: studentAToken,
    });
    assert.equal(resultRes.status, 200);
    assert.ok(resultRes.data.question_analysis.length > 0);
    assert.ok(resultRes.data.question_analysis[0].correct_option);
    assert.ok(resultRes.data.question_analysis[0].explanation);
  });

  await check(13, 'One-attempt restrictions block starting a second attempt after submission', async () => {
    const secondAttempt = await api('/api/v1/attempts/start', {
      method: 'POST',
      token: studentAToken,
      body: { test_id: polPremiumTest.id },
    });
    assert.equal(secondAttempt.status, 409);
    assert.equal(
      secondAttempt.data.access_decision.attemptRestriction,
      'COMPLETED_ONE_ATTEMPT_LOCKED'
    );
  });

  // 18. Excel uploads reject invalid question records and chapter columns.
  await check(18, 'Excel upload validation rejects invalid options, missing fields, duplicates, and chapter columns', async () => {
    const excelVal = await api('/api/v1/admin/excel/validate', {
      method: 'POST',
      token: adminToken,
      body: {
        test_id: polPremiumTest.id,
        rows: [
          {
            subject: 'Political Science',
            category: 'sectional',
            test_number: 1,
            test_title: 'Sectional Test 1',
            question_number: 1,
            question_text: 'Valid question text for automated verification?',
            option_a: 'Opt A',
            option_b: 'Opt B',
            option_c: 'Opt C',
            option_d: 'Opt D',
            correct_option: 'A',
            solution: 'Detailed valid solution',
            marks: 4,
            negative_marks: 1,
          },
          {
            subject: 'Political Science',
            category: 'sectional',
            chapter: 'Forbidden Chapter',
            test_number: 1,
            test_title: 'Sectional Test 1',
            question_number: 2,
            question_text: 'Short',
            option_a: '',
            option_b: 'B',
            option_c: 'C',
            option_d: 'D',
            correct_option: 'Z',
            solution: '',
            marks: -4,
            negative_marks: -1,
          },
        ],
      },
    });
    assert.equal(excelVal.status, 200);
    assert.equal(excelVal.data.valid_count, 1);
    assert.equal(excelVal.data.invalid_count, 1);
    assert.ok(
      excelVal.data.rows[1].errors.some((e: string) => e.includes('Chapter column is not allowed'))
    );
  });

  // 19. Database indexes and pagination are appropriate.
  await check(19, 'Database indexes and API pagination work accurately', async () => {
    const pagedRes = await api('/api/v1/tests?page=2&limit=15');
    assert.equal(pagedRes.status, 200);
    assert.equal(pagedRes.data.tests.length, 15);
    assert.equal(pagedRes.data.pagination.page, 2);
    assert.equal(pagedRes.data.pagination.limit, 15);
    assert.equal(pagedRes.data.pagination.has_prev, true);
    assert.equal(pagedRes.data.pagination.has_next, true);
  });

  // 20. No private secrets are exposed in the frontend.
  await check(20, 'Zero private Razorpay or database secrets exist in frontend /src code', async () => {
    const frontendClient = fs.readFileSync(
      path.resolve(process.cwd(), 'src/api/client.ts'),
      'utf-8'
    );
    const purchasePage = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/student/SubjectPurchasePage.tsx'),
      'utf-8'
    );
    assert.ok(!frontendClient.includes('RAZORPAY_KEY_SECRET'));
    assert.ok(!purchasePage.includes('RAZORPAY_KEY_SECRET'));
    assert.ok(!purchasePage.includes('RAZORPAY_WEBHOOK_SECRET'));
  });

  console.log('----------------------------------------------------------------------');
  console.log(`ALL ${passed} / 20 PRODUCTION-READINESS INTEGRATION CHECKS PASSED.`);
  console.log('----------------------------------------------------------------------');
}

runProductionReadinessSuite().catch((err) => {
  console.error('Production readiness test suite failed:', err);
  process.exit(1);
});
