# PrimePrep — Environment Variable Configuration Audit Report

## 1. Executive Summary & Security Verification

- **Frontend Exposure Check (`src/**`)**:
  - The frontend code (`src/api/client.ts`) reads **only one** environment variable: `import.meta.env.VITE_API_BASE_URL`.
  - **Zero** private keys, database passwords, JWT secrets, Razorpay secrets, or admin secrets are referenced or bundled in `/src` (verified via AST/source grep and automated check `#20` in `src/backend/__tests__/production-readiness.test.ts`).
- **Unused Variables Identified & Removed**:
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `ADMIN_SETUP_SECRET` are **not referenced anywhere** in the TypeScript source code and can be safely removed/omitted.

---

## 2. Specific Inspection of Requested Variables

| Variable Name | Status in Codebase | Required / Optional | Layer | Secret? | Configure In |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `DATABASE_URL` | **Used** (`src/backend/database/pg-pool.ts:15`) | **Required** (for PostgreSQL) | Backend | **Yes** (contains DB password) | Render (and AI Studio if connecting to external Postgres) |
| `PGSSLMODE` | **Used by `pg` driver** (native `libpq` env var read by `node-postgres`) | **Recommended / Optional** (`require` for Supabase) | Backend | No | Render |
| `JWT_SECRET` | **Used** (`src/backend/firebase-admin.ts:5`) | **Required** in production | Backend | **Yes** (signs/verifies HS256 JWTs) | Render, Google AI Studio |
| `SUPABASE_JWT_SECRET` | **Used** (`src/backend/firebase-admin.ts:4`) | **Optional** (precedence over `JWT_SECRET`) | Backend | **Yes** | Render (only if verifying Supabase-issued JWTs) |
| `CORS_ORIGIN` | **Used** (`server.ts:48`) | **Required** when Frontend & Backend are on different domains | Backend | No | Render |
| `VITE_API_BASE_URL` | **Used** (`src/api/client.ts:47`) | **Required on Vercel** / Optional on single-host | Frontend | No | Vercel |
| `NODE_ENV` | **Used** (`server.ts:305`, `server.ts:2583`) | **Required** (`production` in cloud deployments) | Backend / Build | No | Render, Vercel (auto-set) |
| `SUPABASE_URL` | **UNUSED** | Not used — Remove | N/A | No | None (Remove) |
| `SUPABASE_ANON_KEY` | **UNUSED** | Not used — Remove | N/A | No (public anon key) | None (Remove) |
| `VITE_SUPABASE_URL` | **UNUSED** | Not used — Remove | N/A | No | None (Remove) |
| `VITE_SUPABASE_ANON_KEY` | **UNUSED** | Not used — Remove | N/A | No | None (Remove) |
| `ADMIN_SETUP_SECRET` | **UNUSED** | Not used — Remove | N/A | Yes (if used) | None (Remove) |

---

## 3. Detailed Breakdown of Every Variable

### A. Actively Used Variables (12 Variables)

#### 1. `DATABASE_URL`
1. **Exact variable name**: `DATABASE_URL`
2. **Required or optional**: **Required** for production PostgreSQL persistence on Render (optional in local/AI Studio preview, where `.data/primeprep-db.json` provides an automatic local fallback).
3. **Frontend or backend**: **Backend** (`src/backend/database/pg-pool.ts`, line 15).
4. **Where to obtain its value**: Supabase Dashboard → **Project Settings** → **Database** → **Connection string** → **URI** (use the Transaction/Session Pooler URI on port `6543` or `5432` and replace `[YOUR-PASSWORD]` with your database password).
5. **Contains a secret?**: **Yes** — embeds the PostgreSQL database password.
6. **Where to configure**: **Render** (Backend Web Service Environment Variables). Can also be set in **Google AI Studio** Secrets if you want the preview environment to connect directly to Supabase PostgreSQL.
7. **Can an existing variable be reused?**: Yes — if you already have your Supabase PostgreSQL URI, use it directly. Do not set discrete `PGHOST`/`PGPASSWORD` variables if `DATABASE_URL` is provided.

#### 2. `PGSSLMODE`
1. **Exact variable name**: `PGSSLMODE`
2. **Required or optional**: **Optional / Recommended** (set to `require` when connecting to Supabase PostgreSQL over TLS).
3. **Frontend or backend**: **Backend** (consumed natively by the `pg` / `node-postgres` connection parser when initializing `new Pool({ connectionString })`).
4. **Where to obtain its value**: Literal string `"require"`.
5. **Contains a secret?**: **No**.
6. **Where to configure**: **Render**.
7. **Can an existing variable be reused?**: Alternatively, you can append `?sslmode=require` directly to the end of `DATABASE_URL`.

