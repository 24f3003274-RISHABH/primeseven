# PrimePrep — Architecture & Implementation Audit Report (`docs/IMPLEMENTATION_STATUS.md`)

**Audit Timestamp**: 2026-10-31  
**Auditor Role**: Senior Software Architect, Database Engineer & Security Auditor

---

## 1. Executive Summary of Initial Database & Catalogue Verification

| Requirement | Target | Verified Actual State | Status |
| :--- | :--- | :--- | :--- |
| **Initial Subjects** | Exactly 7 subjects (Political Science, Philosophy, Psychology, History, Economics, Geography, Disaster Management) | 7 subjects seeded and active in `store.db.subjects` | **VERIFIED** |
| **Test Categories** | 3 categories (`sectional`, `full_length`, `pyq`) | 3 categories seeded in `store.db.categories` | **VERIFIED** |
| **Sectional Tests** | 15 per subject (30 mins default) | 15 × 7 = 105 Sectional Tests (30m) | **VERIFIED** |
| **Full-Length Tests** | 10 per subject (90 mins default, all premium) | 10 × 7 = 70 Full-Length Tests (90m, 100% premium) | **VERIFIED** |
| **PYQ Tests** | 5 per subject (configurable duration) | 5 × 7 = 35 PYQ Tests (60m) | **VERIFIED** |
| **Total Initial Catalogue** | 210 tests total (30 per subject) | 210 published tests with 1,330 MCQs | **VERIFIED** |
| **Global Free Tests** | 1 global free Sectional + 1 global free PYQ (0 free Full-Length) | `test-political-science-sec-1` and `test-political-science-pyq-1` (2 total; 208 premium) | **VERIFIED** |
| **Zero Chapter Concept** | No chapter fields, navigation, grouping, or pricing | 0 chapter fields in schema, API, Excel template, or UI | **VERIFIED** |
| **Subject-Wise Purchasing** | Buying a subject unlocks all premium tests in that subject only | `hasSubjectEntitlement(userId, subjectId)` unlocks all 30 tests in that subject without unlocking other subjects | **VERIFIED** |
| **One-Attempt Policy** | Strictly 1 attempt per `(user_id, test_id)` | Enforced in `POST /api/v1/attempts/start` (`attempt_number = 1`) | **VERIFIED** |

---

## 2. Detailed 13-Point Architectural Audit

### 2.1 Completed Implementations
1. **Frontend & Backend Logical Separation**:
   - All UI components (`/src/pages/*`, `/src/components/*`) communicate strictly through `/src/api/client.ts` (`apiRequest`) to `/api/v1/*` routes in `/server.ts`.
   - Zero score calculations, payment verifications, or entitlement checks rely on frontend state or `localStorage`.
2. **Subject, Category, and Test Catalogue Engine**:
   - All 7 CUET PG subjects, 3 categories, and 210 initial tests are dynamically loaded from the backend datastore.
   - Administrators can create new tests (defaulting to `premium`), edit durations/marks, reorder, and publish/unpublish without code changes.
   - Zero chapter fields or chapter navigation exist anywhere in the platform.
3. **Global Free-Test Configuration**:
   - `enforceGlobalFreeTestInvariants()` in `/src/backend/store.ts` strictly enforces at most one free Sectional Test and one free PYQ Test across the entire platform, and zero free Full-Length Tests.
4. **Subject-Series Package & Locked-Test Redirect Flow**:
   - Packages store prices strictly as integer paise (`49900` paise = ₹499).
   - Clicking any locked premium test on `SubjectDetailPage.tsx` checks access, identifies the test's subject, and redirects to `/subjects/:slug/purchase?returnTo=/tests/:testId/instructions`, preserving the intended test destination.
5. **Server-Authoritative Examination Engine**:
   - `POST /api/v1/attempts/start` records `started_at` and `expires_at` on the server and enforces the one-attempt rule.
   - `GET /api/v1/attempts/:attemptId/session` returns `server_now` (preventing device clock tampering from extending the countdown) and strips `correct_option` and `explanation` from all questions.
   - `PUT /api/v1/attempts/:attemptId/answers` persists responses and review flags in real time so browser refreshes never lose progress.
   - `POST /api/v1/attempts/:attemptId/submit` computes `+4 / -1 / 0` scores authoritatively on the server.
6. **13-Module Administrator Console & Excel Batch Import**:
   - All 13 admin modules (Overview, Subjects, Categories, Tests, Question Bank, Excel Upload with `.xlsx` template & row-by-row validation preview, Free-Test Config, Pricing in paise, Students, Purchases with audited manual grant/revoke, Payments, Reports, Settings/Audit Logs) are implemented and protected by `requireAdmin`.

---

