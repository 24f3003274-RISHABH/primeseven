/**
 * Core Domain Types for PrimePrep CUET PG Examination Platform
 */

export type UserRole = 'student' | 'admin';
export type AccountStatus = 'active' | 'suspended';

export interface UserProfile {
  id: string; // Supabase / PostgreSQL Auth UUID
  full_name: string;
  email: string;
  role: UserRole;
  account_status: AccountStatus;
  password_hash?: string;
  must_change_password?: boolean;
  referral_code?: string;
  referred_by_user_id?: string | null;
  referred_by_code?: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudyBookmark {
  id: string;
  userId: string;
  testId: string;
  note: string;
  created_at: string;
}

export interface Subject {
  id: string;
  name: string;
  slug: string;
  paper_code: string;
  description: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export type CategorySlug = 'sectional' | 'full_length' | 'pyq';

export interface TestCategory {
  id: string;
  slug: CategorySlug;
  name: string;
  description: string;
  default_duration_minutes: number;
  display_order: number;
}

export type AccessType = 'free' | 'premium';
export type PublicationStatus = 'draft' | 'published' | 'unpublished';

export interface TestItem {
  id: string;
  subject_id: string;
  category_id: string;
  category_slug: CategorySlug;
  title: string;
  test_number: number;
  description: string;
  duration_minutes: number;
  total_questions: number;
  maximum_marks: number;
  positive_marks: number;
  negative_marks: number;
  access_type: AccessType;
  publication_status: PublicationStatus;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export type OptionKey = 'A' | 'B' | 'C' | 'D';

export interface Question {
  id: string;
  test_id: string;
  question_text: string;
  question_type: 'mcq_single';
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: OptionKey;
  explanation: string;
  marks: number;
  negative_marks: number;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface SanitizedQuestion {
  id: string;
  test_id: string;
  question_text: string;
  question_type: 'mcq_single';
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  marks: number;
  negative_marks: number;
  display_order: number;
}

export interface SubjectPackage {
  id: string;
  subject_id: string;
  package_name: string;
  description: string;
  price_paise: number; // Stored strictly as integer paise (e.g. 49900 = ₹499)
  currency: 'INR';
  is_available_for_sale: boolean;
  created_at: string;
  updated_at: string;
}

export interface FreeTestConfig {
  free_sectional_test_id: string | null;
  free_pyq_test_id: string | null;
  updated_at: string;
  updated_by: string;
}

export type OrderStatus = 'created' | 'pending' | 'paid' | 'failed';
export type PromoCodeType = 'agent' | 'campaign' | 'referral';
export type RewardLifecycleStatus = 'none' | 'pending' | 'granted' | 'reversed';

export interface PaymentOrder {
  id: string;
  user_id: string;
  package_id: string;
  subject_id: string;
  gateway: 'razorpay';
  gateway_order_id: string;
  expected_amount_paise: number;
  original_amount_paise?: number;
  discount_amount_paise?: number;
  final_amount_paise?: number;
  promo_code?: string | null;
  promo_type?: PromoCodeType | null;
  agent_id?: string | null;
  referrer_user_id?: string | null;
  reward_status?: RewardLifecycleStatus;
  currency: 'INR';
  status: OrderStatus;
  created_at: string;
  updated_at: string;
}

export type PaymentStatus = 'authorized' | 'captured' | 'failed' | 'pending';
export type VerificationStatus = 'verified' | 'rejected' | 'pending';

export interface PaymentTransaction {
  id: string;
  order_id: string;
  user_id: string;
  gateway_payment_id: string;
  payment_status: PaymentStatus;
  verification_status: VerificationStatus;
  amount_paise: number;
  currency: 'INR';
  gateway_reference: string;
  verified_at: string | null;
  created_at: string;
}

export type EntitlementStatus = 'active' | 'revoked';

export interface PurchaseEntitlement {
  id: string;
  user_id: string;
  package_id: string;
  subject_id: string;
  payment_transaction_id: string;
  entitlement_status: EntitlementStatus;
  original_amount_paise?: number;
  discount_amount_paise?: number;
  final_amount_paise?: number;
  promo_code?: string | null;
  promo_type?: PromoCodeType | null;
  agent_id?: string | null;
  referrer_user_id?: string | null;
  reward_status?: RewardLifecycleStatus;
  purchased_at: string;
  created_at: string;
  updated_at: string;
}

export type SalesAgentStatus = 'active' | 'inactive' | 'suspended';

export interface SalesAgent {
  id: string;
  name: string;
  email: string;
  phone: string;
  promo_code: string; // Unique uppercase code, e.g. ADITYA10
  discount_percent: number; // Default 10
  status: SalesAgentStatus;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface PromoCodeRecord {
  id: string;
  code: string; // Unique uppercase code
  code_type: 'agent' | 'campaign';
  agent_id: string | null;
  description: string;
  discount_percent: number; // e.g. 10
  min_purchase_paise: number; // Integer paise, default 0
  max_uses: number | null; // null = unlimited
  current_uses: number; // Count of verified completed purchases
  applicable_subject_ids: string[]; // Empty array = all subjects
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReferralProgramSettings {
  is_enabled: boolean;
  friend_discount_percent: number; // Default 10%
  referrer_reward_percent: number; // Default 10% of original package base price
  min_purchase_paise: number; // Default 10000 (₹100)
  reward_expiry_days: number | null; // null = no expiry
  updated_at: string;
  updated_by: string;
}

export type ReferralAttributionStatus = 'registered' | 'pending_payment' | 'rewarded' | 'reversed';

export interface ReferralAttribution {
  id: string;
  referrer_user_id: string;
  referred_user_id: string; // Unique: at most one referrer per student
  referral_code: string;
  status: ReferralAttributionStatus;
  order_id: string | null;
  purchase_id: string | null;
  subject_id: string | null;
  original_amount_paise: number;
  friend_discount_paise: number;
  referrer_reward_paise: number;
  rewarded_at: string | null;
  reversed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type WalletTransactionType =
  | 'referral_reward_credit'
  | 'referral_reward_reversal'
  | 'promotional_credit'
  | 'redemption_debit';

export interface WalletTransaction {
  id: string;
  user_id: string;
  transaction_type: WalletTransactionType;
  amount_paise: number; // Signed integer paise (+ for credit, - for reversal/debit)
  balance_after_paise: number;
  reference_type: 'purchase' | 'refund_revoke' | 'admin_adjustment';
  reference_id: string; // e.g. purchase.id for idempotency
  description: string;
  created_at: string;
}

export type AttemptStatus = 'in_progress' | 'submitted' | 'expired_submitted';

export interface TestAttempt {
  id: string;
  user_id: string;
  test_id: string;
  subject_id: string;
  category_slug: CategorySlug;
  attempt_number: number; // Strictly 1 per (user_id, test_id)
  status: AttemptStatus;
  started_at: string;
  expires_at: string;
  submitted_at: string | null;
  total_score: number;
  maximum_marks: number;
  correct_count: number;
  incorrect_count: number;
  unanswered_count: number;
  time_taken_seconds: number;
}

export interface AttemptAnswer {
  id: string;
  attempt_id: string;
  question_id: string;
  selected_option: OptionKey | null;
  is_marked_for_review: boolean;
  is_visited: boolean;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string;
  actor_email: string;
  action: string;
  target_type: string;
  target_id: string;
  details: string;
  created_at: string;
}

export interface WebhookEvent {
  id: string;
  event_id: string;
  event_type: string;
  gateway_order_id: string;
  processed_at: string;
}

export interface ExcelQuestionRow {
  rowNumber: number;
  subject: string;
  category: string;
  test_number: number;
  test_title: string;
  question_number: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  solution: string;
  marks: number;
  negative_marks: number;
  isValid: boolean;
  errors: string[];
}
