# PrimePrep — Database Design & Schema Reference (`docs/DATABASE.md`)

## 1. Current Persistence Architecture (Audit Status)
In the Google AI Studio runtime environment:
1. **Primary Relational Store (`/src/backend/store.ts` -> `.data/primeprep-db.json`)**: Persists all 13 relational tables on the server disk with atomic writes (`.tmp` + `fs.renameSync`) and enforces relational invariants, foreign-key existence checks, unique constraints, and seed data for the 7 subjects and 210 tests.
2. **Cloud Firestore (`ai-studio-09052841-f52f-4ec0-b49e-f4821c6666ad`)**: Synchronizes authenticated user profiles (`/users/{userId}`), administrator records (`/admins/{adminId}`), and student study bookmarks (`/bookmarks/{bookmarkId}`), protected by deployed Zero-Trust `firestore.rules`.
3. **PostgreSQL / Supabase Target Schema**: Below is the canonical PostgreSQL DDL schema with UUID/serial keys, foreign keys, unique constraints, check constraints, indexes, and Row Level Security (RLS) policies corresponding 1:1 to `/src/types/domain.ts`.

---

## 2. Relational Entities & Constraints (13 Tables)

### 2.1 `users` (Profiles)
- **Columns**:
  - `id` (`TEXT PRIMARY KEY` — linked to Auth UID)
  - `full_name` (`TEXT NOT NULL`)
  - `email` (`TEXT NOT NULL UNIQUE`)
  - `role` (`TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin'))`)
  - `account_status` (`TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'suspended'))`)
  - `created_at` (`TIMESTAMPTZ NOT NULL DEFAULT NOW()`)
  - `updated_at` (`TIMESTAMPTZ NOT NULL DEFAULT NOW()`)

### 2.2 `subjects`
- **Columns**:
  - `id` (`TEXT PRIMARY KEY`)
  - `name` (`TEXT NOT NULL UNIQUE`)
  - `slug` (`TEXT NOT NULL UNIQUE`)
  - `paper_code` (`TEXT NOT NULL`)
  - `description` (`TEXT NOT NULL`)
  - `is_active` (`BOOLEAN NOT NULL DEFAULT TRUE`)
  - `display_order` (`INTEGER NOT NULL`)
  - `created_at` (`TIMESTAMPTZ NOT NULL DEFAULT NOW()`)
  - `updated_at` (`TIMESTAMPTZ NOT NULL DEFAULT NOW()`)
- **Initial Seed (7 Subjects)**:
  1. Political Science (`political-science`, `HUQP18`)
  2. Philosophy (`philosophy`, `HUQP16`)
  3. Psychology (`psychology`, `HUQP20`)
  4. History (`history`, `HUQP09`)
  5. Economics (`economics`, `COQP10`)
  6. Geography (`geography`, `HUQP08`)
  7. Disaster Management (`disaster-management`, `COQP08`)

### 2.3 `categories` (Test Categories)
- **Columns**:
  - `id` (`TEXT PRIMARY KEY`)
  - `slug` (`TEXT NOT NULL UNIQUE CHECK (slug IN ('sectional', 'full_length', 'pyq'))`)
  - `name` (`TEXT NOT NULL UNIQUE`)
  - `description` (`TEXT NOT NULL`)
  - `default_duration_minutes` (`INTEGER NOT NULL CHECK (default_duration_minutes > 0)`)
  - `display_order` (`INTEGER NOT NULL`)

### 2.4 `tests`
- **Columns**:
  - `id` (`TEXT PRIMARY KEY`)
  - `subject_id` (`TEXT NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT`)
  - `category_id` (`TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT`)
  - `category_slug` (`TEXT NOT NULL CHECK (category_slug IN ('sectional', 'full_length', 'pyq'))`)
  - `title` (`TEXT NOT NULL`)
  - `test_number` (`INTEGER NOT NULL CHECK (test_number >= 1)`)
  - `description` (`TEXT NOT NULL`)
  - `duration_minutes` (`INTEGER NOT NULL CHECK (duration_minutes > 0)`)
  - `total_questions` (`INTEGER NOT NULL DEFAULT 0`)
  - `maximum_marks` (`NUMERIC(8,2) NOT NULL DEFAULT 0`)
  - `positive_marks` (`NUMERIC(5,2) NOT NULL DEFAULT 4`)
  - `negative_marks` (`NUMERIC(5,2) NOT NULL DEFAULT 1`)
  - `access_type` (`TEXT NOT NULL DEFAULT 'premium' CHECK (access_type IN ('free', 'premium'))`)
  - `publication_status` (`TEXT NOT NULL DEFAULT 'draft' CHECK (publication_status IN ('draft', 'published', 'unpublished'))`)
  - `display_order` (`INTEGER NOT NULL`)
  - `created_at` (`TIMESTAMPTZ NOT NULL DEFAULT NOW()`)
  - `updated_at` (`TIMESTAMPTZ NOT NULL DEFAULT NOW()`)