### 2.2 Partially Completed Implementations
1. **Database Engine (File-Backed Relational Store + Firestore vs. Supabase PostgreSQL)**:
   - **Current State**: Because Cloud SQL was unavailable (`NO_VALID_PROJECT`) and no external Supabase PostgreSQL credentials (`SUPABASE_URL`, `DATABASE_URL`) were provisioned in the container, the application uses Firebase Auth + Cloud Firestore (`ai-studio-09052841-f52f-4ec0-b49e-f4821c6666ad`) alongside the server-side relational store (`/src/backend/store.ts` persisted to `.data/primeprep-db.json`).
   - **Gap**: SQL migration files (`/database/migrations/*.sql`) and a live `pg` / `@supabase/supabase-js` connection pool are documented in `docs/DATABASE.md` but not connected to an external PostgreSQL server.
2. **Razorpay Gateway Order Creation (Test Mode Simulator vs. Live Razorpay REST API)**:
   - **Current State**: Server-side HMAC-SHA256 signature verification (`/api/v1/payments/verify`) and webhook verification (`/api/v1/payments/webhook`) use real cryptographic `crypto.createHmac('sha256', ...)`. However, `POST /api/v1/payments/create-order` generates a local test order ID (`order_rzp_...`) paired with an interactive Test Mode Checkout modal rather than calling `https://api.razorpay.com/v1/orders` with live Razorpay API credentials.
3. **Frontend Library Stack (`TanStack Query` & `React Hook Form`)**:
   - **Current State**: API state is managed cleanly via custom hooks and `apiRequest`, and forms use controlled React state validated by `zod` on the backend, rather than `@tanstack/react-query` and `react-hook-form`.
4. **Pagination on Admin & Catalogue Endpoints**:
   - **Current State**: Endpoints return filtered collections in a single payload (210 tests or filtered by subject/category) rather than cursor/offset pagination (`?page=1&limit=20`).

---

### 2.3 Missing Implementations
1. **Email/Password Registration & Password Reset Flows**:
   - **Current State**: Authentication uses Google Sign-In via Firebase OAuth (`signInWithPopup`) as provisioned by the AI Studio environment. Email/password registration and password-reset email flows are not enabled.
2. **Rate Limiting Middleware (`express-rate-limit`)**:
   - **Current State**: Sensitive endpoints (`/api/v1/payments/*`, `/api/v1/attempts/*`, `/api/v1/auth/*`) do not yet have IP/user rate-limiting middleware attached in `/server.ts`.
3. **Physical `/database/migrations/*.sql` & `/docs/PAYMENT_FLOW.md` / `/docs/DEPLOYMENT.md` Files**:
   - **Current State**: Schema DDL is documented in `docs/DATABASE.md`, but standalone `.sql` migration scripts in `/database/migrations/` have not been emitted as separate files yet.

---

### 2.4 Incorrect / Security Audit Findings Requiring Tightening
1. **Unrestricted Preview Role Switcher (`POST /api/v1/auth/switch-role`)**:
   - **Issue**: To allow easy testing of both Student and Administrator journeys in the preview sandbox, `POST /api/v1/auth/switch-role` in `/server.ts` currently allows any authenticated user to toggle `user.role` between `'student'` and `'admin'`.
   - **Security Impact**: Violates Part 5.1 & Part 12 (*"Do not allow a student to update their own role through a normal profile endpoint"*) if left enabled for arbitrary users in production.
2. **Test-Checkout Authorization Helper (`POST /api/v1/payments/test-checkout-authorize`)**:
   - **Issue**: This endpoint computes a valid test HMAC signature on the server when `simulation_mode === 'success'` so the sandbox modal can test end-to-end verification without external Razorpay keys.
   - **Security Impact**: In production (`NODE_ENV === 'production'`), this simulator endpoint must be disabled so that only signatures generated by Razorpay's external checkout servers are accepted.
3. **Fallback Razorpay Secrets in `/server.ts`**:
   - **Issue**: `/server.ts` falls back to `'primeprep_test_secret_key_2026'` when `process.env.RAZORPAY_KEY_SECRET` is unset. In production (`NODE_ENV === 'production'`), missing payment secrets should fail fast at startup.

---

## 3. Recommended Fixes (Prioritized Action Plan)
1. **Lock Down Role Switching (`POST /api/v1/auth/switch-role`)**:
   - Restrict `/api/v1/auth/switch-role` strictly to designated administrator emails (`rishabhkesharwani8218@gmail.com`) or when `ALLOW_PREVIEW_ROLE_SWITCH === 'true'` in development, blocking ordinary students from escalating privileges.
2. **Guard Test Payment Simulator & Secrets in Production**:
   - Disable `POST /api/v1/payments/test-checkout-authorize` when `NODE_ENV === 'production'` and require explicit `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` environment variables in production.
3. **Add Rate Limiting & Pagination**:
   - Add per-IP/user rate-limiting middleware on `/api/v1/payments/*`, `/api/v1/attempts/*`, and `/api/v1/auth/*`, and add optional `page` / `limit` pagination parameters to admin list endpoints.
4. **Emit Standalone PostgreSQL Migration & Seed Scripts (`/database/migrations/001_init.sql`)**:
   - Write executable SQL migration and seed files in `/database/migrations/` and `/database/seeds/` so the application can be deployed directly to an external Supabase PostgreSQL instance without schema translation.
