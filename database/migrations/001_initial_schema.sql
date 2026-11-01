-- ============================================================================
-- MIGRATION 001: PRIMEPREP INITIAL RELATIONAL SCHEMA (NON-DESTRUCTIVE)
-- Engine: PostgreSQL 15+ / Supabase PostgreSQL
-- Rules:
--   1. All CREATE TABLE statements use IF NOT EXISTS (non-destructive).
--   2. Zero chapter tables or chapter columns.
--   3. All monetary columns use INTEGER paise (never floating point).
--   4. Enforces foreign keys, unique constraints, and check constraints.
-- ============================================================================

BEGIN;

-- Migration Ledger Table
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Automatic updated_at Trigger Function
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. Profiles / Users Table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, -- Linked to Auth User UID
  full_name TEXT NOT NULL CHECK (char_length(trim(full_name)) >= 1 AND char_length(full_name) <= 120),
  email TEXT NOT NULL UNIQUE CHECK (char_length(email) >= 3 AND char_length(email) <= 254),
  password_hash TEXT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT NULL;

DROP TRIGGER IF EXISTS set_users_updated_at ON users;
CREATE TRIGGER set_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 2. Subjects Table (7 Initial CUET PG Subjects)
CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK (char_length(trim(name)) >= 2),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9\-]+$'),
  paper_code TEXT NOT NULL,
  description TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL CHECK (display_order >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_subjects_updated_at ON subjects;
CREATE TRIGGER set_subjects_updated_at
BEFORE UPDATE ON subjects
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 3. Test Categories Table (Sectional, Full-Length, PYQ)
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE CHECK (slug IN ('sectional', 'full_length', 'pyq')),
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  default_duration_minutes INTEGER NOT NULL CHECK (default_duration_minutes > 0 AND default_duration_minutes <= 300),
  display_order INTEGER NOT NULL CHECK (display_order >= 1)
);