#### 3. `JWT_SECRET`
1. **Exact variable name**: `JWT_SECRET`
2. **Required or optional**: **Required in production** (falls back to a development test key only in local/test mode).
3. **Frontend or backend**: **Backend** (`src/backend/firebase-admin.ts`, line 5).
4. **Where to obtain its value**: Generate a strong 64-character random hex string (e.g., `openssl rand -hex 32`) or let Render auto-generate it (`generateValue: true` in `render.yaml`).
5. **Contains a secret?**: **Yes** — used to sign and verify all candidate and admin HS256 session tokens (`POST /api/v1/auth/login` and `POST /api/v1/auth/register`).
6. **Where to configure**: **Render** (and **Google AI Studio** Secrets if running production auth tests). Never configure in Vercel.
7. **Can an existing variable be reused?**: If you set `SUPABASE_JWT_SECRET`, the backend (`src/backend/firebase-admin.ts:4-5`) automatically uses `SUPABASE_JWT_SECRET || JWT_SECRET`. Thus, a single secret in either variable is sufficient.

#### 4. `SUPABASE_JWT_SECRET`
1. **Exact variable name**: `SUPABASE_JWT_SECRET`
2. **Required or optional**: **Optional** (only needed if you want the backend to verify JWTs issued directly by Supabase Auth in addition to PrimePrep's own `/api/v1/auth/login` endpoint).
3. **Frontend or backend**: **Backend** (`src/backend/firebase-admin.ts`, line 4).
4. **Where to obtain its value**: Supabase Dashboard → **Project Settings** → **API** → **JWT Settings** → **JWT Secret**.
5. **Contains a secret?**: **Yes** — signing key for Supabase JWTs.
6. **Where to configure**: **Render** (Backend only).
7. **Can an existing variable be reused?**: Yes — if you set `SUPABASE_JWT_SECRET`, you do not need a separate `JWT_SECRET` (or vice versa), because `src/backend/firebase-admin.ts` evaluates `process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET`.

#### 5. `CORS_ORIGIN`
1. **Exact variable name**: `CORS_ORIGIN`
2. **Required or optional**: **Required in production** when the frontend (Vercel) and backend (Render) are hosted on separate domains; optional in single-origin development.
3. **Frontend or backend**: **Backend** (`server.ts`, line 48).
4. **Where to obtain its value**: Your deployed Vercel production URL (e.g., `https://primeprep.vercel.app`, with no trailing slash).
5. **Contains a secret?**: **No**.
6. **Where to configure**: **Render**.
7. **Can an existing variable be reused?**: No.

#### 6. `VITE_API_BASE_URL`
1. **Exact variable name**: `VITE_API_BASE_URL`
2. **Required or optional**: **Required on Vercel** (so frontend `fetch` requests target your Render backend); **Leave empty/unset in Google AI Studio** where frontend and backend share port `3000`.
3. **Frontend or backend**: **Frontend** (`src/api/client.ts`, line 47).
4. **Where to obtain its value**: Your deployed Render Web Service URL (e.g., `https://primeprep-backend.onrender.com`, with no trailing slash).
5. **Contains a secret?**: **No** (public backend URL embedded into client bundle at build time).
6. **Where to configure**: **Vercel** (Project Settings → Environment Variables). Do **not** set in Render.
7. **Can an existing variable be reused?**: No.

#### 7. `NODE_ENV`
1. **Exact variable name**: `NODE_ENV`
2. **Required or optional**: **Required** (`production` in cloud deployments, `development` locally).
3. **Frontend or backend**: **Backend & Build Toolchain** (`server.ts`, lines 305 and 2583). In `server.ts:305`, `NODE_ENV === 'production'` restricts `/api/v1/auth/switch-role` strictly to the bootstrap admin (`rishabhkesharwani8218@gmail.com`) or existing admins. In `server.ts:2583`, it switches Express from Vite dev middleware to serving compiled static assets from `dist/`.
4. **Where to obtain its value**: Literal string `"production"` (or `"development"`).
5. **Contains a secret?**: **No**.
6. **Where to configure**: **Render** and **Vercel** (both platforms set `NODE_ENV=production` automatically by default).
7. **Can an existing variable be reused?**: Platform-provided default.

#### 8. `PORT`
1. **Exact variable name**: `PORT`
2. **Required or optional**: **Optional** (defaults to `3000` in `server.ts`, line 26).
3. **Frontend or backend**: **Backend** (`server.ts`, line 26).
4. **Where to obtain its value**: In Google AI Studio, must remain `3000`. On Render, Render automatically injects `PORT` (typically `10000`).
5. **Contains a secret?**: **No**.
6. **Where to configure**: Automatically managed by **Google AI Studio** (`3000`) and **Render** (`10000`).
7. **Can an existing variable be reused?**: Platform-provided default.

#### 9. `RAZORPAY_KEY_ID`
1. **Exact variable name**: `RAZORPAY_KEY_ID`
2. **Required or optional**: **Required for live/test Razorpay checkout** (has a safe test-mode fallback `'rzp_test_primeprep_cuetpg'` in `server.ts:27`).
3. **Frontend or backend**: **Backend** (`server.ts`, line 27; sent to the frontend safely inside the order payload of `POST /api/v1/payments/create-order`).
4. **Where to obtain its value**: Razorpay Dashboard → **Account & Settings** → **API Keys** → **Key ID** (Test Mode starts with `rzp_test_...`).
5. **Contains a secret?**: **No** (public merchant identifier, though paired with `RAZORPAY_KEY_SECRET`).
6. **Where to configure**: **Render** and **Google AI Studio**.
7. **Can an existing variable be reused?**: No.

#### 10. `RAZORPAY_KEY_SECRET`
1. **Exact variable name**: `RAZORPAY_KEY_SECRET`
2. **Required or optional**: **Required** (`server.ts`, line 28; `src/backend/firebase-admin.ts`, lines 6 & 58).
3. **Frontend or backend**: **Backend only** — verifies `razorpay_signature` via HMAC-SHA256 on payment completion (`POST /api/v1/payments/verify`).
4. **Where to obtain its value**: Razorpay Dashboard → **Account & Settings** → **API Keys** → **Key Secret**.
5. **Contains a secret?**: **Yes — High-sensitivity private key**. Never expose to Vercel or frontend code.
6. **Where to configure**: **Render** and **Google AI Studio**.
7. **Can an existing variable be reused?**: No.

#### 11. `RAZORPAY_WEBHOOK_SECRET`
1. **Exact variable name**: `RAZORPAY_WEBHOOK_SECRET`
2. **Required or optional**: **Required for Razorpay webhooks** (`server.ts`, line 30).
3. **Frontend or backend**: **Backend only** — verifies `x-razorpay-signature` header on `POST /api/v1/payments/webhook`.
4. **Where to obtain its value**: Razorpay Dashboard → **Account & Settings** → **Webhooks** → **Webhook Secret**.
5. **Contains a secret?**: **Yes — High-sensitivity private key**.
6. **Where to configure**: **Render** and **Google AI Studio**.
7. **Can an existing variable be reused?**: No (should be distinct from `RAZORPAY_KEY_SECRET`).

#### 12. Discrete PostgreSQL Fallbacks (`PGHOST` / `SQL_HOST`, `PGPORT`, `PGUSER` / `SQL_USER`, `PGPASSWORD` / `SQL_PASSWORD`, `PGDATABASE` / `SQL_DB_NAME`) & `DISABLE_HMR`
- **Status**: Optional fallbacks in `src/backend/database/pg-pool.ts` (lines 16–34) and AI Studio runtime control in `vite.config.ts` (lines 17–19).
- **Reuse**: Completely bypassed when `DATABASE_URL` is configured. You do **not** need to configure these on Render or Vercel when using Supabase `DATABASE_URL`.

---

### B. Unused Variables Inspected (Can Be Safely Removed)

1. **`SUPABASE_URL` & `VITE_SUPABASE_URL`**
   - **Used in codebase?**: **No**. PrimePrep connects to Supabase PostgreSQL directly from the Express backend via `DATABASE_URL` (`pg` pool) rather than calling Supabase REST APIs from the browser or backend.
   - **Recommendation**: **Remove** from `.env`, Render, and Vercel.
2. **`SUPABASE_ANON_KEY` & `VITE_SUPABASE_ANON_KEY`**
   - **Used in codebase?**: **No**. Frontend requests authenticate against the Express backend (`/api/v1/*`) using Bearer JWTs rather than querying Supabase PostgREST directly from client code.
   - **Recommendation**: **Remove** from `.env`, Render, and Vercel.
3. **`ADMIN_SETUP_SECRET`**
   - **Used in codebase?**: **No**. Admin authorization is enforced by the backend RBAC middleware (`requireAdmin` in `src/backend/middleware.ts`) and bootstrap admin email check (`rishabhkesharwani8218@gmail.com` in `server.ts`), with zero backdoor setup-secret routes.
   - **Recommendation**: **Remove** — not used anywhere in the codebase.