- **Indexes**: `idx_tests_subject_category (subject_id, category_slug, publication_status)`
- **No Chapter Concept**: Zero chapter columns or foreign keys exist.

### 2.5 `questions`
- **Columns**:
  - `id` (`TEXT PRIMARY KEY`)
  - `test_id` (`TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE`)
  - `question_text` (`TEXT NOT NULL`)
  - `question_type` (`TEXT NOT NULL DEFAULT 'mcq_single'`)
  - `option_a` (`TEXT NOT NULL`)
  - `option_b` (`TEXT NOT NULL`)
  - `option_c` (`TEXT NOT NULL`)
  - `option_d` (`TEXT NOT NULL`)
  - `correct_option` (`CHAR(1) NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D'))`)
  - `explanation` (`TEXT NOT NULL`)
  - `marks` (`NUMERIC(5,2) NOT NULL DEFAULT 4`)
  - `negative_marks` (`NUMERIC(5,2) NOT NULL DEFAULT 1`)
  - `display_order` (`INTEGER NOT NULL`)
  - `created_at` (`TIMESTAMPTZ NOT NULL DEFAULT NOW()`)
  - `updated_at` (`TIMESTAMPTZ NOT NULL DEFAULT NOW()`)
- **Indexes**: `idx_questions_test_order (test_id, display_order)`

### 2.6 `packages` (Subject-Series Packages)
- **Columns**:
  - `id` (`TEXT PRIMARY KEY`)
  - `subject_id` (`TEXT NOT NULL UNIQUE REFERENCES subjects(id) ON DELETE RESTRICT`)
  - `package_name` (`TEXT NOT NULL`)
  - `description` (`TEXT NOT NULL`)
  - `price_paise` (`INTEGER NOT NULL CHECK (price_paise >= 1000)`) — Stored strictly as integer paise (`49900` = ₹499)
  - `currency` (`TEXT NOT NULL DEFAULT 'INR' CHECK (currency = 'INR')`)
  - `is_available_for_sale` (`BOOLEAN NOT NULL DEFAULT TRUE`)
  - `created_at` (`TIMESTAMPTZ NOT NULL DEFAULT NOW()`)
  - `updated_at` (`TIMESTAMPTZ NOT NULL DEFAULT NOW()`)

### 2.7 `free_test_config`
- **Columns**:
  - `id` (`INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1)`) — Singleton configuration row
  - `free_sectional_test_id` (`TEXT NULL REFERENCES tests(id) ON DELETE SET NULL`)
  - `free_pyq_test_id` (`TEXT NULL REFERENCES tests(id) ON DELETE SET NULL`)
  - `updated_at` (`TIMESTAMPTZ NOT NULL DEFAULT NOW()`)
  - `updated_by` (`TEXT NOT NULL`)
- **Invariant**: Enforces at most 1 global free Sectional Test and 1 global free PYQ Test across all 7 subjects, and 0 free Full-Length Tests.

### 2.8 `payment_orders`
- **Columns**:
  - `id` (`TEXT PRIMARY KEY`)
  - `user_id` (`TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT`)
  - `package_id` (`TEXT NOT NULL REFERENCES packages(id) ON DELETE RESTRICT`)
  - `subject_id` (`TEXT NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT`)
  - `gateway` (`TEXT NOT NULL DEFAULT 'razorpay'`)
  - `gateway_order_id` (`TEXT NOT NULL UNIQUE`)
  - `expected_amount_paise` (`INTEGER NOT NULL CHECK (expected_amount_paise > 0)`)
  - `currency` (`TEXT NOT NULL DEFAULT 'INR'`)
  - `status` (`TEXT NOT NULL CHECK (status IN ('created', 'pending', 'paid', 'failed'))`)
  - `created_at` (`TIMESTAMPTZ NOT NULL DEFAULT NOW()`)
  - `updated_at` (`TIMESTAMPTZ NOT NULL DEFAULT NOW()`)

