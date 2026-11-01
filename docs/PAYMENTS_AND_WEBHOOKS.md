# PrimePrep — Razorpay Payment System, Webhook Setup & Environment Variables (`docs/PAYMENTS_AND_WEBHOOKS.md`)

## 1. Subject-Wise Complete Series Entitlement Model

- **Product Sold**: Students purchase the **complete test series for a subject** (`SubjectPackage`), never an individual test.
- **Subject Isolation**: A verified purchase for Political Science (`HUQP18`) unlocks all eligible premium Political Science tests (`15 Sectional + 10 Full-Length + 5 PYQ = 30 tests`) and **zero** tests in Philosophy, Economics, History, English, Sociology, or Geography & General Paper.
- **Global Free Diagnostic Tests**: Exactly two tests across the entire platform are globally designated as free:
  1. One global free Sectional Test (`free_sectional_test_id`)
  2. One global free PYQ Test (`free_pyq_test_id`)
  All Full-Length Tests and all other Sectional and PYQ Tests are `premium` by default.

---

## 2. Server-Authoritative Razorpay Checkout Flow

1. **Order Creation (`POST /api/v1/payments/create-order`)**:
   - Client sends `{ package_id }`.
   - Server fetches `price_paise` strictly from PostgreSQL / backend store (never trusts client-supplied amounts).
   - Server checks `store.hasSubjectEntitlement(user.id, pkg.subject_id)` and returns `409 Conflict` if already owned.
   - Server creates a `pending` `PaymentOrder` and returns `{ order, razorpay_config }`.
2. **Cryptographic Payment Verification (`POST /api/v1/payments/verify`)**:
   - Verifies `order.user_id === req.userProfile.id` (prevents cross-user order hijacking).
   - Verifies `amount_paise === order.expected_amount_paise` (rejects price tampering).
   - Computes `HMAC_SHA256(razorpay_order_id + "|" + razorpay_payment_id, RAZORPAY_KEY_SECRET)` and compares with `razorpay_signature`.
   - Only when signature and amount match does the server mark the order `paid`, record a `verified` + `captured` `PaymentTransaction`, and insert an `active` `PurchaseEntitlement`.
3. **Pending & Failed States**:
   - `pending` payments record a `pending` transaction and do **not** create a `PurchaseEntitlement`.
   - `failed` or signature-mismatched payments mark the order `failed` and transaction `rejected` with an audit log entry.

---

## 3. Razorpay Webhook Setup (`POST /api/v1/payments/webhook`)

### How to Configure in Razorpay Dashboard:
1. Open **Razorpay Dashboard → Settings → Webhooks → + Add New Webhook**.
2. **Webhook URL**: `https://<YOUR_DEPLOYMENT_DOMAIN>/api/v1/payments/webhook`
3. **Secret**: Set a strong secret string and configure the exact same value in the backend environment variable `RAZORPAY_WEBHOOK_SECRET`.
4. **Active Events**: Enable `payment.captured` and `payment.failed`.

### Webhook Security & Idempotency:
- Express captures the exact raw request body (`req.rawBody`) prior to JSON parsing.
- The endpoint verifies `x-razorpay-signature` using `HMAC-SHA256(req.rawBody, RAZORPAY_WEBHOOK_SECRET)`.
- Each processed `event_id` is stored in `webhook_events` (`UNIQUE(event_id)`). Duplicate webhook deliveries return `{ status: "duplicate_ignored" }` without creating duplicate transactions or entitlements.

---

## 4. Required Environment Variables (`.env`)

| Variable | Scope | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | Server | `development` or `production` |
| `PORT` | Server | HTTP port (`3000`) |
| `RAZORPAY_KEY_ID` | Server | Razorpay Key ID (e.g., `rzp_test_...`) returned by `/api/v1/payments/create-order` |
| `RAZORPAY_KEY_SECRET` | **Server-Only Secret** | Razorpay Key Secret used for `HMAC-SHA256` signature verification. Never exposed to frontend. |
| `RAZORPAY_WEBHOOK_SECRET` | **Server-Only Secret** | Secret used to verify `x-razorpay-signature` on `/api/v1/payments/webhook`. Never exposed to frontend. |
| `DATABASE_URL` | **Server-Only Secret** | PostgreSQL connection string (`postgresql://user:pass@host:5432/primeprep`) |
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | **Server-Only Secret** | Discrete PostgreSQL connection parameters (alternative to `DATABASE_URL`) |
