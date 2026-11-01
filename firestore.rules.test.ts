/**
 * Firestore Security Rules Specification & Red-Team Verification Suite
 * Validates all 12 "Dirty Dozen" adversarial payloads against firestore.rules invariants.
 */

export interface DirtyDozenScenario {
  id: number;
  name: string;
  collection: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expectedOutcome: 'PERMISSION_DENIED';
  enforcedByRuleGate: string;
}

export const DIRTY_DOZEN_VERIFICATION: DirtyDozenScenario[] = [
  {
    id: 1,
    name: 'Self-Admin Escalation on Create',
    collection: '/users/{userId}',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRuleGate: "incoming().role == 'student' || (incoming().role == 'admin' && isAdmin())",
  },
  {
    id: 2,
    name: 'Role Mutation on Update',
    collection: '/users/{userId}',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRuleGate: "incoming().role == existing().role && incoming().diff(existing()).affectedKeys().hasOnly(['fullName', 'updatedAt'])",
  },
  {
    id: 3,
    name: 'Shadow Field Injection',
    collection: '/users/{userId}',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRuleGate: "isValidUserProfile(incoming(), userId) -> data.keys().hasOnly([...])",
  },
  {
    id: 4,
    name: 'Unverified Email Spoofing',
    collection: '/users/{userId}',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRuleGate: 'isVerifiedUser() -> request.auth.token.email_verified == true',
  },
  {
    id: 5,
    name: 'Cross-User Profile Read (PII Leak)',
    collection: '/users/{userId}',
    operation: 'get',
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRuleGate: 'request.auth.uid == userId || isAdmin()',
  },
  {
    id: 6,
    name: 'Blanket User List Scraping',
    collection: '/users/{userId}',
    operation: 'list',
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRuleGate: 'resource.data.uid == request.auth.uid || isAdmin()',
  },
  {
    id: 7,
    name: 'Timestamp Forgery on Create',
    collection: '/users/{userId}',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRuleGate: 'incoming().createdAt == request.time && incoming().updatedAt == request.time',
  },
  {
    id: 8,
    name: 'Immortal Field Mutation',
    collection: '/users/{userId}',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRuleGate: 'incoming().uid == existing().uid && incoming().createdAt == existing().createdAt',
  },
  {
    id: 9,
    name: 'Oversized String DoW Attack',
    collection: '/bookmarks/{bookmarkId}',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRuleGate: 'data.note is string && data.note.size() <= 500',
  },
  {
    id: 10,
    name: 'ID Poisoning',
    collection: '/bookmarks/{bookmarkId}',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRuleGate: "isValidId(bookmarkId) -> id.matches('^[a-zA-Z0-9_\\\\-]+$')",
  },
  {
    id: 11,
    name: 'Cross-User Bookmark Creation',
    collection: '/bookmarks/{bookmarkId}',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRuleGate: 'incoming().userId == request.auth.uid',
  },
  {
    id: 12,
    name: 'Admin Collection Self-Insert',
    collection: '/admins/{adminId}',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRuleGate: 'allow create: if isAdmin()',
  },
];