### 2.9 `payment_transactions`
- **Columns**:
  - `id` (`TEXT PRIMARY KEY`)
  - `order_id` (`TEXT NOT NULL REFERENCES payment_orders(id) ON DELETE RESTRICT`)
  - `user_id` (`TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT`)
  - `gateway_payment_id` (`TEXT NOT NULL UNIQUE`)
  - `payment_status` (`TEXT NOT NULL CHECK (payment_status IN ('authorized', 'captured', 'failed', 'pending'))`)
  - `verification_status` (`TEXT NOT NULL CHECK (verification_status IN ('verified', 'rejected', 'pending'))`)
  - `amount_paise` (`INTEGER NOT NULL`)
  - `currency` (`TEXT NOT NULL DEFAULT 'INR'`)
  - `gateway_reference` (`TEXT NOT NULL`)
  - `verified_at` (`TIMESTAMPTZ NULL`)
  - `created_at` (`TIMESTAMPTZ NOT NULL DEFAULT NOW()`)

### 2.10 `purchases` (Entitlements)
- **Columns**:
  - `id` (`TEXT PRIMARY KEY`)
  - `user_id` (`TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT`)
  - `package_id` (`TEXT NOT NULL REFERENCES packages(id) ON DELETE RESTRICT`)
  - `subject_id` (`TEXT NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT`)
  - `payment_transaction_id` (`TEXT NOT NULL`)
  - `entitlement_status` (`TEXT NOT NULL CHECK (entitlement_status IN ('active', 'revoked'))`)
  - `purchased_at` (`TIMESTAMPTZ NOT NULL DEFAULT NOW()`)
  - `created_at` (`TIMESTAMPTZ NOT NULL DEFAULT NOW()`)
  - `updated_at` (`TIMESTAMPTZ NOT NULL DEFAULT NOW()`)
- **Unique Constraint**: `UNIQUE (user_id, subject_id)` for active entitlements.

### 2.11 `attempts` (Test Attempts)
- **Columns**:
  - `id` (`TEXT PRIMARY KEY`)
  - `user_id` (`TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT`)
  - `test_id` (`TEXT NOT NULL REFERENCES tests(id) ON DELETE RESTRICT`)
  - `subject_id` (`TEXT NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT`)
  - `category_slug` (`TEXT NOT NULL`)
  - `attempt_number` (`INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number = 1)`)
  - `status` (`TEXT NOT NULL CHECK (status IN ('in_progress', 'submitted', 'expired_submitted'))`)
  - `started_at` (`TIMESTAMPTZ NOT NULL`)
  - `expires_at` (`TIMESTAMPTZ NOT NULL`)
  - `submitted_at` (`TIMESTAMPTZ NULL`)
  - `total_score` (`NUMERIC(8,2) NOT NULL DEFAULT 0`)
  - `maximum_marks` (`NUMERIC(8,2) NOT NULL DEFAULT 0`)
  - `correct_count` (`INTEGER NOT NULL DEFAULT 0`)
  - `incorrect_count` (`INTEGER NOT NULL DEFAULT 0`)
  - `unanswered_count` (`INTEGER NOT NULL DEFAULT 0`)
  - `time_taken_seconds` (`INTEGER NOT NULL DEFAULT 0`)
- **Unique Constraint**: `UNIQUE (user_id, test_id)` enforcing the strict one-attempt policy.

### 2.12 `attempt_answers`
- **Columns**:
  - `id` (`TEXT PRIMARY KEY`)
  - `attempt_id` (`TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE`)
  - `question_id` (`TEXT NOT NULL REFERENCES questions(id) ON DELETE RESTRICT`)
  - `selected_option` (`CHAR(1) NULL CHECK (selected_option IN ('A', 'B', 'C', 'D'))`)
  - `is_marked_for_review` (`BOOLEAN NOT NULL DEFAULT FALSE`)
  - `is_visited` (`BOOLEAN NOT NULL DEFAULT TRUE`)
  - `updated_at` (`TIMESTAMPTZ NOT NULL DEFAULT NOW()`)
- **Unique Constraint**: `UNIQUE (attempt_id, question_id)` preventing duplicate answer rows.

### 2.13 `audit_logs` & `webhook_events`
- `audit_logs`: Records `id`, `actor_id`, `actor_email`, `action`, `target_type`, `target_id`, `details`, `created_at`.
- `webhook_events`: Records `id`, `event_id` (`UNIQUE`), `event_type`, `gateway_order_id`, `processed_at` for idempotent webhook processing.
