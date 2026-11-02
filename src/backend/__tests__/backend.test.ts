import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { store } from '../store.ts';
import { canAccessTest } from '../services/accessControlService.ts';
import { paginateArray } from '../utils/pagination.ts';
import { BadRequestError } from '../utils/errors.ts';

async function runBackendTestSuite() {
  console.log('================================================================');
  console.log('PrimePrep Backend & PostgreSQL Architecture Verification Suite');
  console.log('================================================================');

  let passed = 0;

  function verify(name: string, fn: () => void) {
    try {
      fn();
      passed++;
      console.log(`  [PASS] ${name}`);
    } catch (err) {
      console.error(`  [FAIL] ${name}`);
      throw err;
    }
  }

  // 1. Verify SQL Migrations and Seed Scripts Exist and Define Required Constraints
  verify('1. PostgreSQL migration files (001, 002, 003) and seed file exist and contain FK/UNIQUE constraints', () => {
    const mig1Path = path.resolve(process.cwd(), 'database/migrations/001_initial_schema.sql');
    const mig2Path = path.resolve(process.cwd(), 'database/migrations/002_indexes_and_rls.sql');
    const mig3Path = path.resolve(process.cwd(), 'database/migrations/003_marketing_referrals_schema.sql');
    const seedPath = path.resolve(process.cwd(), 'database/seeds/001_initial_catalogue_seed.sql');

    assert.ok(fs.existsSync(mig1Path), '001_initial_schema.sql must exist');
    assert.ok(fs.existsSync(mig2Path), '002_indexes_and_rls.sql must exist');
    assert.ok(fs.existsSync(mig3Path), '003_marketing_referrals_schema.sql must exist');
    assert.ok(fs.existsSync(seedPath), '001_initial_catalogue_seed.sql must exist');

    const mig1Sql = fs.readFileSync(mig1Path, 'utf-8');
    assert.ok(mig1Sql.includes('CONSTRAINT uq_user_subject_entitlement UNIQUE (user_id, subject_id)'));
    assert.ok(mig1Sql.includes('CONSTRAINT uq_one_attempt_per_user_test UNIQUE (user_id, test_id)'));
    assert.ok(mig1Sql.includes('CONSTRAINT uq_attempt_question_answer UNIQUE (attempt_id, question_id)'));
    assert.ok(!mig1Sql.toLowerCase().includes('chapter_id'), 'Zero chapter fields allowed in schema');

    const mig3Sql = fs.readFileSync(mig3Path, 'utf-8');
    assert.ok(mig3Sql.includes('CREATE TABLE IF NOT EXISTS sales_agents'));
    assert.ok(mig3Sql.includes('CREATE TABLE IF NOT EXISTS promo_codes'));
    assert.ok(mig3Sql.includes('CREATE TABLE IF NOT EXISTS referral_attributions'));
    assert.ok(mig3Sql.includes('CREATE TABLE IF NOT EXISTS wallet_transactions'));
  });

  // 2. Verify Initial Catalogue Invariants (7 subjects, 3 categories, 210 tests, 2 global free tests)
  verify('2. Initial catalogue contains 7 subjects, 3 categories, 210 published tests, and 0 chapter fields', () => {
    assert.equal(store.db.subjects.length, 7);
    assert.equal(store.db.categories.length, 3);
    assert.ok(store.db.tests.length >= 210);

    for (const subj of store.db.subjects) {
      const subjTests = store.db.tests.filter((t) => t.subject_id === subj.id);
      const sec = subjTests.filter((t) => t.category_slug === 'sectional').length;
      const flt = subjTests.filter((t) => t.category_slug === 'full_length').length;
      const pyq = subjTests.filter((t) => t.category_slug === 'pyq').length;
      assert.ok(sec >= 15, `${subj.name} must have >= 15 Sectional tests`);
      assert.ok(flt >= 10, `${subj.name} must have >= 10 Full-Length tests`);
      assert.ok(pyq >= 5, `${subj.name} must have >= 5 PYQ tests`);
    }

    const freeTests = store.db.tests.filter((t) => t.access_type === 'free');
    assert.equal(freeTests.length, 2, 'Exactly 2 globally designated free tests');
    const freeFlt = freeTests.filter((t) => t.category_slug === 'full_length');
    assert.equal(freeFlt.length, 0, 'Zero Full-Length tests can be free');
  });

  // 3. Verify Relational Integrity Checker
  verify('3. Relational foreign-key and uniqueness constraints validate cleanly across all records', () => {
    const integrity = store.validateRelationalIntegrity();
    assert.equal(integrity.valid, true, `Violations: ${integrity.violations.join(', ')}`);
  });

  // 4. Verify canAccessTest(userId, testId) — Branch 1: Public Catalogue Visibility vs Draft/Non-existent
  verify('4. canAccessTest(userId, testId) distinguishes public catalogue visibility vs unpublished/non-existent tests', () => {
    const missingDecision = canAccessTest('student-test-1', 'non-existent-test-id');
    assert.equal(missingDecision.exists, false);
    assert.equal(missingDecision.publicCatalogueVisible, false);
    assert.equal(missingDecision.classification, 'NOT_FOUND_OR_UNPUBLISHED');
    assert.equal(missingDecision.canRetrieveQuestions, false);

    // Temporarily test draft status on a test
    const sampleTest = store.db.tests[10];
    const originalStatus = sampleTest.publication_status;
    sampleTest.publication_status = 'draft';
    try {
      const draftDecision = canAccessTest('student-test-1', sampleTest.id);
      assert.equal(draftDecision.exists, true);
      assert.equal(draftDecision.publicCatalogueVisible, false);
      assert.equal(draftDecision.classification, 'NOT_FOUND_OR_UNPUBLISHED');
      assert.equal(draftDecision.canStartOrResumeExam, false);
      assert.equal(draftDecision.canRetrieveQuestions, false);
    } finally {
      sampleTest.publication_status = originalStatus;
    }
  });

  // 5. Verify canAccessTest(userId, testId) — Branch 2: Globally Designated Free Tests
  verify('5. canAccessTest(userId, testId) identifies globally designated free tests (1 Sectional, 1 PYQ)', () => {
    const freeSecId = store.db.free_test_config.free_sectional_test_id!;
    const freePyqId = store.db.free_test_config.free_pyq_test_id!;

    // Guest browsing free test metadata
    const guestFreeDecision = canAccessTest(null, freeSecId);
    assert.equal(guestFreeDecision.publicCatalogueVisible, true);
    assert.equal(guestFreeDecision.isGloballyDesignatedFree, true);
    assert.equal(guestFreeDecision.classification, 'GLOBAL_FREE_TEST');
    assert.equal(
      guestFreeDecision.canStartOrResumeExam,
      false,
      'Unauthenticated guest cannot start exam until signed in'
    );

    // Authenticated unentitled student accessing global free test
    const studentFreeDecision = canAccessTest('unentitled-student-99', freePyqId);
    assert.equal(studentFreeDecision.isGloballyDesignatedFree, true);
    assert.equal(studentFreeDecision.classification, 'GLOBAL_FREE_TEST');
    assert.equal(studentFreeDecision.canStartOrResumeExam, true);
    assert.equal(studentFreeDecision.canRetrieveQuestions, true);
  });

  // 6. Verify canAccessTest(userId, testId) — Branch 3 & 4: Subject Entitlement vs Premium Access Denial
  verify('6. canAccessTest(userId, testId) enforces subject-series entitlement and blocks cross-subject access', () => {
    const testUserId = `test-entitled-user-${Date.now()}`;
    const polSci = store.db.subjects.find((s) => s.slug === 'political-science')!;
    const phil = store.db.subjects.find((s) => s.slug === 'philosophy')!;
    const polPkg = store.db.packages.find((p) => p.subject_id === polSci.id)!;

    const polPremiumTest = store.db.tests.find(
      (t) => t.subject_id === polSci.id && t.access_type === 'premium'
    )!;
    const philPremiumTest = store.db.tests.find(
      (t) => t.subject_id === phil.id && t.access_type === 'premium'
    )!;

    // Before entitlement: denied on Political Science premium test
    const beforeDecision = canAccessTest(testUserId, polPremiumTest.id);
    assert.equal(beforeDecision.publicCatalogueVisible, true);
    assert.equal(beforeDecision.classification, 'PREMIUM_ACCESS_DENIED');
    assert.equal(beforeDecision.canStartOrResumeExam, false);
    assert.equal(beforeDecision.canRetrieveQuestions, false);

    // Grant Political Science entitlement
    const now = new Date().toISOString();
    store.db.purchases.push({
      id: `ent-test-${Date.now()}`,
      user_id: testUserId,
      package_id: polPkg.id,
      subject_id: polSci.id,
      payment_transaction_id: 'txn-test',
      entitlement_status: 'active',
      purchased_at: now,
      created_at: now,
      updated_at: now,
    });

    try {
      // After entitlement: allowed on ALL Political Science tests (Sectional, Full-Length, PYQ)
      const afterPolDecision = canAccessTest(testUserId, polPremiumTest.id);
      assert.equal(afterPolDecision.classification, 'VALID_SUBJECT_ENTITLEMENT');
      assert.equal(afterPolDecision.hasValidSubjectEntitlement, true);
      assert.equal(afterPolDecision.canStartOrResumeExam, true);
      assert.equal(afterPolDecision.canRetrieveQuestions, true);

      // Cross-subject check: still denied on Philosophy premium test!
      const afterPhilDecision = canAccessTest(testUserId, philPremiumTest.id);
      assert.equal(afterPhilDecision.classification, 'PREMIUM_ACCESS_DENIED');
      assert.equal(afterPhilDecision.hasValidSubjectEntitlement, false);
      assert.equal(afterPhilDecision.canStartOrResumeExam, false);
      assert.equal(afterPhilDecision.canRetrieveQuestions, false);
    } finally {
      store.db.purchases = store.db.purchases.filter((p) => p.user_id !== testUserId);
    }
  });

  // 7. Verify canAccessTest(userId, testId) — Branch 5: One-Attempt Policy & Server Score Evaluation
  verify('7. canAccessTest(userId, testId) enforces One-Attempt Policy (resumable vs completed lock) and server-side scoring (+4, -1, 0)', () => {
    const attemptUserId = `test-attempt-user-${Date.now()}`;
    const freeSecId = store.db.free_test_config.free_sectional_test_id!;
    const testQuestions = store.db.questions
      .filter((q) => q.test_id === freeSecId)
      .sort((a, b) => a.display_order - b.display_order);

    const startMs = Date.now();
    const expiresMs = startMs + 30 * 60 * 1000;
    const attemptId = `att-test-${Date.now()}`;

    store.db.attempts.push({
      id: attemptId,
      user_id: attemptUserId,
      test_id: freeSecId,
      subject_id: 'subj-pol-sci',
      category_slug: 'sectional',
      attempt_number: 1,
      status: 'in_progress',
      started_at: new Date(startMs).toISOString(),
      expires_at: new Date(expiresMs).toISOString(),
      submitted_at: null,
      total_score: 0,
      maximum_marks: testQuestions.length * 4,
      correct_count: 0,
      incorrect_count: 0,
      unanswered_count: testQuestions.length,
      time_taken_seconds: 0,
    });

    try {
      // While in_progress: resumable
      const inProgressDecision = canAccessTest(attemptUserId, freeSecId);
      assert.equal(inProgressDecision.attemptRestriction, 'IN_PROGRESS_RESUMABLE');
      assert.equal(inProgressDecision.canStartOrResumeExam, true);
      assert.equal(inProgressDecision.existingAttemptId, attemptId);

      // Record 2 correct answers (+8) and 1 wrong answer (-1) => net score = 7
      const q1 = testQuestions[0];
      const q2 = testQuestions[1];
      const q3 = testQuestions[2];
      const wrongOpt = (['A', 'B', 'C', 'D'] as const).find((o) => o !== q3.correct_option)!;

      store.db.attempt_answers.push(
        {
          id: `ans-1-${Date.now()}`,
          attempt_id: attemptId,
          question_id: q1.id,
          selected_option: q1.correct_option,
          is_marked_for_review: false,
          is_visited: true,
          updated_at: new Date().toISOString(),
        },
        {
          id: `ans-2-${Date.now()}`,
          attempt_id: attemptId,
          question_id: q2.id,
          selected_option: q2.correct_option,
          is_marked_for_review: false,
          is_visited: true,
          updated_at: new Date().toISOString(),
        },
        {
          id: `ans-3-${Date.now()}`,
          attempt_id: attemptId,
          question_id: q3.id,
          selected_option: wrongOpt,
          is_marked_for_review: true,
          is_visited: true,
          updated_at: new Date().toISOString(),
        }
      );

      const attemptObj = store.db.attempts.find((a) => a.id === attemptId)!;
      const evaluated = store.evaluateAndSubmitAttempt(attemptObj, false);

      assert.equal(evaluated.status, 'submitted');
      assert.equal(evaluated.correct_count, 2);
      assert.equal(evaluated.incorrect_count, 1);
      assert.equal(evaluated.unanswered_count, testQuestions.length - 3);
      assert.equal(evaluated.total_score, 7);

      // After submission: One-Attempt Policy locks re-attempts
      const postSubmitDecision = canAccessTest(attemptUserId, freeSecId);
      assert.equal(postSubmitDecision.attemptRestriction, 'COMPLETED_ONE_ATTEMPT_LOCKED');
      assert.equal(postSubmitDecision.canStartOrResumeExam, false);
      assert.equal(postSubmitDecision.canRetrieveQuestions, false);
    } finally {
      store.db.attempts = store.db.attempts.filter((a) => a.id !== attemptId);
      store.db.attempt_answers = store.db.attempt_answers.filter(
        (ans) => ans.attempt_id !== attemptId
      );
      store.persist();
    }
  });

  // 8. Verify Pagination Utility
  verify('8. Pagination helper accurately slices arrays and computes total_pages, has_next, and has_prev', () => {
    const sample = Array.from({ length: 30 }, (_, i) => i + 1);
    const page2 = paginateArray(sample, { page: '2', limit: '10' });
    assert.equal(page2.items.length, 10);
    assert.equal(page2.items[0], 11);
    assert.equal(page2.pagination.page, 2);
    assert.equal(page2.pagination.total_items, 30);
    assert.equal(page2.pagination.total_pages, 3);
    assert.equal(page2.pagination.has_prev, true);
    assert.equal(page2.pagination.has_next, true);
  });

  // 9. Verify Centralized Error Classes
  verify('9. Centralized AppError hierarchy sets status codes and error codes accurately', () => {
    const err = new BadRequestError('Invalid test parameter', { field: 'test_id' });
    assert.equal(err.statusCode, 400);
    assert.equal(err.code, 'BAD_REQUEST');
  });

  console.log('----------------------------------------------------------------');
  console.log(`ALL ${passed} BACKEND & DATABASE VERIFICATION TESTS PASSED.`);
  console.log('----------------------------------------------------------------');
}

runBackendTestSuite().catch((err) => {
  console.error('Backend test suite failed:', err);
  process.exit(1);
});
