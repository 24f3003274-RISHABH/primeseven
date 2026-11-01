# PrimePrep — REST API Reference (`docs/API.md`)

All backend REST endpoints are prefixed under `/api/v1` and return JSON responses.
- **Authentication**: Protected endpoints require an `Authorization: Bearer <ID_Token>` header.
- **Centralized Request Validation**: All `POST` and `PUT` request bodies are validated through `validateBody(zodSchema)`.
- **Centralized Error Handling**: All errors are formatted through `centralErrorHandler` returning `{ error, code, ...details }`.
- **Pagination**: List endpoints accept `?page=1&limit=50` query parameters and return a `pagination` metadata object (`{ page, limit, total_items, total_pages, has_next, has_prev }`).
- **Structured Logging**: All `/api/*` requests are logged as structured JSON via `httpRequestLogger` with automatic secret redaction.

---

## Centralized Authorization Service: `canAccessTest(userId, testId)`

Located at `/src/backend/services/accessControlService.ts`, `canAccessTest(userId, testId)` is the single authoritative access gate for test catalogue inspection, examination start/resume, and question retrieval. It returns a `TestAccessDecision` object that explicitly distinguishes:
1. **Public Catalogue Visibility** (`publicCatalogueVisible: boolean`) — `true` for all `published` tests so students can browse catalogue metadata without `403` errors; `false` for `draft` or `unpublished` tests (`classification: 'NOT_FOUND_OR_UNPUBLISHED'`).
2. **Globally Designated Free Tests** (`isGloballyDesignatedFree: boolean`, `classification: 'GLOBAL_FREE_TEST'`) — `true` only if the test is the single globally designated free Sectional Test (`free_sectional_test_id`) or the single globally designated free PYQ Test (`free_pyq_test_id`).
3. **Valid Subject-Series Entitlement** (`hasValidSubjectEntitlement: boolean`, `classification: 'VALID_SUBJECT_ENTITLEMENT'`) — `true` if `userId` holds an `active` `PurchaseEntitlement` for `test.subject_id`.
4. **Premium Access Denial** (`classification: 'PREMIUM_ACCESS_DENIED'`) — returned when a test is premium and the user does not hold an active entitlement for that subject. `canStartOrResumeExam` and `canRetrieveQuestions` are strictly `false`.
5. **Existing Attempt Restrictions** (`attemptRestriction`):
   - `'NO_EXISTING_ATTEMPT'` — Student has not yet attempted this test.
   - `'IN_PROGRESS_RESUMABLE'` — Student has an active, unexpired attempt and may resume without resetting `expires_at`.
   - `'COMPLETED_ONE_ATTEMPT_LOCKED'` — Student has already submitted their single allowed attempt (`canStartOrResumeExam: false`).
   - `'EXPIRED_AUTO_SUBMITTED_LOCKED'` — Attempt timer expired; server auto-evaluated and locked re-attempts.

---

## 1. Health & Public Catalogue Endpoints

### `GET /api/v1/health`
- **Auth**: Public
- **Response**: `{ status: "ok", service: "PrimePrep CUET PG Examination Engine", timestamp: "...", database: { postgres_pool_configured, relational_integrity_valid, subjects_count, categories_count, published_tests_count } }`

### `GET /api/v1/public/stats`
- **Auth**: Public
- **Response**: Live counts of `total_subjects` (7), `total_published_tests` (210+), `total_questions`, `categories_count` (3), and metadata for `free_tests` (the 2 globally designated free diagnostic tests).

### `GET /api/v1/categories`
- **Auth**: Public
- **Response**: `{ categories: TestCategory[] }` (`sectional`, `full_length`, `pyq`).

### `GET /api/v1/subjects?page=1&limit=50`
- **Auth**: Optional (`optionalAuth`)
- **Response**: `{ subjects, categories, pagination }` — List of all active subjects ordered by `display_order`, including `total_tests`, `category_counts`, `is_purchased` flag, and `package` details in integer `price_paise`.

