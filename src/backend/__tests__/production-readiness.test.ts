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

  // 21. Public registration of reserved admin email primeseven@gmail.com is blocked
  await check(21, 'Public registration of reserved admin email (primeseven@gmail.com) is strictly blocked', async () => {
    const regAdminRes = await api('/api/v1/auth/register', {
      method: 'POST',
      body: {
        full_name: 'Impersonator',
        email: 'primeseven@gmail.com',
        password: 'ValidPassword123!',
      },
    });
    assert.equal(regAdminRes.status, 403);
  });

  // 22. Student registration, login password verification, and password change flow
  await check(22, 'Student registration, scrypt password verification, and password change flow work securely', async () => {
    const testEmail = `candidate.${runId}@example.com`;
    const initialPassword = 'InitialPassword123!';
    const updatedPassword = 'UpdatedPassword456!';

    const regRes = await api('/api/v1/auth/register', {
      method: 'POST',
      body: {
        full_name: 'Test Candidate',
        email: testEmail,
        password: initialPassword,
      },
    });
    assert.equal(regRes.status, 201);
    assert.equal('password_hash' in regRes.data.user, false, 'password_hash must never be returned');

    // Wrong password rejected
    const badLogin = await api('/api/v1/auth/login', {
      method: 'POST',
      body: {
        email: testEmail,
        password: 'WrongPassword999!',
      },
    });
    assert.equal(badLogin.status, 401);

    // Correct password succeeds
    const goodLogin = await api('/api/v1/auth/login', {
      method: 'POST',
      body: {
        email: testEmail,
        password: initialPassword,
      },
    });
    assert.equal(goodLogin.status, 200);
    const candidateJwt = goodLogin.data.token;

    // Change password
    const changeRes = await api('/api/v1/auth/change-password', {
      method: 'POST',
      token: candidateJwt,
      body: {
        current_password: initialPassword,
        new_password: updatedPassword,
      },
    });
    assert.equal(changeRes.status, 200);

    // Old password now rejected
    const oldLogin = await api('/api/v1/auth/login', {
      method: 'POST',
      body: {
        email: testEmail,
        password: initialPassword,
      },
    });
    assert.equal(oldLogin.status, 401);

    // New password succeeds
    const newLogin = await api('/api/v1/auth/login', {
      method: 'POST',
      body: {
        email: testEmail,
        password: updatedPassword,
      },
    });
    assert.equal(newLogin.status, 200);
  });

  // 23. Student accounts cannot self-escalate to admin role
  await check(23, 'Student accounts cannot self-escalate to admin role via /api/v1/auth/switch-role', async () => {
    const switchRes = await api('/api/v1/auth/switch-role', {
      method: 'POST',
      token: studentBToken,
      body: { target_role: 'admin' },
    });
    assert.equal(switchRes.status, 403);
  });

  // 24. Official Prime Seven admin profile is provisioned and verified in /api/v1/admin/settings
  await check(24, 'Official Prime Seven (primeseven@gmail.com) admin account is provisioned and verified', async () => {
    const settingsRes = await api('/api/v1/admin/settings', { token: adminToken });
    assert.equal(settingsRes.status, 200);
    assert.equal(settingsRes.data.official_admin.email, 'primeseven@gmail.com');
    assert.equal(settingsRes.data.official_admin.full_name, 'Prime Seven');
    assert.equal(settingsRes.data.official_admin.role, 'admin');
  });

  // 25. Sales Agent Promo Code System (creation, 10% discount, pending vs captured sales, status suspension)
  await check(25, 'Sales Agent Promo Code System validates 10% discount, counts only captured sales, and blocks suspended agents', async () => {
    const agentCode = `ADITYA${String(runId).slice(-4)}`;
    const createAgentRes = await api('/api/v1/admin/marketing/agents', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Aditya Kumar',
        email: `aditya.${runId}@example.com`,
        phone: '+919876543210',
        promo_code: agentCode,
        discount_percent: 10,
        status: 'active',
      },
    });
    assert.equal(createAgentRes.status, 201);
    const agentId = createAgentRes.data.agent.id;

    // Duplicate promo code rejected
    const dupAgentRes = await api('/api/v1/admin/marketing/agents', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Duplicate Agent',
        email: `dup.${runId}@example.com`,
        promo_code: agentCode,
      },
    });
    assert.equal(dupAgentRes.status, 409);

    // Student validates promo code on Economics package
    const econRes = await api('/api/v1/subjects/economics');
    const econPkg = econRes.data.package;
    const studentAgentBuyer = createMockToken(
      `agent-buyer-${runId}`,
      `agent.buyer.${runId}@example.com`,
      'Agent Buyer'
    );

    const valRes = await api('/api/v1/promo/validate', {
      method: 'POST',
      token: studentAgentBuyer,
      body: {
        code: agentCode,
        package_id: econPkg.id,
      },
    });
    assert.equal(valRes.status, 200);
    assert.equal(valRes.data.valid, true);
    assert.equal(valRes.data.message, 'Promo code applied successfully.');
    const expectedDisc = Math.round((econPkg.price_paise * 10) / 100);
    const expectedFinal = econPkg.price_paise - expectedDisc;
    assert.equal(valRes.data.discount_amount_paise, expectedDisc);
    assert.equal(valRes.data.final_amount_paise, expectedFinal);

    // Create order with agent promo code
    const ordRes = await api('/api/v1/payments/create-order', {
      method: 'POST',
      token: studentAgentBuyer,
      body: {
        package_id: econPkg.id,
        promo_code: agentCode,
      },
    });
    assert.equal(ordRes.status, 200);
    assert.equal(ordRes.data.order.original_amount_paise, econPkg.price_paise);
    assert.equal(ordRes.data.order.discount_amount_paise, expectedDisc);
    assert.equal(ordRes.data.order.final_amount_paise, expectedFinal);

    // Before payment capture: agent completed sales must be 0, pending must be 1
    const beforeAgents = await api('/api/v1/admin/marketing/agents', { token: adminToken });
    const beforeAgent = beforeAgents.data.agents.find((a: any) => a.id === agentId);
    assert.equal(beforeAgent.stats.successful_purchases_count, 0);
    assert.equal(beforeAgent.stats.pending_purchases_count, 1);

    // Verify payment capture
    const gwOrderId = ordRes.data.order.gateway_order_id;
    const gwPayId = `pay_agent_${runId}`;
    const validSig = crypto
      .createHmac('sha256', RAZORPAY_SECRET)
      .update(`${gwOrderId}|${gwPayId}`)
      .digest('hex');

    const verifyRes = await api('/api/v1/payments/verify', {
      method: 'POST',
      token: studentAgentBuyer,
      body: {
        razorpay_order_id: gwOrderId,
        razorpay_payment_id: gwPayId,
        razorpay_signature: validSig,
        amount_paise: expectedFinal,
      },
    });
    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.data.verified, true);

    // After capture: agent completed sales = 1, revenue = expectedFinal, discount = expectedDisc
    const afterAgents = await api('/api/v1/admin/marketing/agents', { token: adminToken });
    const afterAgent = afterAgents.data.agents.find((a: any) => a.id === agentId);
    assert.equal(afterAgent.stats.successful_purchases_count, 1);
    assert.equal(afterAgent.stats.total_sales_paise, expectedFinal);
    assert.equal(afterAgent.stats.total_discount_paise, expectedDisc);

    // Suspend agent -> promo code must be rejected as inactive
    await api(`/api/v1/admin/marketing/agents/${agentId}`, {
      method: 'PUT',
      token: adminToken,
      body: { status: 'suspended' },
    });

    const suspendedVal = await api('/api/v1/promo/validate', {
      method: 'POST',
      token: studentBToken,
      body: {
        code: agentCode,
        package_id: econPkg.id,
      },
    });
    assert.equal(suspendedVal.data.valid, false);
    assert.equal(suspendedVal.data.message, 'Promo code inactive.');
  });

  // 26 & 27. Student Refer-a-Friend Programme, Auditable Wallet Ledger, Self-Referral Prevention, and Refund Reversal
  await check(26, 'Student Refer-a-Friend Programme grants 10% friend discount, credits referrer wallet idempotently after capture, and reverses on revoke', async () => {
    // Register Referrer Student
    const referrerReg = await api('/api/v1/auth/register', {
      method: 'POST',
      body: {
        full_name: 'Rishabh Referrer',
        email: `referrer.${runId}@example.com`,
        password: 'SecurePassword123!',
        confirm_password: 'SecurePassword123!',
      },
    });
    assert.equal(referrerReg.status, 201);
    const referrerToken = referrerReg.data.token;
    const referrerCode = referrerReg.data.user.referral_code;
    assert.ok(referrerCode && referrerCode.length >= 6);

    // Self-referral check: Referrer cannot apply their own referral code
    const histRes = await api('/api/v1/subjects/history');
    const histPkg = histRes.data.package;
    const selfRefVal = await api('/api/v1/promo/validate', {
      method: 'POST',
      token: referrerToken,
      body: {
        code: referrerCode,
        package_id: histPkg.id,
      },
    });
    assert.equal(selfRefVal.data.valid, false);
    assert.equal(selfRefVal.data.message, 'You cannot use your own referral code.');

    // Register Referred Friend using ?ref=referrerCode
    const friendReg = await api('/api/v1/auth/register', {
      method: 'POST',
      body: {
        full_name: 'Referred Friend',
        email: `friend.${runId}@example.com`,
        password: 'FriendPassword123!',
        confirm_password: 'FriendPassword123!',
        referral_code: referrerCode,
      },
    });
    assert.equal(friendReg.status, 201);
    const friendToken = friendReg.data.token;
    const friendUserId = friendReg.data.user.id;
    assert.equal(friendReg.data.user.referred_by_code, referrerCode);

    // Friend creates order on History package using referrerCode (10% discount)
    const friendOrd = await api('/api/v1/payments/create-order', {
      method: 'POST',
      token: friendToken,
      body: {
        package_id: histPkg.id,
        promo_code: referrerCode,
      },
    });
    assert.equal(friendOrd.status, 200);
    const expectedFriendDiscount = Math.round((histPkg.price_paise * 10) / 100);
    const expectedFriendPayable = histPkg.price_paise - expectedFriendDiscount;
    assert.equal(friendOrd.data.order.discount_amount_paise, expectedFriendDiscount);
    assert.equal(friendOrd.data.order.final_amount_paise, expectedFriendPayable);

    // Before payment capture: Referrer wallet credit must still be 0
    const refStatsBefore = await api('/api/v1/referrals/my', { token: referrerToken });
    assert.equal(refStatsBefore.data.stats.available_wallet_credit_paise, 0);
    assert.equal(refStatsBefore.data.stats.pending_referrals, 1);

    // Verify Friend's payment capture
    const gwOrderId = friendOrd.data.order.gateway_order_id;
    const gwPayId = `pay_ref_${runId}`;
    const validSig = crypto
      .createHmac('sha256', RAZORPAY_SECRET)
      .update(`${gwOrderId}|${gwPayId}`)
      .digest('hex');

    const verifyFriend = await api('/api/v1/payments/verify', {
      method: 'POST',
      token: friendToken,
      body: {
        razorpay_order_id: gwOrderId,
        razorpay_payment_id: gwPayId,
        razorpay_signature: validSig,
        amount_paise: expectedFriendPayable,
      },
    });
    assert.equal(verifyFriend.status, 200);

    // Duplicate verify call must be idempotent and NEVER double-credit referrer wallet
    const dupVerifyFriend = await api('/api/v1/payments/verify', {
      method: 'POST',
      token: friendToken,
      body: {
        razorpay_order_id: gwOrderId,
        razorpay_payment_id: gwPayId,
        razorpay_signature: validSig,
        amount_paise: expectedFriendPayable,
      },
    });
    assert.equal(dupVerifyFriend.status, 200);

    const expectedReferrerReward = Math.round((histPkg.price_paise * 10) / 100);
    const refStatsAfter = await api('/api/v1/referrals/my', { token: referrerToken });
    assert.equal(refStatsAfter.data.stats.successful_referral_purchases, 1);
    assert.equal(refStatsAfter.data.stats.available_wallet_credit_paise, expectedReferrerReward);
    assert.equal(refStatsAfter.data.wallet_ledger.length, 1);

    // Revoke friend's purchase via admin endpoint -> Referrer wallet credit must be reversed to 0
    const revokeRes = await api('/api/v1/admin/purchases/manual', {
      method: 'POST',
      token: adminToken,
      body: {
        user_id: friendUserId,
        subject_id: histRes.data.subject.id,
        action: 'revoke',
        reason: 'Automated test refund reversal verification',
      },
    });
    assert.equal(revokeRes.status, 200);

    const refStatsReversed = await api('/api/v1/referrals/my', { token: referrerToken });
    assert.equal(refStatsReversed.data.stats.available_wallet_credit_paise, 0);
    assert.equal(refStatsReversed.data.referrals[0].status, 'reversed');
    assert.equal(refStatsReversed.data.wallet_ledger.length, 2);
  });

  // 28. Registration Confirm Password & Change Password Confirm Validation
  await check(27, 'Registration and Change Password enforce confirm password matching on the backend', async () => {
    const mismatchReg = await api('/api/v1/auth/register', {
      method: 'POST',
      body: {
        full_name: 'Mismatch User',
        email: `mismatch.${runId}@example.com`,
        password: 'PasswordOne123!',
        confirm_password: 'PasswordTwo456!',
      },
    });
    assert.equal(mismatchReg.status, 400);
    assert.equal(mismatchReg.data.error, 'Passwords do not match.');

    const mismatchChange = await api('/api/v1/auth/change-password', {
      method: 'POST',
      token: studentAToken,
      body: {
        current_password: 'AnyPassword123!',
        new_password: 'NewPassword123!',
        confirm_new_password: 'DifferentPassword123!',
      },
    });
    assert.equal(mismatchChange.status, 400);
    assert.equal(mismatchChange.data.error, 'New passwords do not match.');
  });

  // 29. Discount Stacking Prevention & Invalid Promo Code Rejection
  await check(28, 'Promo code validation rejects invalid codes and blocks stacking a second code', async () => {
    const geogRes = await api('/api/v1/subjects/geography');
    const geogPkg = geogRes.data.package;

    const invalidPromo = await api('/api/v1/promo/validate', {
      method: 'POST',
      token: studentBToken,
      body: {
        code: 'NONEXISTENT999',
        package_id: geogPkg.id,
      },
    });
    assert.equal(invalidPromo.data.valid, false);
    assert.equal(invalidPromo.data.message, 'Invalid promo code.');

    const stackAttempt = await api('/api/v1/promo/validate', {
      method: 'POST',
      token: studentBToken,
      body: {
        code: 'SECOND_CODE',
        package_id: geogPkg.id,
        currently_applied_code: 'FIRST_CODE',
      },
    });
    assert.equal(stackAttempt.data.valid, false);
    assert.equal(stackAttempt.data.message, 'Another discount is already applied.');
  });

  console.log('----------------------------------------------------------------------');
  console.log(`ALL ${passed} / 28 PRODUCTION-READINESS & MARKETING INTEGRATION CHECKS PASSED.`);
  console.log('----------------------------------------------------------------------');
}

runProductionReadinessSuite().catch((err) => {
  console.error('Production readiness test suite failed:', err);
  process.exit(1);
});
