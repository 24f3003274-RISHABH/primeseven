-- =============================================================================
-- PrimePrep CUET PG — Migration 003: Marketing, Sales Agents, Promo Codes,
-- Student Refer-a-Friend Programme & Auditable Wallet Ledger
-- =============================================================================
-- Non-destructive migration: uses IF NOT EXISTS so existing production data
-- in users, subjects, tests, questions, packages, purchases, and attempts is
-- preserved without loss.
-- =============================================================================

-- 1. Extend users with unique referral code and referrer attribution
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_user_id TEXT NULL REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_code TEXT NULL;
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users (referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users (referred_by_user_id);

-- 2. Sales Agents table
CREATE TABLE IF NOT EXISTS sales_agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL DEFAULT '',
  promo_code TEXT NOT NULL UNIQUE,
  discount_percent INTEGER NOT NULL DEFAULT 10 CHECK (discount_percent >= 1 AND discount_percent <= 90),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sales_agents_promo_code ON sales_agents (promo_code);
CREATE INDEX IF NOT EXISTS idx_sales_agents_status ON sales_agents (status);

-- 3. Promo Codes table (supports Agent codes & Campaign codes)
CREATE TABLE IF NOT EXISTS promo_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  code_type TEXT NOT NULL DEFAULT 'campaign' CHECK (code_type IN ('agent', 'campaign')),
  agent_id TEXT NULL REFERENCES sales_agents(id) ON DELETE SET NULL,
  description TEXT NOT NULL DEFAULT '',
  discount_percent INTEGER NOT NULL DEFAULT 10 CHECK (discount_percent >= 1 AND discount_percent <= 90),
  min_purchase_paise INTEGER NOT NULL DEFAULT 0 CHECK (min_purchase_paise >= 0),
  max_uses INTEGER NULL CHECK (max_uses IS NULL OR max_uses >= 1),
  current_uses INTEGER NOT NULL DEFAULT 0 CHECK (current_uses >= 0),
  applicable_subject_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  starts_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes (code);
CREATE INDEX IF NOT EXISTS idx_promo_codes_agent ON promo_codes (agent_id);

-- 4. Singleton Referral Programme Settings table
CREATE TABLE IF NOT EXISTS referral_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  friend_discount_percent INTEGER NOT NULL DEFAULT 10 CHECK (friend_discount_percent >= 1 AND friend_discount_percent <= 50),
  referrer_reward_percent INTEGER NOT NULL DEFAULT 10 CHECK (referrer_reward_percent >= 1 AND referrer_reward_percent <= 50),
  min_purchase_paise INTEGER NOT NULL DEFAULT 10000 CHECK (min_purchase_paise >= 0),
  reward_expiry_days INTEGER NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL DEFAULT 'system'
);

-- 5. Student Referral Attributions (strictly 1 referrer per referred student)
CREATE TABLE IF NOT EXISTS referral_attributions (
  id TEXT PRIMARY KEY,
  referrer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'pending_payment', 'rewarded', 'reversed')),
  order_id TEXT NULL,
  purchase_id TEXT NULL,
  subject_id TEXT NULL REFERENCES subjects(id) ON DELETE SET NULL,
  original_amount_paise INTEGER NOT NULL DEFAULT 0,
  friend_discount_paise INTEGER NOT NULL DEFAULT 0,
  referrer_reward_paise INTEGER NOT NULL DEFAULT 0,
  rewarded_at TIMESTAMPTZ NULL,
  reversed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_no_self_referral CHECK (referrer_user_id <> referred_user_id)
);
CREATE INDEX IF NOT EXISTS idx_referral_attributions_referrer ON referral_attributions (referrer_user_id, status);
CREATE INDEX IF NOT EXISTS idx_referral_attributions_referred ON referral_attributions (referred_user_id);

-- 6. Auditable Wallet Transactions Ledger (Integer Paise)
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('referral_reward_credit', 'referral_reward_reversal', 'promotional_credit', 'redemption_debit')),
  amount_paise INTEGER NOT NULL,
  balance_after_paise INTEGER NOT NULL DEFAULT 0,
  reference_type TEXT NOT NULL CHECK (reference_type IN ('purchase', 'refund_revoke', 'admin_adjustment')),
  reference_id TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_wallet_txn_type_ref UNIQUE (transaction_type, reference_id)
);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user ON wallet_transactions (user_id, created_at DESC);

-- 7. Extend payment_orders and purchases with integer paise breakdown & attribution
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS original_amount_paise INTEGER NULL;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS discount_amount_paise INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS final_amount_paise INTEGER NULL;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS promo_code TEXT NULL;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS promo_type TEXT NULL;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS agent_id TEXT NULL REFERENCES sales_agents(id) ON DELETE SET NULL;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS referrer_user_id TEXT NULL REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS reward_status TEXT NOT NULL DEFAULT 'none';

ALTER TABLE purchases ADD COLUMN IF NOT EXISTS original_amount_paise INTEGER NULL;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS discount_amount_paise INTEGER NOT NULL DEFAULT 0;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS final_amount_paise INTEGER NULL;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS promo_code TEXT NULL;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS promo_type TEXT NULL;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS agent_id TEXT NULL REFERENCES sales_agents(id) ON DELETE SET NULL;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS referrer_user_id TEXT NULL REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS reward_status TEXT NOT NULL DEFAULT 'none';

-- Enable RLS on new tables for defense-in-depth
ALTER TABLE sales_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

INSERT INTO schema_migrations (version, name)
VALUES ('003', '003_marketing_referrals_schema.sql')
ON CONFLICT (version) DO NOTHING;
