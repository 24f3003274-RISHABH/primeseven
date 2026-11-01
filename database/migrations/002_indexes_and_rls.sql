-- ============================================================================
-- MIGRATION 002: INDEXES & ROW LEVEL SECURITY (RLS) POLICIES
-- Engine: PostgreSQL 15+ / Supabase PostgreSQL
-- ============================================================================

BEGIN;

-- 1. Performance Indexes on Frequently Queried Columns
CREATE INDEX IF NOT EXISTS idx_subjects_active_order ON subjects (is_active, display_order);
CREATE INDEX IF NOT EXISTS idx_tests_subject_category_pub ON tests (subject_id, category_slug, publication_status, display_order);
CREATE INDEX IF NOT EXISTS idx_tests_access_type ON tests (access_type) WHERE publication_status = 'published';
CREATE INDEX IF NOT EXISTS idx_questions_test_order ON questions (test_id, display_order);
CREATE INDEX IF NOT EXISTS idx_purchases_user_subject_active ON purchases (user_id, subject_id, entitlement_status);
CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_order ON payment_transactions (order_id, verification_status);
CREATE INDEX IF NOT EXISTS idx_attempts_user_subject ON attempts (user_id, subject_id, status);
CREATE INDEX IF NOT EXISTS idx_attempt_answers_attempt ON attempt_answers (attempt_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_bookmarks_user ON user_bookmarks (user_id, created_at DESC);

-- 2. Enable Row Level Security (RLS) on All Tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE free_test_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempt_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_bookmarks ENABLE ROW LEVEL SECURITY;

-- 3. Public Read Policies for Active Catalogue Metadata Only
DROP POLICY IF EXISTS public_read_active_subjects ON subjects;
CREATE POLICY public_read_active_subjects ON subjects
  FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS public_read_categories ON categories;
CREATE POLICY public_read_categories ON categories
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS public_read_published_tests ON tests;
CREATE POLICY public_read_published_tests ON tests
  FOR SELECT USING (publication_status = 'published');

DROP POLICY IF EXISTS public_read_packages ON packages;
CREATE POLICY public_read_packages ON packages
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS public_read_free_test_config ON free_test_config;
CREATE POLICY public_read_free_test_config ON free_test_config
  FOR SELECT USING (TRUE);

-- Note: `questions`, `attempts`, `attempt_answers`, `payment_orders`,
-- `payment_transactions`, and `purchases` have NO direct public SELECT policy
-- so that `correct_option` and `explanation` can never be scraped directly
-- from the client and are strictly mediated by the backend service layer.

INSERT INTO schema_migrations (version, name)
VALUES ('002', '002_indexes_and_rls.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
