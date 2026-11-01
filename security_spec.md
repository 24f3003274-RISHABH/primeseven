# PrimePrep Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Default Deny**: Any path not explicitly matched is strictly denied for both `read` and `write`.
2. **PII Isolation (`/users/{userId}`)**: User profiles contain `email` and `fullName`. Only the document owner (`request.auth.uid == userId`) or a verified administrator (`isAdmin()`) may `get` or `list` the document.
3. **Privilege Escalation Prevention**: A standard user creating `/users/{userId}` can ONLY set `role == 'student'` and `accountStatus == 'active'`, unless their verified email matches the bootstrapped admin (`rishabhkesharwani8218@gmail.com`) or `isAdmin()` is true. During `update`, a non-admin owner can only update `fullName` and `updatedAt`—never `role`, `accountStatus`, `uid`, `email`, or `createdAt`.
4. **Temporal & Identity Integrity**: All writes require `request.auth.token.email_verified == true`. `createdAt` must equal `request.time` on `create` and remain immutable on `update`. `updatedAt` must equal `request.time` on both `create` and `update`.
5. **Query Enforcer (`/bookmarks/{bookmarkId}`)**: `allow list` on `/bookmarks` enforces `resource.data.userId == request.auth.uid`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Self-Admin Escalation on Create**: Authenticated user creates `/users/user_1` with `role: "admin"` from non-admin email. -> `PERMISSION_DENIED`
2. **Role Mutation on Update**: Owner updates `/users/user_1` changing `role` from `"student"` to `"admin"`. -> `PERMISSION_DENIED`
3. **Shadow Field Injection**: Owner updates `/users/user_1` with extra field `isVerified: true`. -> `PERMISSION_DENIED`
4. **Unverified Email Spoofing**: User with `email: "rishabhkesharwani8218@gmail.com"` but `email_verified: false` attempts write. -> `PERMISSION_DENIED`
5. **Cross-User Profile Read (PII Leak)**: `user_2` attempts `get` on `/users/user_1`. -> `PERMISSION_DENIED`
6. **Blanket User List Scraping**: `user_2` attempts `list` on `/users` without owning the resources. -> `PERMISSION_DENIED`
7. **Timestamp Forgery on Create**: User creates `/users/user_1` with past/future `createdAt` instead of `request.time`. -> `PERMISSION_DENIED`
8. **Immortal Field Mutation**: Owner updates `/users/user_1` modifying `createdAt` or `uid`. -> `PERMISSION_DENIED`
9. **Oversized String DoW Attack**: User creates `/bookmarks/bm_1` with a 2,000-char `note` (exceeding `maxLength: 500`). -> `PERMISSION_DENIED`
10. **ID Poisoning**: User creates `/bookmarks/invalid$id!` with disallowed characters. -> `PERMISSION_DENIED`
11. **Cross-User Bookmark Creation**: `user_1` creates `/bookmarks/bm_1` with `userId: "user_2"`. -> `PERMISSION_DENIED`
12. **Admin Collection Self-Insert**: Non-admin user attempts to create `/admins/user_1`. -> `PERMISSION_DENIED`
