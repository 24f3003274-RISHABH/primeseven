# Deploying PrimePrep with Supabase, Render & Vercel (No Firebase)

Firebase has been completely disconnected from PrimePrep. The platform now uses:
- **Supabase PostgreSQL** (`DATABASE_URL`) for the relational database and study bookmarks (`user_bookmarks`).
- **JWT / Supabase Auth** (`POST /api/v1/auth/register`, `POST /api/v1/auth/login`, and `SUPABASE_JWT_SECRET` / `JWT_SECRET` verification) for candidate and administrator authentication.
- **Render** for the Node.js + Express + TypeScript backend (`server.ts`).
- **Vercel** for the React 19 + Vite + Tailwind CSS SPA frontend (`dist`).

---

## 1. Set Up Supabase PostgreSQL Database

1. Open your project in the [Supabase Dashboard](https://supabase.com/dashboard).
2. Go to **SQL Editor** and run the migrations in order:
   - Run `/database/migrations/001_initial_schema.sql` (creates all 15 relational tables including `users`, `subjects`, `test_categories`, `tests`, `questions`, `packages`, `free_test_configs`, `payment_orders`, `payment_transactions`, `purchases`, `attempts`, `attempt_answers`, `audit_logs`, `webhook_events`, and `user_bookmarks`).
   - Run `/database/migrations/002_indexes_and_rls.sql` (creates composite indexes and Row-Level Security policies).
   - Run `/database/seeds/001_initial_catalogue_seed.sql` (seeds all 7 CUET PG subjects, 3 categories, 210 tests, 7 subject packages, and the 2 globally designated free tests).
3. Go to **Project Settings -> Database** and copy your **Connection String (URI)** (`DATABASE_URL`).
4. (Optional) Go to **Project Settings -> API** and copy your **JWT Secret** (`SUPABASE_JWT_SECRET`) if you also want the backend to accept tokens minted directly by Supabase Auth.

---

## 2. Deploy Backend to Render

1. Push this repository to GitHub/GitLab.
2. In the [Render Dashboard](https://dashboard.render.com), click **New + -> Web Service** (or **Blueprint** to auto-detect `render.yaml`).
3. Configure the service:
   - **Build Command**: `npm install`
   - **Start Command**: `npm run start`
   - **Health Check Path**: `/api/v1/health`
4. Add the following Environment Variables in Render:
   - `DATABASE_URL`: Your Supabase PostgreSQL URI
   - `PGSSLMODE`: `require`
   - `JWT_SECRET`: Any strong 64-character random string
   - `SUPABASE_JWT_SECRET`: *(Optional)* Your Supabase JWT Secret
   - `CORS_ORIGIN`: Your Vercel frontend URL (e.g., `https://primeprep.vercel.app`)
   - `RAZORPAY_KEY_ID`: Your Razorpay Test/Live Key ID
   - `RAZORPAY_KEY_SECRET`: Your Razorpay Test/Live Key Secret
   - `RAZORPAY_WEBHOOK_SECRET`: Your Razorpay Webhook Secret
5. Once deployed, copy your Render service URL (e.g., `https://primeprep-backend.onrender.com`).

---

## 3. Deploy Frontend to Vercel

1. In the [Vercel Dashboard](https://vercel.com/dashboard), click **Add New -> Project** and import your repository.
2. Vercel will automatically detect `vercel.json` (`framework: vite`, `buildCommand: npm run build`, `outputDirectory: dist`, and SPA rewrite rules).
3. Add the following Environment Variable in Vercel:
   - `VITE_API_BASE_URL`: Your Render backend URL (e.g., `https://primeprep-backend.onrender.com`) — **no trailing slash**.
4. Click **Deploy**. All `/api/v1/...` requests from the Vercel frontend will automatically route to your Render backend with `Authorization: Bearer <token>` headers.