-- 4. Tests Table (No chapter fields; premium by default)
CREATE TABLE IF NOT EXISTS tests (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  category_slug TEXT NOT NULL CHECK (category_slug IN ('sectional', 'full_length', 'pyq')),
  title TEXT NOT NULL CHECK (char_length(trim(title)) >= 3),
  test_number INTEGER NOT NULL CHECK (test_number >= 1),
  description TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes >= 5 AND duration_minutes <= 300),
  total_questions INTEGER NOT NULL DEFAULT 0 CHECK (total_questions >= 0),
  maximum_marks NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (maximum_marks >= 0),
  positive_marks NUMERIC(5,2) NOT NULL DEFAULT 4 CHECK (positive_marks > 0),
  negative_marks NUMERIC(5,2) NOT NULL DEFAULT 1 CHECK (negative_marks >= 0),
  access_type TEXT NOT NULL DEFAULT 'premium' CHECK (access_type IN ('free', 'premium')),
  publication_status TEXT NOT NULL DEFAULT 'draft' CHECK (publication_status IN ('draft', 'published', 'unpublished')),
  display_order INTEGER NOT NULL CHECK (display_order >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_tests_updated_at ON tests;
CREATE TRIGGER set_tests_updated_at
BEFORE UPDATE ON tests
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 5. Questions Table (correct_option and explanation protected on server)
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  test_id TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL CHECK (char_length(trim(question_text)) >= 5),
  question_type TEXT NOT NULL DEFAULT 'mcq_single' CHECK (question_type IN ('mcq_single')),
  option_a TEXT NOT NULL CHECK (char_length(trim(option_a)) >= 1),
  option_b TEXT NOT NULL CHECK (char_length(trim(option_b)) >= 1),
  option_c TEXT NOT NULL CHECK (char_length(trim(option_c)) >= 1),
  option_d TEXT NOT NULL CHECK (char_length(trim(option_d)) >= 1),
  correct_option CHAR(1) NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D')),
  explanation TEXT NOT NULL CHECK (char_length(trim(explanation)) >= 3),
  marks NUMERIC(5,2) NOT NULL DEFAULT 4 CHECK (marks > 0),
  negative_marks NUMERIC(5,2) NOT NULL DEFAULT 1 CHECK (negative_marks >= 0),
  display_order INTEGER NOT NULL CHECK (display_order >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_questions_updated_at ON questions;
CREATE TRIGGER set_questions_updated_at
BEFORE UPDATE ON questions
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 6. Subject-Series Packages Table (One standard package per subject; integer paise)
CREATE TABLE IF NOT EXISTS packages (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL UNIQUE REFERENCES subjects(id) ON DELETE RESTRICT,
  package_name TEXT NOT NULL,
  description TEXT NOT NULL,
  price_paise INTEGER NOT NULL CHECK (price_paise >= 1000), -- e.g. 49900 = ₹499.00
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  is_available_for_sale BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_packages_updated_at ON packages;
CREATE TRIGGER set_packages_updated_at
BEFORE UPDATE ON packages
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 7. Global Free-Test Configuration Table (Singleton row id = 1)
CREATE TABLE IF NOT EXISTS free_test_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  free_sectional_test_id TEXT NULL REFERENCES tests(id) ON DELETE SET NULL,
  free_pyq_test_id TEXT NULL REFERENCES tests(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL
);

-- 8. Payment Orders Table
CREATE TABLE IF NOT EXISTS payment_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  package_id TEXT NOT NULL REFERENCES packages(id) ON DELETE RESTRICT,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  gateway TEXT NOT NULL DEFAULT 'razorpay' CHECK (gateway IN ('razorpay')),
  gateway_order_id TEXT NOT NULL UNIQUE,
  expected_amount_paise INTEGER NOT NULL CHECK (expected_amount_paise >= 1000),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('created', 'pending', 'paid', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_payment_orders_updated_at ON payment_orders;
CREATE TRIGGER set_payment_orders_updated_at
BEFORE UPDATE ON payment_orders
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 9. Payment Transactions Table
CREATE TABLE IF NOT EXISTS payment_transactions (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES payment_orders(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  gateway_payment_id TEXT NOT NULL UNIQUE,
  payment_status TEXT NOT NULL CHECK (payment_status IN ('authorized', 'captured', 'failed', 'pending')),
  verification_status TEXT NOT NULL CHECK (verification_status IN ('verified', 'rejected', 'pending')),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  gateway_reference TEXT NOT NULL,
  verified_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Purchases / Entitlements Table (Unique active user-subject package entitlement)
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  package_id TEXT NOT NULL REFERENCES packages(id) ON DELETE RESTRICT,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  payment_transaction_id TEXT NOT NULL,
  entitlement_status TEXT NOT NULL DEFAULT 'active' CHECK (entitlement_status IN ('active', 'revoked')),
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_subject_entitlement UNIQUE (user_id, subject_id)
);

DROP TRIGGER IF EXISTS set_purchases_updated_at ON purchases;
CREATE TRIGGER set_purchases_updated_at
BEFORE UPDATE ON purchases
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 11. Test Attempts Table (Strict One-Attempt Constraint on user_id + test_id)
CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  test_id TEXT NOT NULL REFERENCES tests(id) ON DELETE RESTRICT,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  category_slug TEXT NOT NULL CHECK (category_slug IN ('sectional', 'full_length', 'pyq')),
  attempt_number INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number = 1),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'expired_submitted')),
  started_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ NULL,
  total_score NUMERIC(8,2) NOT NULL DEFAULT 0,
  maximum_marks NUMERIC(8,2) NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  incorrect_count INTEGER NOT NULL DEFAULT 0 CHECK (incorrect_count >= 0),
  unanswered_count INTEGER NOT NULL DEFAULT 0 CHECK (unanswered_count >= 0),
  time_taken_seconds INTEGER NOT NULL DEFAULT 0 CHECK (time_taken_seconds >= 0),
  CONSTRAINT uq_one_attempt_per_user_test UNIQUE (user_id, test_id)
);

-- 12. Attempt Answers Table (Unique constraint on attempt_id + question_id)
CREATE TABLE IF NOT EXISTS attempt_answers (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  selected_option CHAR(1) NULL CHECK (selected_option IN ('A', 'B', 'C', 'D')),
  is_marked_for_review BOOLEAN NOT NULL DEFAULT FALSE,
  is_visited BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_attempt_question_answer UNIQUE (attempt_id, question_id)
);

-- 13. Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. Webhook Events Table (Idempotency Ledger)
CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  gateway_order_id TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. User Study Bookmarks Table (Replaces Firestore bookmarks in Supabase PostgreSQL)
CREATE TABLE IF NOT EXISTS user_bookmarks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  test_id TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_test_bookmark UNIQUE (user_id, test_id)
);

DROP TRIGGER IF EXISTS set_user_bookmarks_updated_at ON user_bookmarks;
CREATE TRIGGER set_user_bookmarks_updated_at
BEFORE UPDATE ON user_bookmarks
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO schema_migrations (version, name)
VALUES ('001', '001_initial_schema.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