### `GET /api/v1/subjects/:slug?page=1&limit=50`
- **Auth**: Optional (`optionalAuth`)
- **Response**: `{ subject, is_purchased, package, categories, tests, pagination, subject_history }` — Each test includes `access_decision` computed by `canAccessTest(userId, test.id)`.

### `GET /api/v1/tests?subject_slug=...&category_slug=...&page=1&limit=30`
- **Auth**: Optional (`optionalAuth`)
- **Response**: `{ tests, pagination }` — Paginated list of published tests with `access_decision`. Never exposes questions.

### `GET /api/v1/tests/:testId`
- **Auth**: Optional (`optionalAuth`)
- **Response**: Published test metadata, subject, category, `has_access`, `access_decision` (from `canAccessTest`), and `existing_attempt` summary. Never exposes questions or answers.

### `GET /api/v1/tests/:testId/access`
- **Auth**: Optional (`optionalAuth`)
- **Response**: `{ access_decision: TestAccessDecision }` — Direct evaluation of `canAccessTest(userId, testId)`.

---

## 2. Authentication & Profile Endpoints

### `GET /api/v1/auth/me`
- **Auth**: `requireAuth`
- **Response**: Current `UserProfile`, `purchased_subject_ids`, and summary `stats`.

### `PUT /api/v1/auth/profile`
- **Auth**: `requireAuth`
- **Body**: `{ full_name: string }`
- **Security**: Validated via `validateBody`; updates `full_name` only and blocks role self-escalation.

### `POST /api/v1/auth/switch-role`
- **Auth**: `requireAuth`
- **Body**: `{ target_role: "student" | "admin" }`
- **Security**: Restricted to the bootstrapped administrator (`rishabhkesharwani8218@gmail.com`) in production; logged in `audit_logs`.

---

## 3. Subject-Series Packages & Razorpay Payment Endpoints

### `GET /api/v1/packages/:subjectSlug`
- **Auth**: Optional (`optionalAuth`)
- **Response**: Subject, package pricing in integer `price_paise`, `is_purchased` status, `total_tests`, and `category_counts`.

### `POST /api/v1/payments/create-order`
- **Auth**: `requireAuth` (Rate-limited)
- **Body**: `{ package_id: string }`
- **Validation**:
  - Reads `price_paise` strictly from backend storage.
  - Returns `409 Conflict` if the user already holds an active entitlement for the subject.
  - Creates a `pending` `PaymentOrder` and returns `razorpay_config`.

### `POST /api/v1/payments/verify`
- **Auth**: `requireAuth` (Rate-limited)
- **Body**: `{ razorpay_order_id, razorpay_payment_id, razorpay_signature, amount_paise? }`
- **Validation**:
  - Verifies `order.user_id === req.userProfile.id` (prevents cross-user order hijacking).
  - Verifies `amount_paise === order.expected_amount_paise` (rejects price tampering).
  - Verifies cryptographic `HMAC-SHA256(razorpay_order_id + "|" + razorpay_payment_id, RAZORPAY_KEY_SECRET)`.
  - Records `PaymentTransaction` (`captured` + `verified`) and creates active `PurchaseEntitlement` for the subject.

### `GET /api/v1/payments/orders/:orderId/status`
- **Auth**: `requireAuth`
- **Response**: Order status, transactions, and `is_unlocked` flag.

### `POST /api/v1/payments/webhook`
- **Auth**: Razorpay Webhook Signature (`x-razorpay-signature` verified against `req.rawBody` using `RAZORPAY_WEBHOOK_SECRET`)
- **Validation**: Deduplicates `event_id` in `webhook_events` and grants entitlement idempotently on `payment.captured`.

### `GET /api/v1/purchases/my?page=1&limit=50`
- **Auth**: `requireAuth`
- **Response**: `{ purchases, pagination }` — Paginated list of the student's subject entitlements.

---

## 4. Examination Engine & Results Endpoints

