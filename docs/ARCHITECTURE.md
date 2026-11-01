# PrimePrep — System Architecture (`docs/ARCHITECTURE.md`)

## 1. Architectural Pattern
PrimePrep is structured as a **full-stack modular monolith** in TypeScript running on Node.js (`server.ts`) with a React 19 + Vite SPA frontend (`/src`).

```text
primeprep/
├── server.ts                                 # Express API server, Zod validation, Razorpay HMAC, Vite middleware
├── firebase-blueprint.json                   # Firestore entity & collection schema blueprint
├── firestore.rules                           # Deployed ABAC security rules for Firestore collections
├── firestore.rules.test.ts                   # Dirty-Dozen adversarial test specification
├── security_spec.md                          # Security invariants specification
├── src/
│   ├── types/
│   │   └── domain.ts                         # Canonical TypeScript interfaces for all 13 domain entities
│   ├── backend/
│   │   ├── store.ts                          # Relational datastore (.data/primeprep-db.json) & 210-test seed engine
│   │   ├── firebase-admin.ts                 # Server-side Firebase Admin token verification initializer
│   │   └── middleware.ts                     # requireAuth, optionalAuth, and requireAdmin guards
│   ├── api/
│   │   └── client.ts                         # Typed fetch wrapper attaching Bearer ID tokens from memory
│   ├── lib/
│   │   └── firebase.ts                       # Client Firebase Auth, Firestore sync, and handleFirestoreError
│   ├── context/
│   │   └── AuthContext.tsx                   # Session provider, Google OAuth popup login, role context
│   ├── components/
│   │   └── layout/
│   │       ├── Navbar.tsx                    # 3-zone Top Bar navigation
│   │       └── Footer.tsx                    # Institutional footer
│   └── pages/
│       ├── public/
│       │   ├── LandingPage.tsx               # Live stats, 7 subjects overview, 2 global free diagnostic tests
│       │   └── FreeTestsPage.tsx             # Dedicated global free tests catalogue
│       ├── auth/
│       │   └── AuthPage.tsx                  # Google OAuth sign-in with redirect destination preservation
│       ├── student/
│       │   ├── StudentDashboardPage.tsx      # Candidate overview, unlocked vs locked series, bookmarks
│       │   ├── SubjectsCataloguePage.tsx     # 7 subjects catalogue with search and purchase filter
│       │   ├── SubjectDetailPage.tsx         # 3 categories (Sectional, Full-Length, PYQ), history, lock redirect
│       │   ├── SubjectPurchasePage.tsx       # Complete subject-series package & Razorpay Test Mode checkout
│       │   ├── TestInstructionsPage.tsx      # Marking rules (+4/-1/0), palette legend, start/resume gate
│       │   ├── ExaminationHallPage.tsx       # CBT engine, server-calibrated countdown, 5-state palette
│       │   ├── ResultDetailPage.tsx          # Post-submission scorecard & question-wise solutions
│       │   ├── MyResultsPage.tsx             # Consolidated results across subjects with Recharts trends
│       │   └── MyPurchasesPage.tsx           # Active subject entitlements & payment transaction ledger
│       └── admin/
│           └── AdminDashboardPage.tsx        # 13-module Administrator Console & invariant verifier
└── docs/
    ├── ARCHITECTURE.md
    ├── DATABASE.md
    ├── API.md
    └── IMPLEMENTATION_STATUS.md
```

---

## 2. Layer Separation & Responsibilities

### 2.1 Frontend Presentation Layer (`/src/pages`, `/src/components`)
- **Zero Direct Database Access**: UI components never read or mutate backend data stores directly; all catalogue, examination, payment, and administrative operations pass through `/api/v1/*` via `apiRequest` (`/src/api/client.ts`).
- **Zero Client-Side Score or Price Calculation**: Scores, percentages, accuracies, and payable package amounts in paise are computed exclusively by the backend.
- **Zero Chapter Navigation**: Student navigation strictly follows:
  `Subjects → Test Categories (Sectional / Full-Length / PYQ) → Individual Tests → Test Instructions → Examination → Results`.

### 2.2 API & Authentication Layer (`/src/backend/middleware.ts`, `/src/api/client.ts`)
- **Token Transport**: Client retrieves Firebase ID tokens dynamically in memory (`auth.currentUser.getIdToken()`) and passes `Authorization: Bearer <token>`. Tokens are never stored in `localStorage`.
- **Server Verification**: `requireAuth` and `requireAdmin` verify the JWT via `firebase-admin` (`adminAuth.verifyIdToken`), synchronize the user profile, enforce `account_status === 'active'`, and verify `role === 'admin'` for administrative endpoints.

### 2.3 Business Logic & Persistence Layer (`/server.ts`, `/src/backend/store.ts`)
- **Catalogue Integrity**: Seeds and maintains 7 CUET PG subjects, 3 test categories, and 210 initial published tests (15 Sectional, 10 Full-Length, 5 PYQ per subject).
- **Global Free-Test Invariant**: `enforceGlobalFreeTestInvariants()` guarantees at most 1 globally designated free Sectional Test and 1 globally designated free PYQ Test across the entire platform, with 0 free Full-Length Tests.
- **Subject-Wise Entitlement Gate**: `canUserAccessTest(userId, test)` verifies that `test.publication_status === 'published'` and either `test.access_type === 'free'` or `hasSubjectEntitlement(userId, test.subject_id)` is true.
- **Authoritative Examination Engine**:
  - Enforces a strict one-attempt policy per `(user_id, test_id)`.
  - Computes `started_at` and `expires_at` on the server and returns `server_now` so the frontend calibrates for any client clock drift.
  - Strips `correct_option` and `explanation` from pre-submission question payloads.
  - Evaluates `+4 / -1 / 0` marking on the backend upon submission or deadline expiry.
- **Cryptographic Payment Verification**:
  - Prices are stored and verified strictly in integer paise (`INR`).
  - Verifies Razorpay `HMAC-SHA256(order_id + "|" + payment_id, RAZORPAY_KEY_SECRET)` and webhook signatures (`RAZORPAY_WEBHOOK_SECRET`) with idempotent `webhook_events` deduplication.
