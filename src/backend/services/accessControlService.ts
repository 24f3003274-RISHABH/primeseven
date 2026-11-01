import { store } from '../store.ts';

export type AccessClassification =
  | 'NOT_FOUND_OR_UNPUBLISHED'
  | 'GLOBAL_FREE_TEST'
  | 'VALID_SUBJECT_ENTITLEMENT'
  | 'PREMIUM_ACCESS_DENIED';

export type AttemptRestrictionState =
  | 'NO_EXISTING_ATTEMPT'
  | 'IN_PROGRESS_RESUMABLE'
  | 'COMPLETED_ONE_ATTEMPT_LOCKED'
  | 'EXPIRED_AUTO_SUBMITTED_LOCKED';

export interface TestAccessDecision {
  testId: string;
  userId: string | null;
  exists: boolean;
  /** True for all published tests so students can browse catalogue metadata without 403 errors */
  publicCatalogueVisible: boolean;
  /** True only if this test is one of the 2 globally designated free tests (1 Sectional, 1 PYQ) */
  isGloballyDesignatedFree: boolean;
  /** True if the user owns an active PurchaseEntitlement for this test's subject */
  hasValidSubjectEntitlement: boolean;
  /** Primary access classification */
  classification: AccessClassification;
  /** True if the user is authenticated, authorized, and has not yet completed their 1 allowed attempt */
  canStartOrResumeExam: boolean;
  /** True ONLY if user is authenticated, has free/entitled access, AND has an active or new attempt */
  canRetrieveQuestions: boolean;
  /** Tracks one-attempt policy status for (userId, testId) */
  attemptRestriction: AttemptRestrictionState;
  existingAttemptId: string | null;
  subjectId: string | null;
  subjectSlug: string | null;
  packageId: string | null;
  denialReason: string | null;
}

/**
 * Centralized Authorization & Access Control Service: `canAccessTest(userId, testId)`
 *
 * Explicitly distinguishes between:
 * 1. Public catalogue visibility (metadata browsing for published tests vs hidden draft/unpublished tests).
 * 2. Globally designated free tests (1 global Sectional Test and 1 global PYQ Test).
 * 3. Valid subject-series entitlement (active purchase for `test.subject_id`).
 * 4. Premium access denial (unentitled student attempting to access a premium test).
 * 5. Existing attempt restrictions (enforcing the strict one-attempt examination rule).
 */
export function canAccessTest(userId: string | null, testId: string): TestAccessDecision {
  const test = store.db.tests.find((t) => t.id === testId);

  if (!test || test.publication_status !== 'published') {
    return {
      testId,
      userId,
      exists: Boolean(test),
      publicCatalogueVisible: false,
      isGloballyDesignatedFree: false,
      hasValidSubjectEntitlement: false,
      classification: 'NOT_FOUND_OR_UNPUBLISHED',
      canStartOrResumeExam: false,
      canRetrieveQuestions: false,
      attemptRestriction: 'NO_EXISTING_ATTEMPT',
      existingAttemptId: null,
      subjectId: test?.subject_id || null,
      subjectSlug: null,
      packageId: null,
      denialReason: test
        ? 'This test is currently in draft or unpublished state.'
        : 'Test does not exist.',
    };
  }

  const subject = store.db.subjects.find((s) => s.id === test.subject_id);
  const pkg = store.db.packages.find((p) => p.subject_id === test.subject_id);

  // Check global free test configuration
  const { free_sectional_test_id, free_pyq_test_id } = store.db.free_test_config;
  const isGloballyDesignatedFree =
    test.access_type === 'free' &&
    ((test.category_slug === 'sectional' && test.id === free_sectional_test_id) ||
      (test.category_slug === 'pyq' && test.id === free_pyq_test_id));

  const hasValidSubjectEntitlement = userId
    ? store.hasSubjectEntitlement(userId, test.subject_id)
    : false;

  // Evaluate existing attempt restrictions for (userId, testId)
  let attemptRestriction: AttemptRestrictionState = 'NO_EXISTING_ATTEMPT';
  let existingAttemptId: string | null = null;

  if (userId) {
    const existingAttempt = store.db.attempts.find(
      (a) => a.user_id === userId && a.test_id === test.id
    );
    if (existingAttempt) {
      existingAttemptId = existingAttempt.id;
      if (existingAttempt.status === 'in_progress') {
        if (Date.now() >= new Date(existingAttempt.expires_at).getTime()) {
          // Auto-evaluate expired attempt
          store.evaluateAndSubmitAttempt(existingAttempt, true);
          attemptRestriction = 'EXPIRED_AUTO_SUBMITTED_LOCKED';
        } else {
          attemptRestriction = 'IN_PROGRESS_RESUMABLE';
        }
      } else if (existingAttempt.status === 'expired_submitted') {
        attemptRestriction = 'EXPIRED_AUTO_SUBMITTED_LOCKED';
      } else {
        attemptRestriction = 'COMPLETED_ONE_ATTEMPT_LOCKED';
      }
    }
  }

  // Determine classification
  let classification: AccessClassification = 'PREMIUM_ACCESS_DENIED';
  if (isGloballyDesignatedFree) {
    classification = 'GLOBAL_FREE_TEST';
  } else if (hasValidSubjectEntitlement) {
    classification = 'VALID_SUBJECT_ENTITLEMENT';
  }

  const isEntitledOrFree =
    classification === 'GLOBAL_FREE_TEST' || classification === 'VALID_SUBJECT_ENTITLEMENT';

  const isLockedByOneAttemptRule =
    attemptRestriction === 'COMPLETED_ONE_ATTEMPT_LOCKED' ||
    attemptRestriction === 'EXPIRED_AUTO_SUBMITTED_LOCKED';

  const canRetrieveQuestions =
    Boolean(userId) && isEntitledOrFree && !isLockedByOneAttemptRule;

  const canStartOrResumeExam = canRetrieveQuestions;

  let denialReason: string | null = null;
  if (!isEntitledOrFree) {
    denialReason = `Access Denied: "${test.title}" is a premium test. Purchase the ${
      subject?.name || 'Subject'
    } Test Series to unlock all eligible premium tests in this subject.`;
  } else if (!userId) {
    denialReason = 'Authentication required: Please sign in to start this examination.';
  } else if (attemptRestriction === 'COMPLETED_ONE_ATTEMPT_LOCKED') {
    denialReason =
      'One-Attempt Policy: You have already completed and submitted this test.';
  } else if (attemptRestriction === 'EXPIRED_AUTO_SUBMITTED_LOCKED') {
    denialReason =
      'Your examination time expired and your attempt was automatically submitted.';
  }

  return {
    testId: test.id,
    userId,
    exists: true,
    publicCatalogueVisible: true,
    isGloballyDesignatedFree,
    hasValidSubjectEntitlement,
    classification,
    canStartOrResumeExam,
    canRetrieveQuestions,
    attemptRestriction,
    existingAttemptId,
    subjectId: test.subject_id,
    subjectSlug: subject?.slug || null,
    packageId: pkg?.id || null,
    denialReason,
  };
}