### `POST /api/v1/attempts/start`
- **Auth**: `requireAuth`
- **Body**: `{ test_id: string }`
- **Validation**:
  - Calls `canAccessTest(user.id, test_id)`.
  - Returns `404` if draft/unpublished, `403` if `PREMIUM_ACCESS_DENIED`, or `409` if `COMPLETED_ONE_ATTEMPT_LOCKED` / `EXPIRED_AUTO_SUBMITTED_LOCKED`.
  - Resumes an active `IN_PROGRESS_RESUMABLE` attempt without resetting `expires_at`, or creates attempt `#1`.

### `GET /api/v1/attempts/:attemptId/session`
- **Auth**: `requireAuth`
- **Security**: Verifies `canAccessTest(user.id, attempt.test_id)` and returns `attempt`, `server_now`, `test`, `subject`, `answers`, and `SanitizedQuestion[]` (**strictly strips `correct_option` and `explanation`**). Auto-submits if `Date.now() >= expires_at`.

### `PUT /api/v1/attempts/:attemptId/answers`
- **Auth**: `requireAuth`
- **Body**: `{ question_id: string, selected_option: "A" | "B" | "C" | "D" | null, is_marked_for_review: boolean, is_visited?: boolean }`
- **Security**: Rejects updates if `attempt.status !== "in_progress"` or if `Date.now() >= expires_at`.

### `POST /api/v1/attempts/:attemptId/submit`
- **Auth**: `requireAuth`
- **Security**: Evaluates all answers on the backend (`+positive_marks` for correct, `-negative_marks` for incorrect, `0` for unanswered), records `submitted_at` and `time_taken_seconds`, and transitions status to `submitted`.

### `GET /api/v1/results/my?page=1&limit=50`
- **Auth**: `requireAuth`
- **Response**: `{ results, pagination }` — Paginated list of all examination attempts for the student.

### `GET /api/v1/results/:attemptId`
- **Auth**: `requireAuth`
- **Security**: Returns `403 Forbidden` if the attempt is still `in_progress` and unexpired. Once submitted, returns full `question_analysis` including `correct_option`, `selected_option`, `marks_awarded`, and `explanation`.

---

## 5. Administrator Endpoints (`requireAdmin`)

All `/api/v1/admin/*` endpoints enforce both authentication and `userProfile.role === "admin"`:
- `GET /api/v1/admin/overview` — Platform metrics, subject-wise revenue in paise, recent transactions, and recent attempts.
- `GET /api/v1/admin/subjects` & `PUT /api/v1/admin/subjects/:id` — Manage subject metadata, activation, and display order.
- `GET /api/v1/admin/tests?page=1&limit=250`, `POST /api/v1/admin/tests`, `PUT /api/v1/admin/tests/:id` — Create/update tests, durations, marking rules, and publication status.
- `GET /api/v1/admin/tests/:testId/questions`, `POST /api/v1/admin/questions`, `PUT /api/v1/admin/questions/:id`, `DELETE /api/v1/admin/questions/:id` — Full MCQ question bank CRUD with last-question deletion safeguard.
- `POST /api/v1/admin/excel/validate` & `POST /api/v1/admin/excel/import` — Two-step row-by-row Excel upload validation and duplicate-safe batch import.
- `GET /api/v1/admin/free-tests` & `PUT /api/v1/admin/free-tests` — Configure the 1 global free Sectional Test and 1 global free PYQ Test.
- `GET /api/v1/admin/packages` & `PUT /api/v1/admin/packages/:id` — Update subject-series package pricing in integer paise.
- `GET /api/v1/admin/students?page=1&limit=100` & `PUT /api/v1/admin/students/:id/status` — Inspect students and toggle `active`/`suspended` status.
- `GET /api/v1/admin/purchases?page=1&limit=100` & `POST /api/v1/admin/purchases/manual` — Inspect entitlements and perform audited manual grant/revoke actions.
- `GET /api/v1/admin/payments?page=1&limit=100` — Inspect payment orders and transactions.
- `GET /api/v1/admin/audit-logs?page=1&limit=100` — Inspect administrative audit trail and webhook events.
- `POST /api/v1/admin/migrations/run` — Execute non-destructive SQL migrations against PostgreSQL when `DATABASE_URL` or `PGHOST` is configured.
- `POST /api/v1/admin/verify-invariants` — Run the automated business rule verification suite.
