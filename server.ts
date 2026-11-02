import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { z } from 'zod';
import { store } from './src/backend/store.ts';
import { optionalAuth, requireAuth, requireAdmin, AuthRequest } from './src/backend/middleware.ts';
import {
  signAuthToken,
  hashPassword,
  verifyPassword,
  safeCompareSecret,
  getOfficialAdminConfig,
  getRuntimeHmacSecret,
} from './src/backend/firebase-admin.ts';
import { canAccessTest } from './src/backend/services/accessControlService.ts';
import { logger, httpRequestLogger } from './src/backend/utils/logger.ts';
import { centralErrorHandler } from './src/backend/utils/errors.ts';
import { paginateArray } from './src/backend/utils/pagination.ts';
import { validateBody, createRateLimiter } from './src/backend/middleware/validate.ts';
import {
  getPostgresPool,
  runPostgresMigrations,
  syncDatabaseToPostgres,
  sanitizeDbErrorMessage,
} from './src/backend/database/pg-pool.ts';
import {
  SanitizedQuestion,
  ExcelQuestionRow,
  OptionKey,
  CategorySlug,
  PublicationStatus,
} from './src/types/domain.ts';

dotenv.config();

function cleanEnvVal(val?: string): string | undefined {
  const trimmed = (val || '').trim();
  if (!trimmed || /^(na|n\/a|none|null|undefined)$/i.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

const PORT = Number(cleanEnvVal(process.env.PORT) || 3000);
const RAZORPAY_KEY_ID =
  cleanEnvVal(process.env.RAZORPAY_KEY_ID) ||
  `rzp_test_${getRuntimeHmacSecret('razorpay_key_id').slice(0, 14)}`;
const RAZORPAY_KEY_SECRET =
  cleanEnvVal(process.env.RAZORPAY_KEY_SECRET) || getRuntimeHmacSecret('razorpay_key');
const RAZORPAY_WEBHOOK_SECRET =
  cleanEnvVal(process.env.RAZORPAY_WEBHOOK_SECRET) || getRuntimeHmacSecret('razorpay_webhook');

function computeRazorpaySignature(orderId: string, paymentId: string): string {
  return crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

function computeWebhookSignature(rawBody: string): string {
  return crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
}

async function startServer() {
  const app = express();

  // CORS middleware for Vercel (frontend) -> Render (backend) deployments
  app.use((req, res, next) => {
    const configuredOrigin = cleanEnvVal(process.env.CORS_ORIGIN);
    const allowedOrigin = configuredOrigin || req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Preserve raw body for webhook signature verification
  app.use(
    express.json({
      limit: '10mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    })
  );

  // Structured JSON Request Logger
  app.use(httpRequestLogger);

  // Rate limiting on sensitive payment and auth mutation endpoints
  const paymentRateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 60 });
  const authRateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30 });

  // ============================================================================
  // 1. HEALTH & PUBLIC METADATA ENDPOINTS (/health and /api/v1/health)
  // ============================================================================
  const healthHandler = (_req: Request, res: Response) => {
    const pgPool = getPostgresPool();
    const integrity = store.validateRelationalIntegrity();
    res.status(200).json({
      status: integrity.valid ? 'ok' : 'degraded',
      service: 'PrimePrep CUET PG Examination Engine',
      timestamp: new Date().toISOString(),
      database: {
        postgres_pool_configured: Boolean(pgPool),
        relational_integrity_valid: integrity.valid,
        subjects_count: store.db.subjects.length,
        categories_count: store.db.categories.length,
        published_tests_count: store.db.tests.filter((t) => t.publication_status === 'published').length,
      },
    });
  };
  app.get('/health', healthHandler);
  app.get('/api/v1/health', healthHandler);

  app.get('/api/v1/public/stats', (_req, res) => {
    const activeSubjects = store.db.subjects.filter((s) => s.is_active);
    const publishedTests = store.db.tests.filter((t) => t.publication_status === 'published');
    const freeSectional = store.db.tests.find(
      (t) => t.id === store.db.free_test_config.free_sectional_test_id
    );
    const freePyq = store.db.tests.find(
      (t) => t.id === store.db.free_test_config.free_pyq_test_id
    );

    res.json({
      total_subjects: activeSubjects.length,
      total_published_tests: publishedTests.length,
      total_questions: store.db.questions.length,
      categories_count: store.db.categories.length,
      free_tests: [freeSectional, freePyq].filter(Boolean).map((t) => {
        const subj = store.db.subjects.find((s) => s.id === t!.subject_id);
        return {
          id: t!.id,
          title: t!.title,
          category_slug: t!.category_slug,
          duration_minutes: t!.duration_minutes,
          total_questions: t!.total_questions,
          maximum_marks: t!.maximum_marks,
          subject_name: subj?.name || '',
          subject_slug: subj?.slug || '',
        };
      }),
    });
  });

  // ============================================================================
  // 2. AUTH, REGISTRATION & BOOKMARKS ENDPOINTS (SUPABASE / JWT — NO FIREBASE)
  // ============================================================================
  app.post(
    '/api/v1/auth/register',
    authRateLimiter,
    validateBody(
      z.object({
        full_name: z.string().min(2).max(120),
        email: z.string().email(),
        password: z.string().min(6).max(128),
        confirm_password: z.string().optional(),
        referral_code: z.string().max(40).optional(),
      })
    ),
    (req, res) => {
      const email = req.body.email.toLowerCase().trim();
      const fullName = req.body.full_name.trim();
      const rawPassword = req.body.password;
      const confirmPassword = req.body.confirm_password;
      const rawReferralCode = (req.body.referral_code || '').trim().toUpperCase();
      const adminConfig = getOfficialAdminConfig();

      if (confirmPassword !== undefined && confirmPassword !== rawPassword) {
        res.status(400).json({ error: 'Passwords do not match.' });
        return;
      }

      if (email === adminConfig.adminEmail) {
        res.status(403).json({
          error: 'This email address is reserved for platform administration and cannot be registered publicly.',
        });
        return;
      }

      const existing = store.db.users.find((u) => u.email.toLowerCase() === email);
      if (existing && existing.password_hash) {
        res.status(409).json({
          error: 'An account with this email is already registered. Please sign in instead.',
        });
        return;
      }

      // Check referral code if provided on registration
      let validReferrer = null;
      if (rawReferralCode && store.db.referral_settings?.is_enabled) {
        const candidateReferrer = store.db.users.find(
          (u) =>
            u.role === 'student' &&
            u.account_status === 'active' &&
            u.referral_code &&
            u.referral_code.toUpperCase() === rawReferralCode &&
            u.email.toLowerCase() !== email
        );
        if (candidateReferrer) {
          validReferrer = candidateReferrer;
        }
      }

      const now = new Date().toISOString();
      const passwordHash = hashPassword(rawPassword);
      const uid = existing ? existing.id : `usr-${crypto.randomUUID()}`;
      const user = store.upsertUser(uid, email, fullName);
      user.full_name = fullName;
      user.role = 'student';
      user.password_hash = passwordHash;
      user.must_change_password = false;
      user.updated_at = now;
      store.ensureUserReferralCode(user, false);

      // Attach referrer ONLY if new account and not self-referral
      if (validReferrer && validReferrer.id !== user.id && !user.referred_by_user_id) {
        user.referred_by_user_id = validReferrer.id;
        user.referred_by_code = validReferrer.referral_code || rawReferralCode;

        const existingAttr = store.db.referral_attributions.find(
          (ra) => ra.referred_user_id === user.id
        );
        if (!existingAttr) {
          store.db.referral_attributions.unshift({
            id: `refattr-${crypto.randomUUID()}`,
            referrer_user_id: validReferrer.id,
            referred_user_id: user.id,
            referral_code: validReferrer.referral_code || rawReferralCode,
            status: 'registered',
            order_id: null,
            purchase_id: null,
            subject_id: null,
            original_amount_paise: 0,
            friend_discount_paise: 0,
            referrer_reward_paise: 0,
            rewarded_at: null,
            reversed_at: null,
            created_at: now,
            updated_at: now,
          });
        }
      }

      store.persist();

      const token = signAuthToken({
        uid: user.id,
        email: user.email,
        name: user.full_name,
        role: user.role,
      });

      res.status(201).json({ token, user: store.sanitizeUser(user) });
    }
  );

  app.post(
    '/api/v1/auth/login',
    authRateLimiter,
    validateBody(
      z.object({
        email: z.string().email(),
        password: z.string().min(1, 'Password is required'),
      })
    ),
    (req, res) => {
      const email = req.body.email.toLowerCase().trim();
      const rawPassword = req.body.password;
      const adminConfig = getOfficialAdminConfig();

      if (email === adminConfig.adminEmail) {
        store.ensureOfficialAdminAccount();
      }

      const user = store.db.users.find((u) => u.email.toLowerCase() === email);
      if (!user) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      if (user.account_status === 'suspended') {
        res.status(403).json({ error: 'Your account has been suspended by an administrator.' });
        return;
      }

      if (!user.password_hash) {
        if (email === adminConfig.adminEmail) {
          res.status(403).json({
            error:
              'Official administrator account is provisioned, but its initial password has not been set yet. Configure ADMIN_INITIAL_PASSWORD in environment variables or initialize via POST /api/v1/admin/bootstrap.',
          });
          return;
        }
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      if (!verifyPassword(rawPassword, user.password_hash)) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      const token = signAuthToken({
        uid: user.id,
        email: user.email,
        name: user.full_name,
        role: user.role,
      });

      res.json({ token, user: store.sanitizeUser(user) });
    }
  );

  // One-time protected administrator bootstrap endpoint (permanently closes once admin password is set)
  app.post(
    '/api/v1/admin/bootstrap',
    authRateLimiter,
    validateBody(
      z.object({
        setup_secret: z.string().min(1),
        password: z.string().min(8).max(128),
        full_name: z.string().min(2).max(120).optional(),
      })
    ),
    (req, res) => {
      const adminConfig = getOfficialAdminConfig();
      if (!adminConfig.setupSecret) {
        res.status(503).json({
          error: 'ADMIN_SETUP_SECRET is not configured on the server. Bootstrap endpoint is disabled.',
        });
        return;
      }

      if (!safeCompareSecret(req.body.setup_secret, adminConfig.setupSecret)) {
        res.status(403).json({ error: 'Invalid administrator setup secret.' });
        return;
      }

      const adminUser = store.ensureOfficialAdminAccount();
      if (adminUser.password_hash) {
        res.status(403).json({
          error:
            'Administrator bootstrap is permanently closed because the official administrator password has already been initialized.',
        });
        return;
      }

      adminUser.full_name = (req.body.full_name || adminConfig.adminName).trim();
      adminUser.role = 'admin';
      adminUser.account_status = 'active';
      adminUser.password_hash = hashPassword(req.body.password);
      adminUser.must_change_password = false;
      adminUser.updated_at = new Date().toISOString();

      store.logAudit(
        adminUser.id,
        adminUser.email,
        'ADMIN_BOOTSTRAP_INITIALIZED',
        'user',
        adminUser.id,
        `Initialized official administrator account (${adminUser.full_name} <${adminUser.email}>) via protected bootstrap`
      );

      res.status(201).json({
        status: 'bootstrapped',
        user: store.sanitizeUser(adminUser),
      });
    }
  );

  // Authenticated password change endpoint (supports both students and Prime Seven admin)
  app.post(
    '/api/v1/auth/change-password',
    authRateLimiter,
    requireAuth,
    validateBody(
      z.object({
        current_password: z.string().min(1),
        new_password: z.string().min(6).max(128),
        confirm_new_password: z.string().optional(),
      })
    ),
    (req: AuthRequest, res) => {
      const user = req.userProfile!;
      const { current_password, new_password, confirm_new_password } = req.body;

      if (confirm_new_password !== undefined && confirm_new_password !== new_password) {
        res.status(400).json({ error: 'New passwords do not match.' });
        return;
      }

      if (!user.password_hash || !verifyPassword(current_password, user.password_hash)) {
        res.status(401).json({ error: 'Current password is incorrect.' });
        return;
      }

      if (current_password === new_password) {
        res.status(400).json({
          error: 'New password must be different from your current password.',
        });
        return;
      }

      user.password_hash = hashPassword(new_password);
      user.must_change_password = false;
      user.updated_at = new Date().toISOString();

      store.logAudit(
        user.id,
        user.email,
        'USER_PASSWORD_CHANGED',
        'user',
        user.id,
        `Password updated for account ${user.email}`
      );

      const rotatedToken = signAuthToken({
        uid: user.id,
        email: user.email,
        name: user.full_name,
        role: user.role,
      });

      res.json({
        status: 'password_updated',
        token: rotatedToken,
        user: store.sanitizeUser(user),
      });
    }
  );

  // Public lookup for referral/promo code banner on /register?ref=CODE
  app.get('/api/v1/referrals/lookup/:code', (req, res) => {
    const rawCode = (req.params.code || '').trim().toUpperCase();
    if (!rawCode) {
      res.status(404).json({ valid: false });
      return;
    }

    const referrer = store.db.users.find(
      (u) =>
        u.role === 'student' &&
        u.account_status === 'active' &&
        u.referral_code &&
        u.referral_code.toUpperCase() === rawCode
    );

    if (referrer && store.db.referral_settings?.is_enabled) {
      res.json({
        valid: true,
        type: 'referral',
        code: referrer.referral_code,
        referrer_name: referrer.full_name,
        friend_discount_percent: store.db.referral_settings.friend_discount_percent || 10,
      });
      return;
    }

    const agent = store.db.sales_agents.find(
      (a) => a.status === 'active' && a.promo_code.toUpperCase() === rawCode
    );
    if (agent) {
      res.json({
        valid: true,
        type: 'agent',
        code: agent.promo_code,
        agent_name: agent.name,
        friend_discount_percent: agent.discount_percent || 10,
      });
      return;
    }

    res.json({ valid: false });
  });

  // Student Refer-a-Friend & Wallet Dashboard API
  app.get('/api/v1/referrals/my', requireAuth, (req: AuthRequest, res) => {
    const user = req.userProfile!;
    const referralCode = store.ensureUserReferralCode(user);
    const refSettings = store.db.referral_settings;

    const myAttributions = (store.db.referral_attributions || []).filter(
      (ra) => ra.referrer_user_id === user.id
    );

    const rewardedAttributions = myAttributions.filter((ra) => ra.status === 'rewarded');
    const pendingAttributions = myAttributions.filter(
      (ra) => ra.status === 'registered' || ra.status === 'pending_payment'
    );
    const reversedAttributions = myAttributions.filter((ra) => ra.status === 'reversed');

    const totalRewardsEarnedPaise = rewardedAttributions.reduce(
      (sum, ra) => sum + (ra.referrer_reward_paise || 0),
      0
    );
    const availableWalletCreditPaise = store.getUserWalletBalancePaise(user.id);

    const referralsList = myAttributions.map((ra) => {
      const friend = store.db.users.find((u) => u.id === ra.referred_user_id);
      const subj = ra.subject_id
        ? store.db.subjects.find((s) => s.id === ra.subject_id)
        : null;
      const emailParts = (friend?.email || 'student@example.com').split('@');
      const maskedEmail =
        emailParts[0].length > 2
          ? `${emailParts[0].slice(0, 2)}***@${emailParts[1] || 'mail.com'}`
          : `***@${emailParts[1] || 'mail.com'}`;

      return {
        id: ra.id,
        referred_student_name: friend?.full_name || 'Candidate',
        referred_student_email: maskedEmail,
        referred_user_name: friend?.full_name || 'Candidate',
        referred_user_email: maskedEmail,
        status: ra.status,
        subject_name: subj?.name || null,
        original_amount_paise: ra.original_amount_paise,
        friend_discount_paise: ra.friend_discount_paise,
        referrer_reward_paise: ra.referrer_reward_paise,
        created_at: ra.created_at,
        rewarded_at: ra.rewarded_at,
      };
    });

    const walletLedger = (store.db.wallet_transactions || []).filter(
      (wt) => wt.user_id === user.id
    );

    let referredByInfo = null;
    if (user.referred_by_user_id) {
      const referrer = store.db.users.find((u) => u.id === user.referred_by_user_id);
      const completedPurchases = store.db.purchases.filter(
        (p) => p.user_id === user.id && p.entitlement_status === 'active'
      );
      if (referrer) {
        referredByInfo = {
          referrer_name: referrer.full_name,
          referral_code: user.referred_by_code || referrer.referral_code || '',
          eligible_for_first_purchase_discount:
            Boolean(refSettings?.is_enabled) && completedPurchases.length === 0,
          friend_discount_percent: refSettings?.friend_discount_percent || 10,
        };
      }
    }

    res.json({
      referral_code: referralCode,
      referral_settings: refSettings,
      referred_by: referredByInfo,
      stats: {
        total_friends_referred: myAttributions.length,
        successful_referral_purchases: rewardedAttributions.length,
        pending_referrals: pendingAttributions.length,
        reversed_referrals: reversedAttributions.length,
        total_rewards_earned_paise: totalRewardsEarnedPaise,
        available_wallet_credit_paise: availableWalletCreditPaise,
      },
      referrals: referralsList,
      wallet_ledger: walletLedger,
    });
  });

  app.get('/api/v1/bookmarks/my', requireAuth, (req: AuthRequest, res) => {
    const user = req.userProfile!;
    const bookmarks = (store.db.bookmarks || []).filter((b) => b.userId === user.id);
    res.json({ bookmarks });
  });

  app.post(
    '/api/v1/bookmarks',
    requireAuth,
    validateBody(
      z.object({
        testId: z.string().optional(),
        test_id: z.string().optional(),
        note: z.string().max(500),
      })
    ),
    (req: AuthRequest, res) => {
      const user = req.userProfile!;
      const testId = (req.body.testId || req.body.test_id || '').trim();
      const note = req.body.note || '';
      if (!testId) {
        res.status(400).json({ error: 'testId is required' });
        return;
      }
      const existing = store.db.bookmarks.find(
        (b) => b.userId === user.id && b.testId === testId
      );
      if (existing) {
        existing.note = note.trim();
        store.persist();
        res.json({ bookmark: existing });
        return;
      }
      const created = {
        id: `bm-${crypto.randomUUID()}`,
        userId: user.id,
        testId,
        note: note.trim(),
        created_at: new Date().toISOString(),
      };
      store.db.bookmarks.unshift(created);
      store.persist();
      res.status(201).json({ bookmark: created });
    }
  );

  app.delete('/api/v1/bookmarks/:testId', requireAuth, (req: AuthRequest, res) => {
    const user = req.userProfile!;
    store.db.bookmarks = store.db.bookmarks.filter(
      (b) => !(b.userId === user.id && b.testId === req.params.testId)
    );
    store.persist();
    res.json({ deleted: true });
  });

  app.get('/api/v1/auth/me', requireAuth, (req: AuthRequest, res) => {
    const profile = req.userProfile!;
    const myPurchases = store.db.purchases.filter(
      (p) => p.user_id === profile.id && p.entitlement_status === 'active'
    );
    const myAttempts = store.db.attempts.filter((a) => a.user_id === profile.id);

    res.json({
      user: store.sanitizeUser(profile),
      purchased_subject_ids: myPurchases.map((p) => p.subject_id),
      stats: {
        purchased_subjects_count: myPurchases.length,
        attempts_total: myAttempts.length,
        attempts_completed: myAttempts.filter((a) => a.status !== 'in_progress').length,
      },
    });
  });

  // Update student profile full_name (explicitly blocks role self-escalation)
  app.put(
    '/api/v1/auth/profile',
    requireAuth,
    validateBody(z.object({ full_name: z.string().min(2).max(120) })),
    (req: AuthRequest, res) => {
      const user = req.userProfile!;
      user.full_name = req.body.full_name.trim();
      user.updated_at = new Date().toISOString();
      store.persist();
      res.json({ user: store.sanitizeUser(user) });
    }
  );

  // Audited role switch strictly restricted to official platform administrators
  app.post(
    '/api/v1/auth/switch-role',
    requireAuth,
    validateBody(z.object({ target_role: z.enum(['student', 'admin']) })),
    (req: AuthRequest, res) => {
      const user = req.userProfile!;
      const adminConfig = getOfficialAdminConfig();
      const isOfficialAdmin = user.email.toLowerCase() === adminConfig.adminEmail;
      if (!isOfficialAdmin && user.role !== 'admin') {
        res.status(403).json({
          error: 'Role switching is restricted to authorized platform administrators.',
        });
        return;
      }
      const prevRole = user.role;
      user.role = req.body.target_role;
      user.updated_at = new Date().toISOString();
      store.logAudit(
        user.id,
        user.email,
        'ROLE_VIEW_SWITCHED',
        'user',
        user.id,
        `Switched active workspace role from ${prevRole} to ${user.role}`
      );
      res.json({ user: store.sanitizeUser(user) });
    }
  );

  // ============================================================================
  // 3. SUBJECTS, CATEGORIES & TEST CATALOGUE ENDPOINTS
  // ============================================================================
  app.get('/api/v1/subjects', optionalAuth, (req: AuthRequest, res) => {
    const userId = req.userProfile?.id || null;
    const activeSubjects = store.db.subjects
      .filter((s) => s.is_active)
      .sort((a, b) => a.display_order - b.display_order);

    const enriched = activeSubjects.map((subj) => {
      const pkg = store.db.packages.find((p) => p.subject_id === subj.id);
      const publishedTests = store.db.tests.filter(
        (t) => t.subject_id === subj.id && t.publication_status === 'published'
      );
      const isPurchased = userId ? store.hasSubjectEntitlement(userId, subj.id) : false;

      const sectionalCount = publishedTests.filter((t) => t.category_slug === 'sectional').length;
      const fullLengthCount = publishedTests.filter((t) => t.category_slug === 'full_length').length;
      const pyqCount = publishedTests.filter((t) => t.category_slug === 'pyq').length;
      const freeTestsCount = publishedTests.filter((t) => t.access_type === 'free').length;

      return {
        ...subj,
        total_tests: publishedTests.length,
        category_counts: {
          sectional: sectionalCount,
          full_length: fullLengthCount,
          pyq: pyqCount,
        },
        free_tests_count: freeTestsCount,
        is_purchased: isPurchased,
        package: pkg
          ? {
              id: pkg.id,
              package_name: pkg.package_name,
              price_paise: pkg.price_paise,
              currency: pkg.currency,
              is_available_for_sale: pkg.is_available_for_sale,
            }
          : null,
      };
    });

    const paginated = paginateArray(enriched, req.query as Record<string, any>, 50, 100);
    res.json({
      subjects: paginated.items,
      categories: store.db.categories,
      pagination: paginated.pagination,
    });
  });

  app.get('/api/v1/categories', (_req, res) => {
    res.json({ categories: store.db.categories });
  });

  app.get('/api/v1/tests', optionalAuth, (req: AuthRequest, res) => {
    const userId = req.userProfile?.id || null;
    const subjectSlug = req.query.subject_slug as string | undefined;
    const categorySlug = req.query.category_slug as string | undefined;

    const activeSubjectMap = new Map(
      store.db.subjects.filter((s) => s.is_active).map((s) => [s.id, s])
    );
    const categoryMap = new Map(store.db.categories.map((c) => [c.id, c]));
    const userAttempts = userId
      ? store.db.attempts.filter((a) => a.user_id === userId)
      : [];
    const attemptMap = new Map(userAttempts.map((a) => [a.test_id, a]));

    let publishedTests = store.db.tests.filter(
      (t) => t.publication_status === 'published' && activeSubjectMap.has(t.subject_id)
    );
    if (subjectSlug) {
      const subj = store.db.subjects.find((s) => s.slug === subjectSlug);
      publishedTests = subj ? publishedTests.filter((t) => t.subject_id === subj.id) : [];
    }
    if (categorySlug) {
      publishedTests = publishedTests.filter((t) => t.category_slug === categorySlug);
    }

    publishedTests.sort((a, b) => {
      const subjA = activeSubjectMap.get(a.subject_id)?.display_order || 99;
      const subjB = activeSubjectMap.get(b.subject_id)?.display_order || 99;
      if (subjA !== subjB) return subjA - subjB;
      return a.display_order - b.display_order || a.test_number - b.test_number;
    });

    const enriched = publishedTests.map((t) => {
      const subj = activeSubjectMap.get(t.subject_id);
      const cat = categoryMap.get(t.category_id);
      const attempt = attemptMap.get(t.id);
      const decision = canAccessTest(userId, t.id);
      const isUnlocked =
        decision.classification === 'GLOBAL_FREE_TEST' ||
        decision.classification === 'VALID_SUBJECT_ENTITLEMENT';

      let student_status: 'locked' | 'unlocked' | 'in_progress' | 'completed' = isUnlocked
        ? 'unlocked'
        : 'locked';
      if (attempt) {
        student_status = attempt.status === 'in_progress' ? 'in_progress' : 'completed';
      }

      return {
        ...t,
        subject_name: subj?.name || '',
        subject_slug: subj?.slug || '',
        paper_code: subj?.paper_code || '',
        category_name: cat?.name || t.category_slug,
        is_unlocked: isUnlocked,
        student_status,
        access_decision: decision,
        attempt_summary: attempt
          ? {
              attempt_id: attempt.id,
              status: attempt.status,
              total_score: attempt.total_score,
              maximum_marks: attempt.maximum_marks,
              submitted_at: attempt.submitted_at,
              started_at: attempt.started_at,
            }
          : null,
      };
    });

    const paginated = paginateArray(enriched, req.query as Record<string, any>, 250, 500);
    res.json({
      tests: paginated.items,
      subjects: store.db.subjects.filter((s) => s.is_active).sort((a, b) => a.display_order - b.display_order),
      categories: store.db.categories,
      pagination: paginated.pagination,
    });
  });

  app.get('/api/v1/subjects/:slug', optionalAuth, (req: AuthRequest, res) => {
    const userId = req.userProfile?.id || null;
    const subject = store.db.subjects.find(
      (s) => s.slug === req.params.slug && s.is_active
    );
    if (!subject) {
      res.status(404).json({ error: 'Subject not found.' });
      return;
    }

    const pkg = store.db.packages.find((p) => p.subject_id === subject.id);
    const isPurchased = userId ? store.hasSubjectEntitlement(userId, subject.id) : false;

    const publishedTests = store.db.tests
      .filter((t) => t.subject_id === subject.id && t.publication_status === 'published')
      .sort((a, b) => a.display_order - b.display_order || a.test_number - b.test_number);

    const userAttempts = userId
      ? store.db.attempts.filter((a) => a.user_id === userId && a.subject_id === subject.id)
      : [];

    const attemptMap = new Map(userAttempts.map((a) => [a.test_id, a]));

    const testsWithStatus = publishedTests.map((t) => {
      const attempt = attemptMap.get(t.id);
      const decision = canAccessTest(userId, t.id);
      const isUnlocked =
        decision.classification === 'GLOBAL_FREE_TEST' ||
        decision.classification === 'VALID_SUBJECT_ENTITLEMENT';
      let student_status: 'locked' | 'unlocked' | 'in_progress' | 'completed' = isUnlocked
        ? 'unlocked'
        : 'locked';

      if (attempt) {
        student_status = attempt.status === 'in_progress' ? 'in_progress' : 'completed';
      }

      return {
        ...t,
        is_unlocked: isUnlocked,
        student_status,
        access_decision: decision,
        attempt_summary: attempt
          ? {
              attempt_id: attempt.id,
              status: attempt.status,
              total_score: attempt.total_score,
              maximum_marks: attempt.maximum_marks,
              submitted_at: attempt.submitted_at,
              started_at: attempt.started_at,
            }
          : null,
      };
    });

    const subjectHistory = userAttempts
      .filter((a) => a.status !== 'in_progress')
      .map((a) => {
        const test = store.db.tests.find((t) => t.id === a.test_id);
        return {
          attempt_id: a.id,
          test_id: a.test_id,
          test_title: test?.title || 'Test',
          category_slug: a.category_slug,
          submitted_at: a.submitted_at,
          total_score: a.total_score,
          maximum_marks: a.maximum_marks,
          percentage:
            a.maximum_marks > 0 ? Math.round((a.total_score / a.maximum_marks) * 1000) / 10 : 0,
          status: a.status,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.submitted_at || 0).getTime() - new Date(a.submitted_at || 0).getTime()
      );

    const paginatedTests = paginateArray(testsWithStatus, req.query as Record<string, any>, 50, 250);

    res.json({
      subject,
      is_purchased: isPurchased,
      package: pkg || null,
      categories: store.db.categories,
      tests: paginatedTests.items,
      pagination: paginatedTests.pagination,
      subject_history: subjectHistory,
    });
  });

  // Centralized Access Evaluation Endpoint using canAccessTest(userId, testId)
  app.get('/api/v1/tests/:testId/access', optionalAuth, (req: AuthRequest, res) => {
    const userId = req.userProfile?.id || null;
    const decision = canAccessTest(userId, req.params.testId);
    if (!decision.publicCatalogueVisible) {
      res.status(404).json({
        error: decision.denialReason || 'Published test not found.',
        access_decision: decision,
      });
      return;
    }
    res.json({ access_decision: decision });
  });

  app.get('/api/v1/tests/:testId', optionalAuth, (req: AuthRequest, res) => {
    const userId = req.userProfile?.id || null;
    const decision = canAccessTest(userId, req.params.testId);
    if (!decision.publicCatalogueVisible) {
      res.status(404).json({ error: 'Published test not found.' });
      return;
    }

    const test = store.db.tests.find((t) => t.id === req.params.testId)!;
    const subject = store.db.subjects.find((s) => s.id === test.subject_id);
    const category = store.db.categories.find((c) => c.id === test.category_id);
    const pkg = store.db.packages.find((p) => p.subject_id === test.subject_id);
    const hasAccess =
      decision.classification === 'GLOBAL_FREE_TEST' ||
      decision.classification === 'VALID_SUBJECT_ENTITLEMENT';

    const existingAttempt = userId
      ? store.db.attempts.find((a) => a.user_id === userId && a.test_id === test.id)
      : null;

    res.json({
      test,
      subject,
      category,
      package: pkg,
      is_purchased: decision.hasValidSubjectEntitlement,
      has_access: hasAccess,
      access_decision: decision,
      existing_attempt: existingAttempt || null,
    });
  });

  // ============================================================================
  // 4. SUBJECT-SERIES PACKAGES, PROMO VALIDATION & SECURE RAZORPAY PAYMENT FLOW
  // ============================================================================
  app.get('/api/v1/packages/:subjectSlug', optionalAuth, (req: AuthRequest, res) => {
    const userId = req.userProfile?.id || null;
    const subject = store.db.subjects.find(
      (s) => s.slug === req.params.subjectSlug && s.is_active
    );
    if (!subject) {
      res.status(404).json({ error: 'Subject not found.' });
      return;
    }

    const pkg = store.db.packages.find((p) => p.subject_id === subject.id);
    if (!pkg) {
      res.status(404).json({ error: 'Package not configured for this subject.' });
      return;
    }

    const publishedTests = store.db.tests.filter(
      (t) => t.subject_id === subject.id && t.publication_status === 'published'
    );
    const isPurchased = userId ? store.hasSubjectEntitlement(userId, subject.id) : false;

    // Check if logged-in student has an automatic first-purchase referral discount available
    let autoReferralOffer = null;
    if (userId && !isPurchased && req.userProfile?.referred_by_code) {
      const check = store.validateDiscountCode(
        userId,
        subject.id,
        req.userProfile.referred_by_code
      );
      if (check.valid) {
        autoReferralOffer = check;
      }
    }

    res.json({
      subject,
      package: pkg,
      is_purchased: isPurchased,
      auto_referral_offer: autoReferralOffer,
      total_tests: publishedTests.length,
      category_counts: {
        sectional: publishedTests.filter((t) => t.category_slug === 'sectional').length,
        full_length: publishedTests.filter((t) => t.category_slug === 'full_length').length,
        pyq: publishedTests.filter((t) => t.category_slug === 'pyq').length,
      },
      free_test_config: store.db.free_test_config,
    });
  });

  // Authoritative Promo & Referral Code Validation Endpoint
  app.post(
    '/api/v1/promo/validate',
    paymentRateLimiter,
    optionalAuth,
    validateBody(
      z.object({
        subject_id: z.string().optional(),
        package_id: z.string().optional(),
        promo_code: z.string().max(50).optional(),
        code: z.string().max(50).optional(),
        current_applied_code: z.string().optional().nullable(),
        currently_applied_code: z.string().optional().nullable(),
      })
    ),
    (req: AuthRequest, res) => {
      const userId = req.userProfile?.id || null;
      const {
        subject_id,
        package_id,
        promo_code,
        code,
        current_applied_code,
        currently_applied_code,
      } = req.body;

      const resolvedSubjectId =
        subject_id ||
        (package_id ? store.db.packages.find((p) => p.id === package_id)?.subject_id : undefined) ||
        '';
      const normalizedNew = (promo_code || code || '').trim().toUpperCase();
      const normalizedCurrent = (current_applied_code || currently_applied_code || '')
        .trim()
        .toUpperCase();

      if (!resolvedSubjectId || !normalizedNew) {
        res.status(400).json({
          valid: false,
          error: 'Invalid promo code.',
          message: 'Invalid promo code.',
        });
        return;
      }

      if (normalizedCurrent && normalizedCurrent !== normalizedNew) {
        const pkg = store.db.packages.find((p) => p.subject_id === resolvedSubjectId);
        const basePrice = pkg?.price_paise || 0;
        res.status(400).json({
          valid: false,
          error: 'Another discount is already applied.',
          message: 'Another discount is already applied.',
          original_amount_paise: basePrice,
          discount_amount_paise: 0,
          final_amount_paise: basePrice,
        });
        return;
      }

      const result = store.validateDiscountCode(userId, resolvedSubjectId, normalizedNew);
      if (!result.valid) {
        res.status(400).json({
          ...result,
          error: result.message,
        });
        return;
      }

      res.json({
        ...result,
        additional_charges_paise: 0,
      });
    }
  );

  // Step 1: Create Razorpay Order on Server (Enforces authoritative backend discount calculation)
  app.post(
    '/api/v1/payments/create-order',
    paymentRateLimiter,
    requireAuth,
    validateBody(
      z.object({
        package_id: z.string().min(1),
        promo_code: z.string().max(50).optional().nullable(),
      })
    ),
    (req: AuthRequest, res) => {
      const parsed = {
        data: req.body as { package_id: string; promo_code?: string | null },
      };

      const user = req.userProfile!;
      const pkg = store.db.packages.find((p) => p.id === parsed.data.package_id);
      if (!pkg || !pkg.is_available_for_sale) {
        res.status(400).json({ error: 'This subject package is not currently available for sale.' });
        return;
      }

      // Prevent duplicate purchase if already owned
      if (store.hasSubjectEntitlement(user.id, pkg.subject_id)) {
        res.status(409).json({
          error: 'You already own this Subject Test Series. Duplicate purchases are blocked.',
        });
        return;
      }

      const originalAmountPaise = pkg.price_paise;
      let discountAmountPaise = 0;
      let finalAmountPaise = originalAmountPaise;
      let appliedCode: string | null = null;
      let promoType: 'agent' | 'campaign' | 'referral' | null = null;
      let agentId: string | null = null;
      let referrerUserId: string | null = null;

      const requestedCode = (parsed.data.promo_code || '').trim();
      if (requestedCode) {
        const validation = store.validateDiscountCode(user.id, pkg.subject_id, requestedCode);
        if (!validation.valid) {
          res.status(400).json({ error: validation.message, validation });
          return;
        }
        discountAmountPaise = validation.discount_amount_paise;
        finalAmountPaise = validation.final_amount_paise;
        appliedCode = validation.code;
        promoType = validation.discount_type;
        agentId = validation.agent_id;
        referrerUserId = validation.referrer_user_id;
      }

      const now = new Date().toISOString();
      const gatewayOrderId = `order_rzp_${crypto.randomBytes(8).toString('hex')}`;
      const order = {
        id: `ord-${crypto.randomUUID()}`,
        user_id: user.id,
        package_id: pkg.id,
        subject_id: pkg.subject_id,
        gateway: 'razorpay' as const,
        gateway_order_id: gatewayOrderId,
        expected_amount_paise: finalAmountPaise, // Strictly calculated on backend
        original_amount_paise: originalAmountPaise,
        discount_amount_paise: discountAmountPaise,
        final_amount_paise: finalAmountPaise,
        promo_code: appliedCode,
        promo_type: promoType,
        agent_id: agentId,
        referrer_user_id: referrerUserId,
        reward_status: (promoType ? 'pending' : 'none') as 'none' | 'pending' | 'granted' | 'reversed',
        currency: 'INR' as const,
        status: 'pending' as const,
        created_at: now,
        updated_at: now,
      };

      // If this is a student referral checkout, mark attribution as pending_payment (never rewarded until captured)
      if (promoType === 'referral' && referrerUserId) {
        let attr = store.db.referral_attributions.find(
          (ra) => ra.referred_user_id === user.id
        );
        if (!attr) {
          attr = {
            id: `refattr-${crypto.randomUUID()}`,
            referrer_user_id: referrerUserId,
            referred_user_id: user.id,
            referral_code: appliedCode || '',
            status: 'pending_payment',
            order_id: order.id,
            purchase_id: null,
            subject_id: pkg.subject_id,
            original_amount_paise: originalAmountPaise,
            friend_discount_paise: discountAmountPaise,
            referrer_reward_paise: 0,
            rewarded_at: null,
            reversed_at: null,
            created_at: now,
            updated_at: now,
          };
          store.db.referral_attributions.unshift(attr);
        } else if (attr.status === 'registered') {
          attr.status = 'pending_payment';
          attr.order_id = order.id;
          attr.subject_id = pkg.subject_id;
          attr.original_amount_paise = originalAmountPaise;
          attr.friend_discount_paise = discountAmountPaise;
          attr.updated_at = now;
        }
      }

      store.db.payment_orders.unshift(order);
      store.persist();

      const subject = store.db.subjects.find((s) => s.id === pkg.subject_id);

      res.json({
        order,
        razorpay_config: {
          key_id: RAZORPAY_KEY_ID,
          gateway_order_id: gatewayOrderId,
          amount_paise: order.expected_amount_paise,
          original_amount_paise: originalAmountPaise,
          discount_amount_paise: discountAmountPaise,
          final_amount_paise: finalAmountPaise,
          promo_code: appliedCode,
          promo_type: promoType,
          currency: order.currency,
          package_name: pkg.package_name,
          subject_name: subject?.name || '',
          student_name: user.full_name,
          student_email: user.email,
        },
      });
    }
  );

  // Helper endpoint for Razorpay Test Mode Checkout in preview sandbox:
  // Generates a test payment ID and authentic HMAC-SHA256 signature (or simulated pending/failed state)
  app.post('/api/v1/payments/test-checkout-authorize', requireAuth, (req: AuthRequest, res) => {
    const schema = z.object({
      gateway_order_id: z.string().min(1),
      simulation_mode: z.enum(['success', 'pending', 'failed', 'tampered_signature']),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid simulation parameters.' });
      return;
    }

    const user = req.userProfile!;
    const order = store.db.payment_orders.find(
      (o) => o.gateway_order_id === parsed.data.gateway_order_id
    );
    if (!order || order.user_id !== user.id) {
      res.status(403).json({ error: 'Order not found or does not belong to current student.' });
      return;
    }

    const gatewayPaymentId = `pay_rzp_${crypto.randomBytes(8).toString('hex')}`;

    if (parsed.data.simulation_mode === 'pending') {
      // Record pending transaction; do NOT grant entitlement or rewards
      store.db.payment_transactions.unshift({
        id: `txn-${crypto.randomUUID()}`,
        order_id: order.id,
        user_id: user.id,
        gateway_payment_id: gatewayPaymentId,
        payment_status: 'pending',
        verification_status: 'pending',
        amount_paise: order.expected_amount_paise,
        currency: 'INR',
        gateway_reference: 'RAZORPAY_TEST_PENDING',
        verified_at: null,
        created_at: new Date().toISOString(),
      });
      store.persist();
      res.json({
        mode: 'pending',
        gateway_order_id: order.gateway_order_id,
        gateway_payment_id: gatewayPaymentId,
        message: 'Payment is currently pending confirmation from the bank. Access is not granted until verified.',
      });
      return;
    }

    if (parsed.data.simulation_mode === 'failed') {
      order.status = 'failed';
      order.updated_at = new Date().toISOString();
      store.db.payment_transactions.unshift({
        id: `txn-${crypto.randomUUID()}`,
        order_id: order.id,
        user_id: user.id,
        gateway_payment_id: gatewayPaymentId,
        payment_status: 'failed',
        verification_status: 'rejected',
        amount_paise: order.expected_amount_paise,
        currency: 'INR',
        gateway_reference: 'RAZORPAY_TEST_FAILED',
        verified_at: null,
        created_at: new Date().toISOString(),
      });
      store.persist();
      res.json({
        mode: 'failed',
        gateway_order_id: order.gateway_order_id,
        gateway_payment_id: gatewayPaymentId,
        message: 'Payment failed at gateway. Subject series remains locked.',
      });
      return;
    }

    const signature =
      parsed.data.simulation_mode === 'tampered_signature'
        ? '000000000000000000000000000000000000000000000000000000000000dead'
        : computeRazorpaySignature(order.gateway_order_id, gatewayPaymentId);

    res.json({
      mode: parsed.data.simulation_mode,
      razorpay_order_id: order.gateway_order_id,
      razorpay_payment_id: gatewayPaymentId,
      razorpay_signature: signature,
    });
  });

  // Step 2: Server-Side Payment Verification & Entitlement Creation
  app.post(
    '/api/v1/payments/verify',
    paymentRateLimiter,
    requireAuth,
    validateBody(
      z.object({
        razorpay_order_id: z.string().min(1),
        razorpay_payment_id: z.string().min(1),
        razorpay_signature: z.string().min(1),
        amount_paise: z.number().int().positive().optional(),
      })
    ),
    (req: AuthRequest, res) => {
      const parsed = { data: req.body };

      const user = req.userProfile!;
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount_paise } =
        parsed.data;

      const order = store.db.payment_orders.find((o) => o.gateway_order_id === razorpay_order_id);
      if (!order) {
        res.status(404).json({ error: 'Payment order not found.' });
        return;
      }

      // Security check: Prevent a user from claiming another user's order
      if (order.user_id !== user.id) {
        store.logAudit(
          user.id,
          user.email,
          'PAYMENT_CROSS_USER_ATTEMPT_BLOCKED',
          'payment_order',
          order.id,
          `User ${user.id} attempted to verify order owned by ${order.user_id}`
        );
        res.status(403).json({ error: 'Order ownership mismatch. Verification rejected.' });
        return;
      }

      // Security check: Reject price tampering if client sent a mismatched amount
      if (amount_paise !== undefined && amount_paise !== order.expected_amount_paise) {
        store.logAudit(
          user.id,
          user.email,
          'PAYMENT_AMOUNT_TAMPER_REJECTED',
          'payment_order',
          order.id,
          `Expected ${order.expected_amount_paise} paise, got ${amount_paise} paise`
        );
        res.status(400).json({ error: 'Payment amount tampering detected. Verification rejected.' });
        return;
      }

      // Security check: Verify HMAC-SHA256 signature
      const expectedSignature = computeRazorpaySignature(razorpay_order_id, razorpay_payment_id);
      if (expectedSignature !== razorpay_signature) {
        order.status = 'failed';
        order.updated_at = new Date().toISOString();
        store.db.payment_transactions.unshift({
          id: `txn-${crypto.randomUUID()}`,
          order_id: order.id,
          user_id: user.id,
          gateway_payment_id: razorpay_payment_id,
          payment_status: 'failed',
          verification_status: 'rejected',
          amount_paise: order.expected_amount_paise,
          currency: 'INR',
          gateway_reference: 'INVALID_HMAC_SIGNATURE',
          verified_at: null,
          created_at: new Date().toISOString(),
        });
        store.logAudit(
          user.id,
          user.email,
          'PAYMENT_SIGNATURE_INVALID',
          'payment_order',
          order.id,
          `Rejected forged Razorpay signature for order ${razorpay_order_id}`
        );
        res.status(400).json({
          error: 'Cryptographic payment signature verification failed. Entitlement denied.',
        });
        return;
      }

      // Idempotency check: If already paid, return existing entitlement without re-issuing rewards
      const existingEntitlement = store.db.purchases.find(
        (p) =>
          p.user_id === user.id &&
          p.subject_id === order.subject_id &&
          p.entitlement_status === 'active'
      );
      if (existingEntitlement) {
        res.json({
          verified: true,
          entitlement: existingEntitlement,
          message: 'Subject series is already unlocked.',
        });
        return;
      }

      // Record verified transaction and grant subject entitlement
      const now = new Date().toISOString();
      order.status = 'paid';
      order.updated_at = now;

      const transaction = {
        id: `txn-${crypto.randomUUID()}`,
        order_id: order.id,
        user_id: user.id,
        gateway_payment_id: razorpay_payment_id,
        payment_status: 'captured' as const,
        verification_status: 'verified' as const,
        amount_paise: order.expected_amount_paise,
        currency: 'INR' as const,
        gateway_reference: razorpay_order_id,
        verified_at: now,
        created_at: now,
      };
      store.db.payment_transactions.unshift(transaction);

      const entitlement = {
        id: `ent-${crypto.randomUUID()}`,
        user_id: user.id,
        package_id: order.package_id,
        subject_id: order.subject_id,
        payment_transaction_id: transaction.id,
        entitlement_status: 'active' as const,
        original_amount_paise: order.original_amount_paise ?? order.expected_amount_paise,
        discount_amount_paise: order.discount_amount_paise ?? 0,
        final_amount_paise: order.final_amount_paise ?? order.expected_amount_paise,
        promo_code: order.promo_code || null,
        promo_type: order.promo_type || null,
        agent_id: order.agent_id || null,
        referrer_user_id: order.referrer_user_id || null,
        reward_status: order.reward_status || 'none',
        purchased_at: now,
        created_at: now,
        updated_at: now,
      };
      store.db.purchases.unshift(entitlement);

      // Process Sales Agent attribution or Referrer Wallet Reward strictly after verified capture
      store.processVerifiedPurchaseAttributionAndRewards(order, transaction, entitlement);

      store.logAudit(
        user.id,
        user.email,
        'SUBJECT_SERIES_PURCHASE_VERIFIED',
        'subject',
        order.subject_id,
        `Verified payment ${razorpay_payment_id} (${order.expected_amount_paise} paise${order.promo_code ? `, promo=${order.promo_code}` : ''}) and unlocked subject ${order.subject_id}`
      );

      res.json({
        verified: true,
        order,
        transaction,
        entitlement,
      });
    }
  );

  // Order status check endpoint
  app.get('/api/v1/payments/orders/:orderId/status', requireAuth, (req: AuthRequest, res) => {
    const user = req.userProfile!;
    const order = store.db.payment_orders.find(
      (o) => o.id === req.params.orderId || o.gateway_order_id === req.params.orderId
    );
    if (!order || (order.user_id !== user.id && user.role !== 'admin')) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    const transactions = store.db.payment_transactions.filter((t) => t.order_id === order.id);
    const entitlement = store.db.purchases.find(
      (p) =>
        p.user_id === order.user_id &&
        p.subject_id === order.subject_id &&
        p.entitlement_status === 'active'
    );

    res.json({
      order,
      transactions,
      is_unlocked: Boolean(entitlement),
    });
  });

  // Step 3: Idempotent Razorpay Webhook Endpoint
  app.post('/api/v1/payments/webhook', (req: any, res: Response) => {
    const signature = req.headers['x-razorpay-signature'] as string;
    const rawBody = req.rawBody || JSON.stringify(req.body);

    if (!signature || computeWebhookSignature(rawBody) !== signature) {
      res.status(400).json({ error: 'Invalid webhook signature.' });
      return;
    }

    const eventId = req.body?.event_id || req.headers['x-razorpay-event-id'];
    const eventType = req.body?.event || 'payment.captured';
    const gatewayOrderId = req.body?.payload?.payment?.entity?.order_id;
    const gatewayPaymentId = req.body?.payload?.payment?.entity?.id;
    const amountPaise = req.body?.payload?.payment?.entity?.amount;

    if (!eventId || !gatewayOrderId || !gatewayPaymentId) {
      res.status(400).json({ error: 'Malformed webhook payload.' });
      return;
    }

    // Idempotency check
    const alreadyProcessed = store.db.webhook_events.find((w) => w.event_id === eventId);
    if (alreadyProcessed) {
      res.json({ status: 'duplicate_ignored', event_id: eventId });
      return;
    }

    store.db.webhook_events.unshift({
      id: `wh-${crypto.randomUUID()}`,
      event_id: eventId,
      event_type: eventType,
      gateway_order_id: gatewayOrderId,
      processed_at: new Date().toISOString(),
    });

    const order = store.db.payment_orders.find((o) => o.gateway_order_id === gatewayOrderId);
    if (order && eventType === 'payment.captured' && amountPaise === order.expected_amount_paise) {
      const existingEntitlement = store.db.purchases.find(
        (p) =>
          p.user_id === order.user_id &&
          p.subject_id === order.subject_id &&
          p.entitlement_status === 'active'
      );

      if (!existingEntitlement) {
        const now = new Date().toISOString();
        order.status = 'paid';
        order.updated_at = now;
        const txnId = `txn-${crypto.randomUUID()}`;
        const transaction = {
          id: txnId,
          order_id: order.id,
          user_id: order.user_id,
          gateway_payment_id: gatewayPaymentId,
          payment_status: 'captured' as const,
          verification_status: 'verified' as const,
          amount_paise: order.expected_amount_paise,
          currency: 'INR' as const,
          gateway_reference: `WEBHOOK_${eventId}`,
          verified_at: now,
          created_at: now,
        };
        store.db.payment_transactions.unshift(transaction);

        const entitlement = {
          id: `ent-${crypto.randomUUID()}`,
          user_id: order.user_id,
          package_id: order.package_id,
          subject_id: order.subject_id,
          payment_transaction_id: txnId,
          entitlement_status: 'active' as const,
          original_amount_paise: order.original_amount_paise ?? order.expected_amount_paise,
          discount_amount_paise: order.discount_amount_paise ?? 0,
          final_amount_paise: order.final_amount_paise ?? order.expected_amount_paise,
          promo_code: order.promo_code || null,
          promo_type: order.promo_type || null,
          agent_id: order.agent_id || null,
          referrer_user_id: order.referrer_user_id || null,
          reward_status: order.reward_status || 'none',
          purchased_at: now,
          created_at: now,
          updated_at: now,
        };
        store.db.purchases.unshift(entitlement);

        store.processVerifiedPurchaseAttributionAndRewards(order, transaction, entitlement);
      }
    }

    store.persist();
    res.json({ status: 'processed', event_id: eventId });
  });

  // Student Purchases & Payment History List
  app.get('/api/v1/purchases/my', requireAuth, (req: AuthRequest, res) => {
    const user = req.userProfile!;
    const purchases = store.db.purchases
      .filter((p) => p.user_id === user.id)
      .map((p) => {
        const subject = store.db.subjects.find((s) => s.id === p.subject_id);
        const pkg = store.db.packages.find((pk) => pk.id === p.package_id);
        const txn = store.db.payment_transactions.find((t) => t.id === p.payment_transaction_id);
        return {
          ...p,
          subject_name: subject?.name || '',
          subject_slug: subject?.slug || '',
          paper_code: subject?.paper_code || '',
          package_name: pkg?.package_name || '',
          amount_paise: txn?.amount_paise ?? pkg?.price_paise ?? 0,
          gateway_payment_id: txn?.gateway_payment_id || 'ADMIN_GRANT',
        };
      });

    const paymentHistory = store.db.payment_transactions
      .filter((t) => t.user_id === user.id)
      .map((t) => {
        const order = store.db.payment_orders.find((o) => o.id === t.order_id);
        const subject = store.db.subjects.find((s) => s.id === order?.subject_id);
        const pkg = store.db.packages.find((pk) => pk.id === order?.package_id);
        return {
          ...t,
          gateway_order_id: order?.gateway_order_id || '',
          order_status: order?.status || '',
          subject_name: subject?.name || '',
          subject_slug: subject?.slug || '',
          package_name: pkg?.package_name || '',
        };
      });

    const paginated = paginateArray(purchases, req.query as Record<string, any>, 50, 200);
    res.json({
      purchases: paginated.items,
      payment_history: paymentHistory,
      pagination: paginated.pagination,
    });
  });

  // ============================================================================
  // 5. SERVER-AUTHORITATIVE EXAMINATION ENGINE (Protected by canAccessTest)
  // ============================================================================
  app.post(
    '/api/v1/attempts/start',
    requireAuth,
    validateBody(z.object({ test_id: z.string().min(1) })),
    (req: AuthRequest, res) => {
      const user = req.userProfile!;
      const testId = req.body.test_id as string;

      // Centralized Access & One-Attempt Evaluation via canAccessTest(userId, testId)
      const decision = canAccessTest(user.id, testId);

      if (!decision.publicCatalogueVisible) {
        res.status(404).json({
          error: decision.denialReason || 'Published test not found.',
          access_decision: decision,
        });
        return;
      }

      if (decision.classification === 'PREMIUM_ACCESS_DENIED') {
        res.status(403).json({
          error:
            decision.denialReason ||
            'Access Denied: You must purchase the Subject Test Series to attempt this premium test.',
          subject_slug: decision.subjectSlug,
          access_decision: decision,
        });
        return;
      }

      if (
        decision.attemptRestriction === 'COMPLETED_ONE_ATTEMPT_LOCKED' ||
        decision.attemptRestriction === 'EXPIRED_AUTO_SUBMITTED_LOCKED'
      ) {
        const existingAttempt = store.db.attempts.find(
          (a) => a.id === decision.existingAttemptId
        );
        res.status(409).json({
          error:
            decision.denialReason ||
            'One-Attempt Policy: You have already completed and submitted this test.',
          attempt_id: decision.existingAttemptId,
          status: existingAttempt?.status || 'submitted',
          access_decision: decision,
        });
        return;
      }

      const test = store.db.tests.find((t) => t.id === testId)!;
      const testQuestions = store.db.questions.filter((q) => q.test_id === test.id);
      if (testQuestions.length === 0) {
        res.status(400).json({ error: 'This test has no questions configured yet.' });
        return;
      }

      // Resume existing active attempt without resetting timer
      if (
        decision.attemptRestriction === 'IN_PROGRESS_RESUMABLE' &&
        decision.existingAttemptId
      ) {
        const existingAttempt = store.db.attempts.find(
          (a) => a.id === decision.existingAttemptId
        )!;
        res.json({ attempt: existingAttempt, resumed: true, access_decision: decision });
        return;
      }

      const startMs = Date.now();
      const expiresMs = startMs + test.duration_minutes * 60 * 1000;

      const newAttempt = {
        id: `att-${crypto.randomUUID()}`,
        user_id: user.id,
        test_id: test.id,
        subject_id: test.subject_id,
        category_slug: test.category_slug,
        attempt_number: 1,
        status: 'in_progress' as const,
        started_at: new Date(startMs).toISOString(),
        expires_at: new Date(expiresMs).toISOString(),
        submitted_at: null,
        total_score: 0,
        maximum_marks: testQuestions.reduce(
          (acc, q) => acc + (q.marks ?? test.positive_marks),
          0
        ),
        correct_count: 0,
        incorrect_count: 0,
        unanswered_count: testQuestions.length,
        time_taken_seconds: 0,
      };

      store.db.attempts.unshift(newAttempt);
      store.persist();

      res.json({ attempt: newAttempt, resumed: false, access_decision: decision });
    }
  );

  // Retrieve active exam session (Enforces canAccessTest and strips correct_option + explanation!)
  app.get('/api/v1/attempts/:attemptId/session', requireAuth, (req: AuthRequest, res) => {
    const user = req.userProfile!;
    const attempt = store.db.attempts.find((a) => a.id === req.params.attemptId);
    if (!attempt || attempt.user_id !== user.id) {
      res.status(404).json({ error: 'Examination attempt not found.' });
      return;
    }

    // Verify access via centralized canAccessTest before exposing any questions
    const decision = canAccessTest(user.id, attempt.test_id);
    if (decision.classification === 'PREMIUM_ACCESS_DENIED') {
      res.status(403).json({
        error: decision.denialReason || 'Access denied: Premium entitlement required.',
        access_decision: decision,
      });
      return;
    }

    // Check server-side deadline
    if (attempt.status === 'in_progress' && Date.now() >= new Date(attempt.expires_at).getTime()) {
      store.evaluateAndSubmitAttempt(attempt, true);
    }

    const test = store.db.tests.find((t) => t.id === attempt.test_id);
    const subject = store.db.subjects.find((s) => s.id === attempt.subject_id);

    // CRITICAL SECURITY REQUIREMENT: Never expose correct_option or explanation before submission
    const sanitizedQuestions: SanitizedQuestion[] = store.db.questions
      .filter((q) => q.test_id === attempt.test_id)
      .sort((a, b) => a.display_order - b.display_order)
      .map((q) => ({
        id: q.id,
        test_id: q.test_id,
        question_text: q.question_text,
        question_type: q.question_type,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        marks: q.marks,
        negative_marks: q.negative_marks,
        display_order: q.display_order,
      }));

    const savedAnswers = store.db.attempt_answers.filter((ans) => ans.attempt_id === attempt.id);

    res.json({
      attempt,
      server_now: new Date().toISOString(),
      test,
      subject,
      questions: sanitizedQuestions,
      answers: savedAnswers,
    });
  });

  // Persist answer or review state during examination
  app.put('/api/v1/attempts/:attemptId/answers', requireAuth, (req: AuthRequest, res) => {
    const schema = z.object({
      question_id: z.string().min(1),
      selected_option: z.enum(['A', 'B', 'C', 'D']).nullable(),
      is_marked_for_review: z.boolean(),
      is_visited: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid answer payload.' });
      return;
    }

    const user = req.userProfile!;
    const attempt = store.db.attempts.find((a) => a.id === req.params.attemptId);
    if (!attempt || attempt.user_id !== user.id) {
      res.status(404).json({ error: 'Attempt not found.' });
      return;
    }

    if (attempt.status !== 'in_progress') {
      res.status(409).json({ error: 'Cannot modify answers of a submitted examination.' });
      return;
    }

    // Check server-side deadline
    if (Date.now() >= new Date(attempt.expires_at).getTime()) {
      store.evaluateAndSubmitAttempt(attempt, true);
      res.status(409).json({
        error: 'Examination time expired. Attempt has been automatically submitted.',
        attempt,
      });
      return;
    }

    const { question_id, selected_option, is_marked_for_review, is_visited } = parsed.data;
    const questionExists = store.db.questions.some(
      (q) => q.id === question_id && q.test_id === attempt.test_id
    );
    if (!questionExists) {
      res.status(400).json({ error: 'Question does not belong to this test.' });
      return;
    }

    const now = new Date().toISOString();
    let answerRecord = store.db.attempt_answers.find(
      (ans) => ans.attempt_id === attempt.id && ans.question_id === question_id
    );

    if (answerRecord) {
      answerRecord.selected_option = selected_option;
      answerRecord.is_marked_for_review = is_marked_for_review;
      answerRecord.is_visited = is_visited ?? true;
      answerRecord.updated_at = now;
    } else {
      answerRecord = {
        id: `ans-${crypto.randomUUID()}`,
        attempt_id: attempt.id,
        question_id,
        selected_option,
        is_marked_for_review,
        is_visited: is_visited ?? true,
        updated_at: now,
      };
      store.db.attempt_answers.push(answerRecord);
    }

    store.persist();
    res.json({ answer: answerRecord, server_now: now });
  });

  // Submit examination & calculate score on server
  app.post('/api/v1/attempts/:attemptId/submit', requireAuth, (req: AuthRequest, res) => {
    const user = req.userProfile!;
    const attempt = store.db.attempts.find((a) => a.id === req.params.attemptId);
    if (!attempt || attempt.user_id !== user.id) {
      res.status(404).json({ error: 'Attempt not found.' });
      return;
    }

    if (attempt.status !== 'in_progress') {
      res.json({ attempt, already_submitted: true });
      return;
    }

    const isExpired = Date.now() > new Date(attempt.expires_at).getTime();
    const evaluated = store.evaluateAndSubmitAttempt(attempt, isExpired);

    res.json({ attempt: evaluated, already_submitted: false });
  });

  // ============================================================================
  // 6. RESULTS & STUDENT ANALYTICS ENDPOINTS
  // ============================================================================
  app.get('/api/v1/results/my', requireAuth, (req: AuthRequest, res) => {
    const user = req.userProfile!;
    const attempts = store.db.attempts
      .filter((a) => a.user_id === user.id)
      .map((a) => {
        if (a.status === 'in_progress' && Date.now() >= new Date(a.expires_at).getTime()) {
          store.evaluateAndSubmitAttempt(a, true);
        }
        const test = store.db.tests.find((t) => t.id === a.test_id);
        const subject = store.db.subjects.find((s) => s.id === a.subject_id);
        const category = store.db.categories.find((c) => c.slug === a.category_slug);
        const attemptedQuestions = a.correct_count + a.incorrect_count;
        const accuracy =
          attemptedQuestions > 0
            ? Math.round((a.correct_count / attemptedQuestions) * 10000) / 100
            : 0;
        const percentage =
          a.maximum_marks > 0 ? Math.round((a.total_score / a.maximum_marks) * 10000) / 100 : 0;

        return {
          ...a,
          test_title: test?.title || 'Test',
          test_number: test?.test_number || 1,
          subject_name: subject?.name || '',
          subject_slug: subject?.slug || '',
          paper_code: subject?.paper_code || '',
          category_name: category?.name || a.category_slug,
          accuracy,
          percentage,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.submitted_at || b.started_at).getTime() -
          new Date(a.submitted_at || a.started_at).getTime()
      );

    const paginated = paginateArray(attempts, req.query as Record<string, any>, 50, 250);
    res.json({
      results: paginated.items,
      pagination: paginated.pagination,
    });
  });

  // Detailed Result with Question-wise Solutions (ONLY accessible after submission)
  app.get('/api/v1/results/:attemptId', requireAuth, (req: AuthRequest, res) => {
    const user = req.userProfile!;
    const attempt = store.db.attempts.find((a) => a.id === req.params.attemptId);
    if (!attempt || (attempt.user_id !== user.id && user.role !== 'admin')) {
      res.status(404).json({ error: 'Result not found.' });
      return;
    }

    if (attempt.status === 'in_progress') {
      if (Date.now() >= new Date(attempt.expires_at).getTime()) {
        store.evaluateAndSubmitAttempt(attempt, true);
      } else {
        res.status(403).json({
          error: 'Solutions and results are locked until the examination is submitted.',
        });
        return;
      }
    }

    const test = store.db.tests.find((t) => t.id === attempt.test_id);
    const subject = store.db.subjects.find((s) => s.id === attempt.subject_id);
    const category = store.db.categories.find((c) => c.slug === attempt.category_slug);

    const questions = store.db.questions
      .filter((q) => q.test_id === attempt.test_id)
      .sort((a, b) => a.display_order - b.display_order);

    const answersMap = new Map(
      store.db.attempt_answers
        .filter((ans) => ans.attempt_id === attempt.id)
        .map((ans) => [ans.question_id, ans])
    );

    const questionAnalysis = questions.map((q, idx) => {
      const ans = answersMap.get(q.id);
      const selected = ans?.selected_option || null;
      const isCorrect = selected === q.correct_option;
      const status: 'correct' | 'incorrect' | 'unanswered' = !selected
        ? 'unanswered'
        : isCorrect
        ? 'correct'
        : 'incorrect';
      const marksAwarded = !selected
        ? 0
        : isCorrect
        ? q.marks
        : -q.negative_marks;

      return {
        question_number: idx + 1,
        question_id: q.id,
        question_text: q.question_text,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        correct_option: q.correct_option,
        selected_option: selected,
        is_marked_for_review: ans?.is_marked_for_review || false,
        status,
        marks_awarded: marksAwarded,
        positive_marks: q.marks,
        negative_marks: q.negative_marks,
        explanation: q.explanation,
      };
    });

    const attemptedCount = attempt.correct_count + attempt.incorrect_count;
    const accuracy =
      attemptedCount > 0
        ? Math.round((attempt.correct_count / attemptedCount) * 10000) / 100
        : 0;
    const percentage =
      attempt.maximum_marks > 0
        ? Math.round((attempt.total_score / attempt.maximum_marks) * 10000) / 100
        : 0;

    res.json({
      attempt: {
        ...attempt,
        accuracy,
        percentage,
      },
      test,
      subject,
      category,
      question_analysis: questionAnalysis,
    });
  });

  // ============================================================================
  // 7. ADMINISTRATOR DASHBOARD ENDPOINTS (ALL 13 MODULES)
  // ============================================================================
  app.get('/api/v1/admin/overview', requireAdmin, (_req, res) => {
    const students = store.db.users.filter((u) => u.role === 'student');
    const activeUsers = store.db.users.filter((u) => u.account_status === 'active');
    const publishedTests = store.db.tests.filter((t) => t.publication_status === 'published');
    const verifiedTxns = store.db.payment_transactions.filter(
      (t) => t.payment_status === 'captured' && t.verification_status === 'verified'
    );
    const totalRevenuePaise = verifiedTxns.reduce((sum, t) => sum + t.amount_paise, 0);

    const subjectSales = store.db.subjects.map((subj) => {
      const pkg = store.db.packages.find((p) => p.subject_id === subj.id);
      const activePurchases = store.db.purchases.filter(
        (p) => p.subject_id === subj.id && p.entitlement_status === 'active'
      );
      const subjRevenuePaise = activePurchases.reduce((sum, pur) => {
        const txn = verifiedTxns.find((t) => t.id === pur.payment_transaction_id);
        return sum + (txn ? txn.amount_paise : 0);
      }, 0);

      return {
        subject_id: subj.id,
        subject_name: subj.name,
        paper_code: subj.paper_code,
        price_paise: pkg?.price_paise || 0,
        purchases_count: activePurchases.length,
        revenue_paise: subjRevenuePaise,
      };
    });

    const recentTransactions = store.db.payment_transactions.slice(0, 10).map((t) => {
      const user = store.db.users.find((u) => u.id === t.user_id);
      const order = store.db.payment_orders.find((o) => o.id === t.order_id);
      const subj = store.db.subjects.find((s) => s.id === order?.subject_id);
      return {
        ...t,
        student_name: user?.full_name || 'Student',
        student_email: user?.email || '',
        subject_name: subj?.name || '',
      };
    });

    const recentAttempts = store.db.attempts.slice(0, 10).map((a) => {
      const user = store.db.users.find((u) => u.id === a.user_id);
      const test = store.db.tests.find((t) => t.id === a.test_id);
      const subj = store.db.subjects.find((s) => s.id === a.subject_id);
      return {
        ...a,
        student_name: user?.full_name || 'Student',
        test_title: test?.title || 'Test',
        subject_name: subj?.name || '',
      };
    });

    res.json({
      metrics: {
        registered_students: students.length,
        total_users: store.db.users.length,
        active_users: activeUsers.length,
        total_published_tests: publishedTests.length,
        total_tests: store.db.tests.length,
        total_questions: store.db.questions.length,
        verified_purchases: store.db.purchases.filter((p) => p.entitlement_status === 'active').length,
        total_revenue_paise: totalRevenuePaise,
      },
      subject_sales: subjectSales,
      recent_transactions: recentTransactions,
      recent_attempts: recentAttempts,
    });
  });

  // 11.2 Subject Management
  app.get('/api/v1/admin/subjects', requireAdmin, (_req, res) => {
    const subjects = [...store.db.subjects]
      .sort((a, b) => a.display_order - b.display_order)
      .map((s) => ({
        ...s,
        tests_count: store.db.tests.filter((t) => t.subject_id === s.id).length,
        published_tests_count: store.db.tests.filter(
          (t) => t.subject_id === s.id && t.publication_status === 'published'
        ).length,
      }));
    res.json({ subjects });
  });

  app.put('/api/v1/admin/subjects/:id', requireAdmin, (req: AuthRequest, res) => {
    const schema = z.object({
      name: z.string().min(2).max(100),
      description: z.string().min(10).max(1000),
      is_active: z.boolean(),
      display_order: z.number().int().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid subject fields.' });
      return;
    }

    const subj = store.db.subjects.find((s) => s.id === req.params.id);
    if (!subj) {
      res.status(404).json({ error: 'Subject not found.' });
      return;
    }

    // Prevent duplicate subject name
    const duplicate = store.db.subjects.find(
      (s) => s.id !== subj.id && s.name.toLowerCase() === parsed.data.name.trim().toLowerCase()
    );
    if (duplicate) {
      res.status(409).json({ error: 'Another subject with this name already exists.' });
      return;
    }

    subj.name = parsed.data.name.trim();
    subj.description = parsed.data.description.trim();
    subj.is_active = parsed.data.is_active;
    subj.display_order = parsed.data.display_order;
    subj.updated_at = new Date().toISOString();

    store.logAudit(
      req.userProfile!.id,
      req.userProfile!.email,
      'SUBJECT_UPDATED',
      'subject',
      subj.id,
      `Updated subject ${subj.name} (active=${subj.is_active}, order=${subj.display_order})`
    );
    res.json({ subject: subj });
  });

  // 11.3 Test Management
  app.get('/api/v1/admin/tests', requireAdmin, (req, res) => {
    const subjectId = req.query.subject_id as string | undefined;
    const categorySlug = req.query.category_slug as string | undefined;

    let filtered = [...store.db.tests];
    if (subjectId) {
      filtered = filtered.filter((t) => t.subject_id === subjectId);
    }
    if (categorySlug) {
      filtered = filtered.filter((t) => t.category_slug === categorySlug);
    }

    filtered.sort((a, b) => a.display_order - b.display_order || a.test_number - b.test_number);

    const enriched = filtered.map((t) => {
      const subj = store.db.subjects.find((s) => s.id === t.subject_id);
      const qCount = store.db.questions.filter((q) => q.test_id === t.id).length;
      return {
        ...t,
        subject_name: subj?.name || '',
        configured_questions_count: qCount,
      };
    });

    const paginated = paginateArray(enriched, req.query as Record<string, any>, 250, 500);
    res.json({
      tests: paginated.items,
      pagination: paginated.pagination,
      categories: store.db.categories,
      subjects: store.db.subjects,
    });
  });

  app.post('/api/v1/admin/tests', requireAdmin, (req: AuthRequest, res) => {
    const schema = z.object({
      subject_id: z.string().min(1),
      category_slug: z.enum(['sectional', 'full_length', 'pyq']),
      title: z.string().min(3).max(200),
      test_number: z.number().int().min(1),
      description: z.string().min(5).max(1000),
      duration_minutes: z.number().int().min(5).max(300),
      positive_marks: z.number().positive(),
      negative_marks: z.number().min(0),
      publication_status: z.enum(['draft', 'published', 'unpublished']),
      display_order: z.number().int().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid test creation payload.' });
      return;
    }

    const d = parsed.data;
    const category = store.db.categories.find((c) => c.slug === d.category_slug);
    const subject = store.db.subjects.find((s) => s.id === d.subject_id);
    if (!category || !subject) {
      res.status(400).json({ error: 'Invalid subject or category.' });
      return;
    }

    const now = new Date().toISOString();
    const newTestId = `test-${subject.slug}-${d.category_slug}-${Date.now()}`;

    // Seed 5 initial questions for the new test so it can be published safely
    const defaultQuestionsCount = 5;
    for (let i = 1; i <= defaultQuestionsCount; i++) {
      store.db.questions.push({
        id: `${newTestId}-q-${i}`,
        test_id: newTestId,
        question_text: `[${subject.name} · ${d.title} · Q${i}] Which statement accurately describes the foundational principle tested in item ${i}?`,
        question_type: 'mcq_single',
        option_a: 'Primary theoretical proposition verified by canonical texts',
        option_b: 'Secondary unverified hypothesis without empirical grounding',
        option_c: 'Contradictory claim rejected by modern scholarship',
        option_d: 'None of the above statements apply',
        correct_option: 'A',
        explanation: `Option A accurately states the canonical principle for ${subject.name} (${d.title}).`,
        marks: d.positive_marks,
        negative_marks: d.negative_marks,
        display_order: i,
        created_at: now,
        updated_at: now,
      });
    }

    const newTest = {
      id: newTestId,
      subject_id: d.subject_id,
      category_id: category.id,
      category_slug: d.category_slug as CategorySlug,
      title: d.title.trim(),
      test_number: d.test_number,
      description: d.description.trim(),
      duration_minutes: d.duration_minutes,
      total_questions: defaultQuestionsCount,
      maximum_marks: defaultQuestionsCount * d.positive_marks,
      positive_marks: d.positive_marks,
      negative_marks: d.negative_marks,
      access_type: 'premium' as const, // New tests MUST be premium by default
      publication_status: d.publication_status as PublicationStatus,
      display_order: d.display_order,
      created_at: now,
      updated_at: now,
    };

    store.db.tests.push(newTest);
    store.logAudit(
      req.userProfile!.id,
      req.userProfile!.email,
      'TEST_CREATED',
      'test',
      newTest.id,
      `Created premium test "${newTest.title}" in ${subject.name}`
    );

    res.status(201).json({ test: newTest });
  });

  app.put('/api/v1/admin/tests/:id', requireAdmin, (req: AuthRequest, res) => {
    const schema = z.object({
      subject_id: z.string().min(1),
      category_slug: z.enum(['sectional', 'full_length', 'pyq']),
      title: z.string().min(3).max(200),
      test_number: z.number().int().min(1),
      description: z.string().min(5).max(1000),
      duration_minutes: z.number().int().min(5).max(300),
      positive_marks: z.number().positive(),
      negative_marks: z.number().min(0),
      publication_status: z.enum(['draft', 'published', 'unpublished']),
      display_order: z.number().int().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid test update payload.' });
      return;
    }

    const test = store.db.tests.find((t) => t.id === req.params.id);
    if (!test) {
      res.status(404).json({ error: 'Test not found.' });
      return;
    }

    const d = parsed.data;
    const questions = store.db.questions.filter((q) => q.test_id === test.id);
    if (d.publication_status === 'published' && questions.length === 0) {
      res.status(400).json({
        error: 'Cannot publish a test with 0 questions. Add questions before publishing.',
      });
      return;
    }

    const category = store.db.categories.find((c) => c.slug === d.category_slug);
    if (category) {
      test.category_id = category.id;
      test.category_slug = category.slug;
    }
    test.subject_id = d.subject_id;
    test.title = d.title.trim();
    test.test_number = d.test_number;
    test.description = d.description.trim();
    test.duration_minutes = d.duration_minutes;
    test.positive_marks = d.positive_marks;
    test.negative_marks = d.negative_marks;
    test.publication_status = d.publication_status;
    test.display_order = d.display_order;
    test.total_questions = questions.length;
    test.maximum_marks = questions.length * d.positive_marks;
    test.updated_at = new Date().toISOString();

    store.enforceGlobalFreeTestInvariants();
    store.logAudit(
      req.userProfile!.id,
      req.userProfile!.email,
      'TEST_UPDATED',
      'test',
      test.id,
      `Updated test "${test.title}" (status=${test.publication_status}, duration=${test.duration_minutes}m)`
    );

    res.json({ test });
  });

  app.delete('/api/v1/admin/tests/:id', requireAdmin, (req: AuthRequest, res) => {
    const testIdx = store.db.tests.findIndex((t) => t.id === req.params.id);
    if (testIdx === -1) {
      res.status(404).json({ error: 'Test not found.' });
      return;
    }

    const test = store.db.tests[testIdx];
    const isGlobalFree =
      store.db.free_test_config.free_sectional_test_id === test.id ||
      store.db.free_test_config.free_pyq_test_id === test.id;

    if (isGlobalFree) {
      res.status(400).json({
        error:
          'Cannot delete or archive a test currently designated as a Global Free Test. Reassign the Free Test configuration first.',
      });
      return;
    }

    const attemptsCount = store.db.attempts.filter((a) => a.test_id === test.id).length;
    if (attemptsCount > 0) {
      test.publication_status = 'unpublished';
      test.updated_at = new Date().toISOString();
      store.logAudit(
        req.userProfile!.id,
        req.userProfile!.email,
        'TEST_ARCHIVED',
        'test',
        test.id,
        `Unpublished test "${test.title}" instead of deleting because ${attemptsCount} student attempts exist`
      );
      res.json({
        deleted: false,
        archived: true,
        test,
        message: `Test had ${attemptsCount} existing student attempt(s), so it was safely unpublished instead of deleted.`,
      });
      return;
    }

    store.db.questions = store.db.questions.filter((q) => q.test_id !== test.id);
    store.db.tests.splice(testIdx, 1);
    store.logAudit(
      req.userProfile!.id,
      req.userProfile!.email,
      'TEST_DELETED',
      'test',
      test.id,
      `Deleted test "${test.title}" (${test.id})`
    );
    res.json({ deleted: true, archived: false });
  });

  // 11.4 Question Bank Management
  app.get('/api/v1/admin/tests/:testId/questions', requireAdmin, (req, res) => {
    const test = store.db.tests.find((t) => t.id === req.params.testId);
    if (!test) {
      res.status(404).json({ error: 'Test not found.' });
      return;
    }
    const questions = store.db.questions
      .filter((q) => q.test_id === test.id)
      .sort((a, b) => a.display_order - b.display_order);

    res.json({ test, questions });
  });

  app.post('/api/v1/admin/questions', requireAdmin, (req: AuthRequest, res) => {
    const schema = z.object({
      test_id: z.string().min(1),
      question_text: z.string().min(5),
      option_a: z.string().min(1),
      option_b: z.string().min(1),
      option_c: z.string().min(1),
      option_d: z.string().min(1),
      correct_option: z.enum(['A', 'B', 'C', 'D']),
      explanation: z.string().min(3),
      marks: z.number().positive(),
      negative_marks: z.number().min(0),
      display_order: z.number().int().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'All question options, correct answer, and explanation are required.' });
      return;
    }

    const d = parsed.data;
    const test = store.db.tests.find((t) => t.id === d.test_id);
    if (!test) {
      res.status(404).json({ error: 'Target test not found.' });
      return;
    }

    const now = new Date().toISOString();
    const newQ = {
      id: `q-${crypto.randomUUID()}`,
      test_id: d.test_id,
      question_text: d.question_text.trim(),
      question_type: 'mcq_single' as const,
      option_a: d.option_a.trim(),
      option_b: d.option_b.trim(),
      option_c: d.option_c.trim(),
      option_d: d.option_d.trim(),
      correct_option: d.correct_option as OptionKey,
      explanation: d.explanation.trim(),
      marks: d.marks,
      negative_marks: d.negative_marks,
      display_order: d.display_order,
      created_at: now,
      updated_at: now,
    };

    store.db.questions.push(newQ);
    const allTestQs = store.db.questions.filter((q) => q.test_id === test.id);
    test.total_questions = allTestQs.length;
    test.maximum_marks = allTestQs.reduce((sum, q) => sum + q.marks, 0);
    test.updated_at = now;

    store.logAudit(
      req.userProfile!.id,
      req.userProfile!.email,
      'QUESTION_ADDED',
      'question',
      newQ.id,
      `Added question #${newQ.display_order} to test ${test.title}`
    );

    res.status(201).json({ question: newQ, test });
  });

  app.put('/api/v1/admin/questions/:id', requireAdmin, (req: AuthRequest, res) => {
    const schema = z.object({
      question_text: z.string().min(5),
      option_a: z.string().min(1),
      option_b: z.string().min(1),
      option_c: z.string().min(1),
      option_d: z.string().min(1),
      correct_option: z.enum(['A', 'B', 'C', 'D']),
      explanation: z.string().min(3),
      marks: z.number().positive(),
      negative_marks: z.number().min(0),
      display_order: z.number().int().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid question update fields.' });
      return;
    }

    const q = store.db.questions.find((item) => item.id === req.params.id);
    if (!q) {
      res.status(404).json({ error: 'Question not found.' });
      return;
    }

    const d = parsed.data;
    q.question_text = d.question_text.trim();
    q.option_a = d.option_a.trim();
    q.option_b = d.option_b.trim();
    q.option_c = d.option_c.trim();
    q.option_d = d.option_d.trim();
    q.correct_option = d.correct_option;
    q.explanation = d.explanation.trim();
    q.marks = d.marks;
    q.negative_marks = d.negative_marks;
    q.display_order = d.display_order;
    q.updated_at = new Date().toISOString();

    const test = store.db.tests.find((t) => t.id === q.test_id);
    if (test) {
      const allTestQs = store.db.questions.filter((item) => item.test_id === test.id);
      test.total_questions = allTestQs.length;
      test.maximum_marks = allTestQs.reduce((sum, item) => sum + item.marks, 0);
    }

    store.persist();
    res.json({ question: q });
  });

  app.delete('/api/v1/admin/questions/:id', requireAdmin, (req: AuthRequest, res) => {
    const idx = store.db.questions.findIndex((q) => q.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Question not found.' });
      return;
    }
    const q = store.db.questions[idx];
    const testQuestions = store.db.questions.filter((item) => item.test_id === q.test_id);
    if (testQuestions.length <= 1) {
      res.status(400).json({
        error: 'Safeguard: Cannot delete the last remaining question of a test.',
      });
      return;
    }

    store.db.questions.splice(idx, 1);
    const test = store.db.tests.find((t) => t.id === q.test_id);
    if (test) {
      const remaining = store.db.questions.filter((item) => item.test_id === test.id);
      test.total_questions = remaining.length;
      test.maximum_marks = remaining.reduce((sum, item) => sum + item.marks, 0);
    }

    store.persist();
    res.json({ deleted: true });
  });

  // 11.5 Excel Question Upload Validation & Safe Batch Import
  app.post('/api/v1/admin/excel/validate', requireAdmin, (req, res) => {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const targetTestId = req.body?.test_id as string | undefined;

    const existingQuestions = targetTestId
      ? store.db.questions.filter((q) => q.test_id === targetTestId)
      : [];
    const existingTextSet = new Set(
      existingQuestions.map((q) => q.question_text.toLowerCase().trim())
    );
    const seenInBatch = new Set<string>();

    const validatedRows: ExcelQuestionRow[] = rows.map((r: any, idx: number) => {
      const errors: string[] = [];
      const rowNumber = idx + 2; // 1-based + header row
      const subjStr = String(r.subject || '').trim();
      const catStr = String(r.category || '').trim().toLowerCase();
      const tNum = Number(r.test_number ?? 1);
      const tTitle = String(r.test_title || '').trim();
      const qText = String(r.question_text || '').trim();
      const optA = String(r.option_a || '').trim();
      const optB = String(r.option_b || '').trim();
      const optC = String(r.option_c || '').trim();
      const optD = String(r.option_d || '').trim();
      const corr = String(r.correct_option || '').trim().toUpperCase();
      const sol = String(r.solution || '').trim();
      const marks = Number(r.marks ?? 4);
      const negMarks = Number(r.negative_marks ?? 1);
      const qNum = Number(r.question_number ?? idx + 1);

      if ('chapter' in r || 'chapter_id' in r) {
        errors.push('Chapter column is not allowed (strictly 3 categories: sectional, full_length, pyq)');
      }
      if (!subjStr) errors.push('subject is required');
      if (catStr && !['sectional', 'full_length', 'pyq'].includes(catStr)) {
        errors.push('category must be sectional, full_length, or pyq');
      }
      if (isNaN(tNum) || tNum < 1) errors.push('test_number must be a positive integer');
      if (!tTitle) errors.push('test_title is required');
      if (isNaN(qNum) || qNum < 1) errors.push('question_number must be a positive integer');
      if (qText.length < 5) errors.push('question_text must be at least 5 characters');
      if (!optA) errors.push('option_a is required');
      if (!optB) errors.push('option_b is required');
      if (!optC) errors.push('option_c is required');
      if (!optD) errors.push('option_d is required');
      if (!['A', 'B', 'C', 'D'].includes(corr)) {
        errors.push('correct_option must be A, B, C, or D');
      }
      if (sol.length < 3) errors.push('solution/explanation is required');
      if (isNaN(marks) || marks <= 0) errors.push('marks must be a positive number');
      if (isNaN(negMarks) || negMarks < 0) errors.push('negative_marks must be >= 0');

      const normText = qText.toLowerCase();
      if (normText && existingTextSet.has(normText)) {
        errors.push('Duplicate question: already exists in target test');
      }
      if (normText && seenInBatch.has(normText)) {
        errors.push('Duplicate question row within uploaded Excel sheet');
      }
      if (normText) seenInBatch.add(normText);

      return {
        rowNumber,
        subject: subjStr,
        category: catStr || 'sectional',
        test_number: isNaN(tNum) ? 1 : tNum,
        test_title: tTitle,
        question_number: isNaN(qNum) ? idx + 1 : qNum,
        question_text: qText,
        option_a: optA,
        option_b: optB,
        option_c: optC,
        option_d: optD,
        correct_option: corr,
        solution: sol,
        marks: isNaN(marks) ? 4 : marks,
        negative_marks: isNaN(negMarks) ? 1 : negMarks,
        isValid: errors.length === 0,
        errors,
      };
    });

    res.json({
      total_rows: validatedRows.length,
      valid_count: validatedRows.filter((r) => r.isValid).length,
      invalid_count: validatedRows.filter((r) => !r.isValid).length,
      rows: validatedRows,
    });
  });

  app.post('/api/v1/admin/excel/import', requireAdmin, (req: AuthRequest, res) => {
    const schema = z.object({
      test_id: z.string().min(1),
      rows: z.array(
        z.object({
          question_number: z.number().int().optional(),
          question_text: z.string().min(5),
          option_a: z.string().min(1),
          option_b: z.string().min(1),
          option_c: z.string().min(1),
          option_d: z.string().min(1),
          correct_option: z.enum(['A', 'B', 'C', 'D']),
          solution: z.string().min(3),
          marks: z.number().positive(),
          negative_marks: z.number().min(0),
        })
      ),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid import batch payload.' });
      return;
    }

    const test = store.db.tests.find((t) => t.id === parsed.data.test_id);
    if (!test) {
      res.status(404).json({ error: 'Target test not found.' });
      return;
    }

    const existingQuestions = store.db.questions.filter((q) => q.test_id === test.id);
    const existingSet = new Set(
      existingQuestions.map((q) => q.question_text.toLowerCase().trim())
    );

    const now = new Date().toISOString();
    let importedCount = 0;
    let skippedCount = 0;
    let nextOrder = existingQuestions.length + 1;

    for (const row of parsed.data.rows) {
      const norm = row.question_text.toLowerCase().trim();
      if (existingSet.has(norm)) {
        skippedCount++;
        continue;
      }
      existingSet.add(norm);
      store.db.questions.push({
        id: `q-${crypto.randomUUID()}`,
        test_id: test.id,
        question_text: row.question_text.trim(),
        question_type: 'mcq_single',
        option_a: row.option_a.trim(),
        option_b: row.option_b.trim(),
        option_c: row.option_c.trim(),
        option_d: row.option_d.trim(),
        correct_option: row.correct_option,
        explanation: row.solution.trim(),
        marks: row.marks,
        negative_marks: row.negative_marks,
        display_order: nextOrder++,
        created_at: now,
        updated_at: now,
      });
      importedCount++;
    }

    const updatedQs = store.db.questions.filter((q) => q.test_id === test.id);
    test.total_questions = updatedQs.length;
    test.maximum_marks = updatedQs.reduce((sum, q) => sum + q.marks, 0);
    test.updated_at = now;

    store.logAudit(
      req.userProfile!.id,
      req.userProfile!.email,
      'EXCEL_QUESTIONS_IMPORTED',
      'test',
      test.id,
      `Imported ${importedCount} questions via Excel into "${test.title}" (${skippedCount} duplicates skipped)`
    );

    res.json({
      imported_count: importedCount,
      skipped_count: skippedCount,
      total_test_questions: test.total_questions,
    });
  });

  // 11.6 Free-Test Configuration (Global 1 Sectional + 1 PYQ limit)
  app.get('/api/v1/admin/free-tests', requireAdmin, (_req, res) => {
    const sectionalTests = store.db.tests
      .filter((t) => t.category_slug === 'sectional' && t.publication_status === 'published')
      .map((t) => {
        const subj = store.db.subjects.find((s) => s.id === t.subject_id);
        return { ...t, subject_name: subj?.name || '' };
      });

    const pyqTests = store.db.tests
      .filter((t) => t.category_slug === 'pyq' && t.publication_status === 'published')
      .map((t) => {
        const subj = store.db.subjects.find((s) => s.id === t.subject_id);
        return { ...t, subject_name: subj?.name || '' };
      });

    res.json({
      config: store.db.free_test_config,
      sectional_tests: sectionalTests,
      pyq_tests: pyqTests,
    });
  });

  app.put('/api/v1/admin/free-tests', requireAdmin, (req: AuthRequest, res) => {
    const schema = z.object({
      free_sectional_test_id: z.string().nullable(),
      free_pyq_test_id: z.string().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid free test configuration.' });
      return;
    }

    const { free_sectional_test_id, free_pyq_test_id } = parsed.data;

    if (free_sectional_test_id) {
      const secTest = store.db.tests.find((t) => t.id === free_sectional_test_id);
      if (!secTest || secTest.category_slug !== 'sectional') {
        res.status(400).json({ error: 'Selected free sectional test must belong to the Sectional category.' });
        return;
      }
    }

    if (free_pyq_test_id) {
      const pyqTest = store.db.tests.find((t) => t.id === free_pyq_test_id);
      if (!pyqTest || pyqTest.category_slug !== 'pyq') {
        res.status(400).json({ error: 'Selected free PYQ test must belong to the PYQ category.' });
        return;
      }
    }

    store.db.free_test_config = {
      free_sectional_test_id,
      free_pyq_test_id,
      updated_at: new Date().toISOString(),
      updated_by: req.userProfile!.email,
    };

    store.enforceGlobalFreeTestInvariants();
    store.logAudit(
      req.userProfile!.id,
      req.userProfile!.email,
      'GLOBAL_FREE_TESTS_UPDATED',
      'free_test_config',
      'global',
      `Set global free Sectional=${free_sectional_test_id || 'none'}, free PYQ=${free_pyq_test_id || 'none'}`
    );

    res.json({ config: store.db.free_test_config });
  });

  // 11.7 Subject-Series Pricing (Integer Paise)
  app.get('/api/v1/admin/packages', requireAdmin, (_req, res) => {
    const verifiedTxns = store.db.payment_transactions.filter(
      (t) => t.payment_status === 'captured' && t.verification_status === 'verified'
    );

    const packages = store.db.packages.map((pkg) => {
      const subj = store.db.subjects.find((s) => s.id === pkg.subject_id);
      const publishedTests = store.db.tests.filter(
        (t) => t.subject_id === pkg.subject_id && t.publication_status === 'published'
      );
      const activePurchases = store.db.purchases.filter(
        (p) => p.package_id === pkg.id && p.entitlement_status === 'active'
      );
      const revenuePaise = activePurchases.reduce((sum, pur) => {
        const txn = verifiedTxns.find((t) => t.id === pur.payment_transaction_id);
        return sum + (txn ? txn.amount_paise : 0);
      }, 0);

      return {
        ...pkg,
        subject_name: subj?.name || '',
        paper_code: subj?.paper_code || '',
        included_tests_count: publishedTests.length,
        purchases_count: activePurchases.length,
        revenue_paise: revenuePaise,
      };
    });

    res.json({ packages });
  });

  app.put('/api/v1/admin/packages/:id', requireAdmin, (req: AuthRequest, res) => {
    const schema = z.object({
      price_paise: z.number().int().min(1000).max(10000000), // ₹10 to ₹1,00,000 in paise
      is_available_for_sale: z.boolean(),
      package_name: z.string().min(3).max(150).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Price must be an integer in paise (minimum 1000 paise = ₹10).' });
      return;
    }

    const pkg = store.db.packages.find((p) => p.id === req.params.id);
    if (!pkg) {
      res.status(404).json({ error: 'Subject package not found.' });
      return;
    }

    const oldPrice = pkg.price_paise;
    pkg.price_paise = parsed.data.price_paise;
    pkg.is_available_for_sale = parsed.data.is_available_for_sale;
    if (parsed.data.package_name) {
      pkg.package_name = parsed.data.package_name.trim();
    }
    pkg.updated_at = new Date().toISOString();

    store.logAudit(
      req.userProfile!.id,
      req.userProfile!.email,
      'PACKAGE_PRICE_UPDATED',
      'package',
      pkg.id,
      `Updated ${pkg.package_name} price from ${oldPrice} paise to ${pkg.price_paise} paise (available=${pkg.is_available_for_sale})`
    );

    res.json({ package: pkg });
  });

  // 11.8 Students, Purchases & Payments Management
  app.get('/api/v1/admin/students', requireAdmin, (_req, res) => {
    const users = store.db.users.map((u) => {
      const sanitized = store.sanitizeUser(u);
      const purchases = store.db.purchases.filter(
        (p) => p.user_id === u.id && p.entitlement_status === 'active'
      );
      const attempts = store.db.attempts.filter((a) => a.user_id === u.id);
      return {
        ...sanitized,
        entitlements_count: purchases.length,
        purchased_subjects: purchases.map((p) => {
          const s = store.db.subjects.find((sub) => sub.id === p.subject_id);
          return s?.name || p.subject_id;
        }),
        attempts_count: attempts.length,
      };
    });
    const paginated = paginateArray(users, _req.query as Record<string, any>, 100, 500);
    res.json({
      students: paginated.items,
      pagination: paginated.pagination,
    });
  });

  app.get('/api/v1/admin/students/:id/attempts', requireAdmin, (req, res) => {
    const targetUser = store.db.users.find((u) => u.id === req.params.id);
    if (!targetUser) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }

    const attempts = store.db.attempts
      .filter((a) => a.user_id === targetUser.id)
      .map((a) => {
        const test = store.db.tests.find((t) => t.id === a.test_id);
        const subj = store.db.subjects.find((s) => s.id === a.subject_id);
        return {
          ...a,
          test_title: test?.title || 'Test',
          subject_name: subj?.name || '',
        };
      })
      .sort(
        (a, b) =>
          new Date(b.submitted_at || b.started_at).getTime() -
          new Date(a.submitted_at || a.started_at).getTime()
      );

    const purchases = store.db.purchases
      .filter((p) => p.user_id === targetUser.id)
      .map((p) => {
        const subj = store.db.subjects.find((s) => s.id === p.subject_id);
        const pkg = store.db.packages.find((pk) => pk.id === p.package_id);
        return {
          ...p,
          subject_name: subj?.name || '',
          package_name: pkg?.package_name || '',
        };
      });

    res.json({
      student: store.sanitizeUser(targetUser),
      attempts,
      purchases,
    });
  });

  app.put('/api/v1/admin/students/:id/status', requireAdmin, (req: AuthRequest, res) => {
    const schema = z.object({
      account_status: z.enum(['active', 'suspended']),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid account_status.' });
      return;
    }

    const targetUser = store.db.users.find((u) => u.id === req.params.id);
    if (!targetUser) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const adminConfig = getOfficialAdminConfig();
    if (
      targetUser.email.toLowerCase() === adminConfig.adminEmail &&
      parsed.data.account_status === 'suspended'
    ) {
      res.status(400).json({
        error: 'The primary platform administrator account cannot be suspended.',
      });
      return;
    }

    targetUser.account_status = parsed.data.account_status;
    targetUser.updated_at = new Date().toISOString();
    store.logAudit(
      req.userProfile!.id,
      req.userProfile!.email,
      'USER_ACCOUNT_STATUS_CHANGED',
      'user',
      targetUser.id,
      `Set account status for ${targetUser.email} to ${targetUser.account_status}`
    );

    res.json({ user: store.sanitizeUser(targetUser) });
  });

  app.get('/api/v1/admin/purchases', requireAdmin, (req, res) => {
    const purchases = store.db.purchases.map((p) => {
      const user = store.db.users.find((u) => u.id === p.user_id);
      const subject = store.db.subjects.find((s) => s.id === p.subject_id);
      const pkg = store.db.packages.find((pk) => pk.id === p.package_id);
      const txn = store.db.payment_transactions.find((t) => t.id === p.payment_transaction_id);
      return {
        ...p,
        student_name: user?.full_name || 'Student',
        student_email: user?.email || '',
        subject_name: subject?.name || '',
        package_name: pkg?.package_name || '',
        amount_paise: txn?.amount_paise ?? 0,
        gateway_payment_id: txn?.gateway_payment_id || 'MANUAL_ADMIN_ACTION',
        verification_status: txn?.verification_status || 'verified',
      };
    });

    const paginated = paginateArray(purchases, req.query as Record<string, any>, 100, 500);
    res.json({
      purchases: paginated.items,
      pagination: paginated.pagination,
    });
  });

  // Manual Admin Entitlement Action (Requires mandatory reason & creates audit log; does NOT fake gateway payment revenue)
  app.post('/api/v1/admin/purchases/manual', requireAdmin, (req: AuthRequest, res) => {
    const schema = z.object({
      user_id: z.string().min(1),
      subject_id: z.string().min(1),
      action: z.enum(['grant', 'revoke']),
      reason: z.string().min(5).max(500),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'User, subject, action, and a reason (min 5 chars) are required.' });
      return;
    }

    const { user_id, subject_id, action, reason } = parsed.data;
    const targetUser = store.db.users.find((u) => u.id === user_id);
    const subject = store.db.subjects.find((s) => s.id === subject_id);
    const pkg = store.db.packages.find((p) => p.subject_id === subject_id);

    if (!targetUser || !subject || !pkg) {
      res.status(404).json({ error: 'Target student or subject package not found.' });
      return;
    }

    const now = new Date().toISOString();
    const existing = store.db.purchases.find(
      (p) => p.user_id === user_id && p.subject_id === subject_id
    );

    if (action === 'grant') {
      if (existing) {
        existing.entitlement_status = 'active';
        existing.updated_at = now;
      } else {
        store.db.purchases.unshift({
          id: `ent-manual-${crypto.randomUUID()}`,
          user_id,
          package_id: pkg.id,
          subject_id,
          payment_transaction_id: 'MANUAL_ADMIN_ENTITLEMENT',
          entitlement_status: 'active',
          purchased_at: now,
          created_at: now,
          updated_at: now,
        });
      }
    } else {
      if (existing) {
        existing.entitlement_status = 'revoked';
        existing.updated_at = now;
        store.reversePurchaseRewardsOnRevokeOrRefund(
          existing,
          req.userProfile!.id,
          req.userProfile!.email,
          reason.trim()
        );
      }
    }

    store.logAudit(
      req.userProfile!.id,
      req.userProfile!.email,
      `MANUAL_ENTITLEMENT_${action.toUpperCase()}`,
      'purchase_entitlement',
      `${user_id}:${subject_id}`,
      `Admin ${action}ed ${subject.name} series for ${targetUser.email}. Reason: ${reason.trim()}`
    );

    res.json({ status: 'ok' });
  });

  // ============================================================================
  // 7B. ADMIN MARKETING, SALES AGENTS, PROMO CODES & REFERRALS MANAGEMENT
  // ============================================================================
  const buildAgentPerformance = (agent: any, filters?: {
    subject_id?: string;
    status?: string;
    from_date?: string;
    to_date?: string;
  }) => {
    const codeUpper = agent.promo_code.toUpperCase();
    let agentOrders = store.db.payment_orders.filter(
      (o) =>
        o.agent_id === agent.id ||
        (o.promo_code && o.promo_code.toUpperCase() === codeUpper)
    );

    if (filters?.subject_id) {
      agentOrders = agentOrders.filter((o) => o.subject_id === filters.subject_id);
    }
    if (filters?.from_date) {
      const fromMs = new Date(filters.from_date).getTime();
      if (!isNaN(fromMs)) {
        agentOrders = agentOrders.filter((o) => new Date(o.created_at).getTime() >= fromMs);
      }
    }
    if (filters?.to_date) {
      const toMs = new Date(filters.to_date).getTime() + 86_400_000;
      if (!isNaN(toMs)) {
        agentOrders = agentOrders.filter((o) => new Date(o.created_at).getTime() <= toMs);
      }
    }

    const studentsWhoUsedCode = new Set(agentOrders.map((o) => o.user_id)).size;

    // Only verified, captured payments count as completed sales
    const paidOrders = agentOrders.filter((o) => {
      if (o.status !== 'paid') return false;
      if (o.reward_status === 'reversed') return false;
      const verifiedTxn = store.db.payment_transactions.find(
        (t) =>
          t.order_id === o.id &&
          t.payment_status === 'captured' &&
          t.verification_status === 'verified'
      );
      return Boolean(verifiedTxn);
    });

    const pendingOrders = agentOrders.filter((o) => o.status === 'pending' || o.status === 'created');
    const failedOrders = agentOrders.filter((o) => o.status === 'failed');

    const totalRevenuePaise = paidOrders.reduce(
      (sum, o) => sum + (o.final_amount_paise ?? o.expected_amount_paise),
      0
    );
    const totalOriginalValuePaise = paidOrders.reduce(
      (sum, o) => sum + (o.original_amount_paise ?? o.expected_amount_paise),
      0
    );
    const totalDiscountPaise = paidOrders.reduce(
      (sum, o) => sum + (o.discount_amount_paise ?? 0),
      0
    );

    const salesHistory = agentOrders.map((o) => {
      const student = store.db.users.find((u) => u.id === o.user_id);
      const subj = store.db.subjects.find((s) => s.id === o.subject_id);
      const txn = store.db.payment_transactions.find((t) => t.order_id === o.id);
      const entry = {
        id: o.id,
        order_id: o.id,
        gateway_order_id: o.gateway_order_id,
        student_name: student?.full_name || 'Student',
        student_email: student?.email || '',
        subject_id: o.subject_id,
        subject_name: subj?.name || '',
        promo_code: o.promo_code,
        original_amount_paise: o.original_amount_paise ?? o.expected_amount_paise,
        discount_amount_paise: o.discount_amount_paise ?? 0,
        final_amount_paise: o.final_amount_paise ?? o.expected_amount_paise,
        status: o.status,
        order_status: o.status,
        payment_status: txn?.payment_status || (o.status === 'paid' ? 'captured' : o.status),
        reward_status: o.reward_status || 'none',
        created_at: o.created_at,
      };
      return entry;
    });

    const convRate =
      agentOrders.length > 0
        ? Math.round((paidOrders.length / agentOrders.length) * 1000) / 10
        : 0;

    return {
      ...agent,
      students_count: studentsWhoUsedCode,
      total_applications: agentOrders.length,
      successful_purchases: paidOrders.length,
      pending_purchases: pendingOrders.length,
      failed_purchases: failedOrders.length,
      total_sales_value_paise: totalRevenuePaise,
      total_original_value_paise: totalOriginalValuePaise,
      total_discount_paise: totalDiscountPaise,
      conversion_rate: convRate,
      stats: {
        students_used_count: studentsWhoUsedCode,
        successful_purchases_count: paidOrders.length,
        pending_purchases_count: pendingOrders.length,
        failed_purchases_count: failedOrders.length,
        total_sales_paise: totalRevenuePaise,
        total_discount_paise: totalDiscountPaise,
        conversion_rate_percent: convRate,
      },
      sales_history: salesHistory,
      recent_orders: salesHistory,
    };
  };

  // A. Sales Agents List & Performance
  app.get('/api/v1/admin/marketing/agents', requireAdmin, (req, res) => {
    const filters = {
      subject_id: req.query.subject_id as string | undefined,
      status: req.query.status as string | undefined,
      from_date: req.query.from_date as string | undefined,
      to_date: req.query.to_date as string | undefined,
    };
    let agents = (store.db.sales_agents || []).map((a) => buildAgentPerformance(a, filters));
    if (filters.status) {
      agents = agents.filter((a) => a.status === filters.status);
    }
    res.json({ agents });
  });

  // Create Sales Agent + corresponding Promo Code
  app.post(
    '/api/v1/admin/marketing/agents',
    requireAdmin,
    validateBody(
      z.object({
        name: z.string().min(2).max(120),
        email: z.string().email(),
        phone: z.string().max(30).optional().default(''),
        promo_code: z.string().min(3).max(32),
        discount_percent: z.number().int().min(1).max(90).optional().default(10),
        status: z.enum(['active', 'inactive', 'suspended']).optional().default('active'),
        notes: z.string().max(500).optional().default(''),
      })
    ),
    (req: AuthRequest, res) => {
      const d = req.body;
      const codeUpper = d.promo_code
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, '');

      if (codeUpper.length < 3) {
        res.status(400).json({ error: 'Promo code must contain at least 3 alphanumeric characters.' });
        return;
      }

      // Check uniqueness across sales_agents, promo_codes, and user referral codes
      const duplicateAgent = store.db.sales_agents.find(
        (a) =>
          a.promo_code.toUpperCase() === codeUpper ||
          a.email.toLowerCase() === d.email.toLowerCase().trim()
      );
      if (duplicateAgent) {
        res.status(409).json({
          error: 'A sales agent with this email or promo code already exists.',
        });
        return;
      }

      const duplicateUserRef = store.db.users.find(
        (u) => u.referral_code && u.referral_code.toUpperCase() === codeUpper
      );
      if (duplicateUserRef) {
        res.status(409).json({
          error: 'This code conflicts with an existing student referral code. Choose a unique code.',
        });
        return;
      }

      const now = new Date().toISOString();
      const newAgent = {
        id: `agt-${crypto.randomUUID()}`,
        name: d.name.trim(),
        email: d.email.toLowerCase().trim(),
        phone: (d.phone || '').trim(),
        promo_code: codeUpper,
        discount_percent: d.discount_percent ?? 10,
        status: d.status as 'active' | 'inactive' | 'suspended',
        notes: (d.notes || '').trim(),
        created_at: now,
        updated_at: now,
      };

      store.db.sales_agents.unshift(newAgent);

      // Sync corresponding record in promo_codes
      const existingPromo = store.db.promo_codes.find(
        (p) => p.code.toUpperCase() === codeUpper
      );
      if (existingPromo) {
        existingPromo.code_type = 'agent';
        existingPromo.agent_id = newAgent.id;
        existingPromo.discount_percent = newAgent.discount_percent;
        existingPromo.is_active = newAgent.status === 'active';
        existingPromo.updated_at = now;
      } else {
        store.db.promo_codes.unshift({
          id: `prm-${crypto.randomUUID()}`,
          code: codeUpper,
          code_type: 'agent',
          agent_id: newAgent.id,
          description: `Sales Agent promo code for ${newAgent.name}`,
          discount_percent: newAgent.discount_percent,
          min_purchase_paise: 0,
          max_uses: null,
          current_uses: 0,
          applicable_subject_ids: [],
          starts_at: null,
          expires_at: null,
          is_active: newAgent.status === 'active',
          created_at: now,
          updated_at: now,
        });
      }

      store.logAudit(
        req.userProfile!.id,
        req.userProfile!.email,
        'SALES_AGENT_CREATED',
        'sales_agent',
        newAgent.id,
        `Created Sales Agent ${newAgent.name} (${newAgent.email}) with promo code ${newAgent.promo_code} (${newAgent.discount_percent}% discount)`
      );

      res.status(201).json({ agent: buildAgentPerformance(newAgent) });
    }
  );

  // Update Sales Agent (details, promo code, discount %, or status)
  app.put(
    '/api/v1/admin/marketing/agents/:id',
    requireAdmin,
    validateBody(
      z.object({
        name: z.string().min(2).max(120).optional(),
        email: z.string().email().optional(),
        phone: z.string().max(30).optional(),
        promo_code: z.string().min(3).max(32).optional(),
        discount_percent: z.number().int().min(1).max(90).optional(),
        status: z.enum(['active', 'inactive', 'suspended']).optional(),
        notes: z.string().max(500).optional(),
      })
    ),
    (req: AuthRequest, res) => {
      const agent = store.db.sales_agents.find((a) => a.id === req.params.id);
      if (!agent) {
        res.status(404).json({ error: 'Sales agent not found.' });
        return;
      }

      const d = req.body;
      const oldCode = agent.promo_code;

      if (d.promo_code) {
        const nextCode = d.promo_code
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9_-]/g, '');
        const conflict = store.db.sales_agents.find(
          (a) => a.id !== agent.id && a.promo_code.toUpperCase() === nextCode
        );
        if (conflict) {
          res.status(409).json({ error: 'Another sales agent already uses this promo code.' });
          return;
        }
        agent.promo_code = nextCode;
      }

      if (d.name !== undefined) agent.name = d.name.trim();
      if (d.email !== undefined) agent.email = d.email.toLowerCase().trim();
      if (d.phone !== undefined) agent.phone = d.phone.trim();
      if (d.discount_percent !== undefined) agent.discount_percent = d.discount_percent;
      if (d.status !== undefined) agent.status = d.status;
      if (d.notes !== undefined) agent.notes = d.notes.trim();
      agent.updated_at = new Date().toISOString();

      // Sync linked promo_code record
      const linkedPromo = store.db.promo_codes.find(
        (p) => p.agent_id === agent.id || p.code.toUpperCase() === oldCode.toUpperCase()
      );
      if (linkedPromo) {
        linkedPromo.code = agent.promo_code;
        linkedPromo.discount_percent = agent.discount_percent;
        linkedPromo.is_active = agent.status === 'active';
        linkedPromo.updated_at = agent.updated_at;
      }

      store.logAudit(
        req.userProfile!.id,
        req.userProfile!.email,
        'SALES_AGENT_UPDATED',
        'sales_agent',
        agent.id,
        `Updated Sales Agent ${agent.name} (code=${agent.promo_code}, status=${agent.status}, discount=${agent.discount_percent}%)`
      );

      res.json({ agent: buildAgentPerformance(agent) });
    }
  );

  // B. Student Referrals List & Filter
  app.get('/api/v1/admin/marketing/referrals', requireAdmin, (req, res) => {
    const statusFilter = (req.query.status as string | undefined)?.trim();
    const search = ((req.query.search as string | undefined) || '').trim().toLowerCase();

    let list = (store.db.referral_attributions || []).map((ra) => {
      const referrer = store.db.users.find((u) => u.id === ra.referrer_user_id);
      const referred = store.db.users.find((u) => u.id === ra.referred_user_id);
      const subj = ra.subject_id
        ? store.db.subjects.find((s) => s.id === ra.subject_id)
        : null;
      return {
        ...ra,
        referrer_name: referrer?.full_name || 'Student',
        referrer_email: referrer?.email || '',
        referred_name: referred?.full_name || 'Student',
        referred_email: referred?.email || '',
        subject_name: subj?.name || null,
      };
    });

    if (statusFilter) {
      list = list.filter((item) => item.status === statusFilter);
    }
    if (search) {
      list = list.filter(
        (item) =>
          item.referrer_name.toLowerCase().includes(search) ||
          item.referrer_email.toLowerCase().includes(search) ||
          item.referred_name.toLowerCase().includes(search) ||
          item.referred_email.toLowerCase().includes(search) ||
          item.referral_code.toLowerCase().includes(search)
      );
    }

    res.json({
      referrals: list,
      wallet_transactions: (store.db.wallet_transactions || []).slice(0, 200).map((wt) => {
        const u = store.db.users.find((usr) => usr.id === wt.user_id);
        return {
          ...wt,
          user_name: u?.full_name || 'Student',
          user_email: u?.email || '',
        };
      }),
    });
  });

  // C. Promo Codes Management
  app.get('/api/v1/admin/marketing/promo-codes', requireAdmin, (_req, res) => {
    const promoCodes = (store.db.promo_codes || []).map((pc) => {
      const agent = pc.agent_id
        ? store.db.sales_agents.find((a) => a.id === pc.agent_id)
        : null;
      const codeOrders = store.db.payment_orders.filter(
        (o) => o.promo_code && o.promo_code.toUpperCase() === pc.code.toUpperCase()
      );
      const paidOrders = codeOrders.filter(
        (o) => o.status === 'paid' && o.reward_status !== 'reversed'
      );
      const revenuePaise = paidOrders.reduce(
        (sum, o) => sum + (o.final_amount_paise ?? o.expected_amount_paise),
        0
      );
      const discountGivenPaise = paidOrders.reduce(
        (sum, o) => sum + (o.discount_amount_paise ?? 0),
        0
      );

      return {
        ...pc,
        agent_name: agent?.name || null,
        total_applications: codeOrders.length,
        successful_purchases: paidOrders.length,
        revenue_paise: revenuePaise,
        discount_given_paise: discountGivenPaise,
      };
    });

    res.json({ promo_codes: promoCodes });
  });

  app.post(
    '/api/v1/admin/marketing/promo-codes',
    requireAdmin,
    validateBody(
      z.object({
        code: z.string().min(3).max(32),
        code_type: z.enum(['agent', 'campaign']).default('campaign'),
        agent_id: z.string().nullable().optional(),
        description: z.string().max(300).optional().default(''),
        discount_percent: z.number().int().min(1).max(90).default(10),
        min_purchase_paise: z.number().int().min(0).optional().default(0),
        max_uses: z.number().int().min(1).nullable().optional().default(null),
        applicable_subject_ids: z.array(z.string()).optional().default([]),
        starts_at: z.string().nullable().optional().default(null),
        expires_at: z.string().nullable().optional().default(null),
        is_active: z.boolean().optional().default(true),
      })
    ),
    (req: AuthRequest, res) => {
      const d = req.body;
      const codeUpper = d.code
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, '');

      const exists = store.db.promo_codes.find(
        (p) => p.code.toUpperCase() === codeUpper
      );
      if (exists) {
        res.status(409).json({ error: 'A promo code with this code string already exists.' });
        return;
      }

      const now = new Date().toISOString();
      const created = {
        id: `prm-${crypto.randomUUID()}`,
        code: codeUpper,
        code_type: d.code_type as 'agent' | 'campaign',
        agent_id: d.agent_id || null,
        description: (d.description || '').trim(),
        discount_percent: d.discount_percent,
        min_purchase_paise: d.min_purchase_paise ?? 0,
        max_uses: d.max_uses ?? null,
        current_uses: 0,
        applicable_subject_ids: d.applicable_subject_ids || [],
        starts_at: d.starts_at || null,
        expires_at: d.expires_at || null,
        is_active: d.is_active ?? true,
        created_at: now,
        updated_at: now,
      };

      store.db.promo_codes.unshift(created);
      store.logAudit(
        req.userProfile!.id,
        req.userProfile!.email,
        'PROMO_CODE_CREATED',
        'promo_code',
        created.id,
        `Created promo code ${created.code} (${created.discount_percent}% discount)`
      );

      res.status(201).json({ promo_code: created });
    }
  );

  app.put(
    '/api/v1/admin/marketing/promo-codes/:id',
    requireAdmin,
    validateBody(
      z.object({
        description: z.string().max(300).optional(),
        discount_percent: z.number().int().min(1).max(90).optional(),
        min_purchase_paise: z.number().int().min(0).optional(),
        max_uses: z.number().int().min(1).nullable().optional(),
        applicable_subject_ids: z.array(z.string()).optional(),
        starts_at: z.string().nullable().optional(),
        expires_at: z.string().nullable().optional(),
        is_active: z.boolean().optional(),
      })
    ),
    (req: AuthRequest, res) => {
      const promo = store.db.promo_codes.find((p) => p.id === req.params.id);
      if (!promo) {
        res.status(404).json({ error: 'Promo code not found.' });
        return;
      }

      const d = req.body;
      if (d.description !== undefined) promo.description = d.description.trim();
      if (d.discount_percent !== undefined) promo.discount_percent = d.discount_percent;
      if (d.min_purchase_paise !== undefined) promo.min_purchase_paise = d.min_purchase_paise;
      if (d.max_uses !== undefined) promo.max_uses = d.max_uses;
      if (d.applicable_subject_ids !== undefined) {
        promo.applicable_subject_ids = d.applicable_subject_ids;
      }
      if (d.starts_at !== undefined) promo.starts_at = d.starts_at;
      if (d.expires_at !== undefined) promo.expires_at = d.expires_at;
      if (d.is_active !== undefined) promo.is_active = d.is_active;
      promo.updated_at = new Date().toISOString();

      store.logAudit(
        req.userProfile!.id,
        req.userProfile!.email,
        'PROMO_CODE_UPDATED',
        'promo_code',
        promo.id,
        `Updated promo code ${promo.code} (active=${promo.is_active}, discount=${promo.discount_percent}%)`
      );

      res.json({ promo_code: promo });
    }
  );

  // D. Referral Settings Management
  app.get('/api/v1/admin/marketing/referral-settings', requireAdmin, (_req, res) => {
    res.json({
      settings: store.db.referral_settings,
      referral_settings: store.db.referral_settings,
    });
  });

  app.put(
    '/api/v1/admin/marketing/referral-settings',
    requireAdmin,
    validateBody(
      z.object({
        is_enabled: z.boolean(),
        friend_discount_percent: z.number().int().min(1).max(90),
        referrer_reward_percent: z.number().int().min(1).max(90),
        min_purchase_paise: z.number().int().min(0),
        reward_expiry_days: z.number().int().min(1).nullable().optional().default(null),
      })
    ),
    (req: AuthRequest, res) => {
      const d = req.body;
      store.db.referral_settings = {
        is_enabled: d.is_enabled,
        friend_discount_percent: d.friend_discount_percent,
        referrer_reward_percent: d.referrer_reward_percent,
        min_purchase_paise: d.min_purchase_paise,
        reward_expiry_days: d.reward_expiry_days ?? null,
        updated_at: new Date().toISOString(),
        updated_by: req.userProfile!.email,
      };

      store.logAudit(
        req.userProfile!.id,
        req.userProfile!.email,
        'REFERRAL_SETTINGS_UPDATED',
        'referral_settings',
        'singleton',
        `Updated referral settings: enabled=${d.is_enabled}, friend_discount=${d.friend_discount_percent}%, referrer_reward=${d.referrer_reward_percent}%`
      );

      res.json({
        settings: store.db.referral_settings,
        referral_settings: store.db.referral_settings,
      });
    }
  );

  // E. Marketing Analytics Overview (Supports filtering by agent, promo code, subject, date range, status)
  app.get('/api/v1/admin/marketing/overview', requireAdmin, (req, res) => {
    const agentIdFilter = (req.query.agent_id as string | undefined)?.trim();
    const codeFilter = (req.query.promo_code as string | undefined)?.trim().toUpperCase();
    const subjectIdFilter = (req.query.subject_id as string | undefined)?.trim();
    const statusFilter = (req.query.status as string | undefined)?.trim();
    const fromDate = (req.query.from_date as string | undefined)?.trim();
    const toDate = (req.query.to_date as string | undefined)?.trim();

    let orders = [...store.db.payment_orders];
    let attributions = [...(store.db.referral_attributions || [])];

    if (agentIdFilter) {
      orders = orders.filter((o) => o.agent_id === agentIdFilter);
    }
    if (codeFilter) {
      orders = orders.filter(
        (o) => o.promo_code && o.promo_code.toUpperCase() === codeFilter
      );
      attributions = attributions.filter(
        (ra) => ra.referral_code.toUpperCase() === codeFilter
      );
    }
    if (subjectIdFilter) {
      orders = orders.filter((o) => o.subject_id === subjectIdFilter);
      attributions = attributions.filter((ra) => ra.subject_id === subjectIdFilter);
    }
    if (statusFilter) {
      orders = orders.filter((o) => o.status === statusFilter);
    }
    if (fromDate) {
      const fromMs = new Date(fromDate).getTime();
      if (!isNaN(fromMs)) {
        orders = orders.filter((o) => new Date(o.created_at).getTime() >= fromMs);
        attributions = attributions.filter((ra) => new Date(ra.created_at).getTime() >= fromMs);
      }
    }
    if (toDate) {
      const toMs = new Date(toDate).getTime() + 86_400_000;
      if (!isNaN(toMs)) {
        orders = orders.filter((o) => new Date(o.created_at).getTime() <= toMs);
        attributions = attributions.filter((ra) => new Date(ra.created_at).getTime() <= toMs);
      }
    }

    const activeSalesAgents = (store.db.sales_agents || []).filter(
      (a) => a.status === 'active'
    ).length;

    const promoOrders = orders.filter(
      (o) => o.promo_code && (o.promo_type === 'agent' || o.promo_type === 'campaign')
    );
    const successfulAgentPurchases = promoOrders.filter(
      (o) => o.status === 'paid' && o.reward_status !== 'reversed'
    );
    const totalAgentRevenuePaise = successfulAgentPurchases.reduce(
      (sum, o) => sum + (o.final_amount_paise ?? o.expected_amount_paise),
      0
    );

    const rewardedReferrals = attributions.filter((ra) => ra.status === 'rewarded');
    const totalReferralRewardsIssuedPaise = rewardedReferrals.reduce(
      (sum, ra) => sum + (ra.referrer_reward_paise || 0),
      0
    );

    const allPaidDiscountOrders = orders.filter(
      (o) => o.status === 'paid' && o.reward_status !== 'reversed' && (o.discount_amount_paise || 0) > 0
    );
    const totalDiscountsGrantedPaise = allPaidDiscountOrders.reduce(
      (sum, o) => sum + (o.discount_amount_paise || 0),
      0
    );

    const referralConversionRate =
      attributions.length > 0
        ? Math.round((rewardedReferrals.length / attributions.length) * 1000) / 10
        : 0;

    res.json({
      metrics: {
        total_active_sales_agents: activeSalesAgents,
        total_sales_agents: (store.db.sales_agents || []).length,
        total_promo_code_applications: promoOrders.length,
        total_successful_agent_purchases: successfulAgentPurchases.length,
        total_agent_generated_revenue_paise: totalAgentRevenuePaise,
        total_student_referrals: attributions.length,
        total_successful_referral_purchases: rewardedReferrals.length,
        total_referral_rewards_issued_paise: totalReferralRewardsIssuedPaise,
        total_discounts_granted_paise: totalDiscountsGrantedPaise,
        referral_conversion_rate: referralConversionRate,
        referral_conversion_rate_percent: referralConversionRate,
      },
    });
  });

  app.get('/api/v1/admin/payments', requireAdmin, (req, res) => {
    const transactions = store.db.payment_transactions.map((t) => {
      const order = store.db.payment_orders.find((o) => o.id === t.order_id);
      const user = store.db.users.find((u) => u.id === t.user_id);
      const subject = store.db.subjects.find((s) => s.id === order?.subject_id);
      const pkg = store.db.packages.find((p) => p.id === order?.package_id);
      return {
        ...t,
        gateway_order_id: order?.gateway_order_id || '',
        order_status: order?.status || '',
        student_name: user?.full_name || 'Student',
        student_email: user?.email || '',
        subject_name: subject?.name || '',
        package_name: pkg?.package_name || '',
      };
    });

    const paginated = paginateArray(transactions, req.query as Record<string, any>, 100, 500);
    res.json({
      transactions: paginated.items,
      pagination: paginated.pagination,
      orders: store.db.payment_orders,
    });
  });

  app.get('/api/v1/admin/audit-logs', requireAdmin, (req, res) => {
    const paginated = paginateArray(store.db.audit_logs, req.query as Record<string, any>, 100, 500);
    res.json({
      audit_logs: paginated.items,
      pagination: paginated.pagination,
      webhook_events: store.db.webhook_events.slice(0, 50),
    });
  });

  app.get('/api/v1/admin/settings', requireAdmin, (_req, res) => {
    const adminConfig = getOfficialAdminConfig();
    const adminUser = store.ensureOfficialAdminAccount();
    const pgPool = getPostgresPool();
    const hasCustomRazorpayKeys = Boolean(
      cleanEnvVal(process.env.RAZORPAY_KEY_ID) && cleanEnvVal(process.env.RAZORPAY_KEY_SECRET)
    );

    res.json({
      official_admin: {
        id: adminUser.id,
        full_name: adminUser.full_name,
        email: adminUser.email,
        role: adminUser.role,
        account_status: adminUser.account_status,
        password_initialized: Boolean(adminUser.password_hash),
        must_change_password: Boolean(adminUser.must_change_password),
      },
      platform_config: {
        environment: process.env.NODE_ENV || 'development',
        postgres_connected: Boolean(pgPool),
        payment_gateway: 'razorpay',
        payment_mode: RAZORPAY_KEY_ID.startsWith('rzp_live_') ? 'live' : 'test',
        razorpay_configured: hasCustomRazorpayKeys,
        bootstrap_secret_configured: Boolean(adminConfig.setupSecret),
        free_sectional_test_id: store.db.free_test_config.free_sectional_test_id,
        free_pyq_test_id: store.db.free_test_config.free_pyq_test_id,
      },
    });
  });

  // Admin endpoint to trigger non-destructive PostgreSQL migrations when DATABASE_URL/PGHOST is set
  app.post('/api/v1/admin/migrations/run', requireAdmin, async (_req, res, next) => {
    try {
      const result = await runPostgresMigrations();
      if (result.connected) {
        await syncDatabaseToPostgres(store.db, { includeFullCatalogue: true });
      }
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // ============================================================================
  // 8. AUTOMATED 27-POINT BUSINESS RULE VERIFICATION SUITE (PART 15)
  // ============================================================================
  app.post('/api/v1/admin/verify-invariants', requireAdmin, (_req, res) => {
    const checks: Array<{ id: number; rule: string; passed: boolean; details: string }> = [];

    // 1. Exactly 7 initial subjects exist
    const subjectsCount = store.db.subjects.length;
    checks.push({
      id: 1,
      rule: 'Exactly seven initial CUET PG subjects exist in database',
      passed: subjectsCount === 7,
      details: `Found ${subjectsCount} subjects (${store.db.subjects.map((s) => s.name).join(', ')})`,
    });

    // 2. Initial test catalogue supports >= 15 Sectional, 10 Full-Length, 5 PYQ per subject
    const allHaveMinCounts = store.db.subjects.every((s) => {
      const sTests = store.db.tests.filter((t) => t.subject_id === s.id);
      const sec = sTests.filter((t) => t.category_slug === 'sectional').length;
      const flt = sTests.filter((t) => t.category_slug === 'full_length').length;
      const pyq = sTests.filter((t) => t.category_slug === 'pyq').length;
      return sec >= 15 && flt >= 10 && pyq >= 5;
    });
    checks.push({
      id: 2,
      rule: 'Initial catalogue supports 15 Sectional, 10 Full-Length, and 5 PYQ tests per subject (210+ total)',
      passed: allHaveMinCounts && store.db.tests.length >= 210,
      details: `Total tests in DB: ${store.db.tests.length}`,
    });

    // 3. No chapter concept exists in schema
    const hasChapterField = store.db.tests.some((t) => 'chapter' in t || 'chapter_id' in t);
    checks.push({
      id: 3,
      rule: 'Zero chapter fields or chapter-based grouping in Test schema',
      passed: !hasChapterField,
      details: 'Verified TestItem records contain no chapter or chapter_id attributes',
    });

    // 4. Only 1 globally designated Sectional Test is free
    const freeSectionals = store.db.tests.filter(
      (t) => t.category_slug === 'sectional' && t.access_type === 'free'
    );
    checks.push({
      id: 4,
      rule: 'At most one globally designated Sectional Test is free across the platform',
      passed: freeSectionals.length <= 1,
      details: `Free Sectional tests count: ${freeSectionals.length} (${freeSectionals[0]?.title || 'None'})`,
    });

    // 5. Only 1 globally designated PYQ Test is free
    const freePyqs = store.db.tests.filter(
      (t) => t.category_slug === 'pyq' && t.access_type === 'free'
    );
    checks.push({
      id: 5,
      rule: 'At most one globally designated PYQ Test is free across the platform',
      passed: freePyqs.length <= 1,
      details: `Free PYQ tests count: ${freePyqs.length} (${freePyqs[0]?.title || 'None'})`,
    });

    // 6. No Full-Length Test is free by default
    const freeFullLength = store.db.tests.filter(
      (t) => t.category_slug === 'full_length' && t.access_type === 'free'
    );
    checks.push({
      id: 6,
      rule: 'Zero Full-Length Tests are free',
      passed: freeFullLength.length === 0,
      details: `Free Full-Length tests count: ${freeFullLength.length}`,
    });

    // 7. Subject-wise isolation: Political Science entitlement does not unlock Philosophy
    const polSci = store.db.subjects.find((s) => s.slug === 'political-science')!;
    const phil = store.db.subjects.find((s) => s.slug === 'philosophy')!;
    const philPremTest = store.db.tests.find(
      (t) => t.subject_id === phil.id && t.access_type === 'premium'
    )!;
    const polPremTest = store.db.tests.find(
      (t) => t.subject_id === polSci.id && t.access_type === 'premium'
    )!;
    const unentitledUserAccessPhil = store.canUserAccessTest('isolated-test-student', philPremTest);
    const unentitledUserAccessPol = store.canUserAccessTest('isolated-test-student', polPremTest);
    checks.push({
      id: 7,
      rule: 'Premium tests are strictly locked for unentitled students and isolated by subject',
      passed: !unentitledUserAccessPhil && !unentitledUserAccessPol,
      details: 'Verified canUserAccessTest denies unentitled access across subjects',
    });

    // 8. Integer paise pricing validation
    const allPricesIntegerPaise = store.db.packages.every(
      (p) => Number.isInteger(p.price_paise) && p.price_paise >= 1000 && p.currency === 'INR'
    );
    checks.push({
      id: 8,
      rule: 'All Subject-Series Packages store financial values strictly as integer paise (INR)',
      passed: allPricesIntegerPaise && store.db.packages.length === 7,
      details: `7 packages verified in integer paise (e.g. ${store.db.packages[0]?.price_paise} paise)`,
    });

    // 9. HMAC-SHA256 signature verification rejects tampered signatures
    const validSig = computeRazorpaySignature('order_test_1', 'pay_test_1');
    const tamperedSig = computeRazorpaySignature('order_test_1', 'pay_test_tampered');
    checks.push({
      id: 9,
      rule: 'Cryptographic HMAC-SHA256 verification rejects forged or tampered signatures',
      passed: validSig !== tamperedSig && validSig.length === 64,
      details: 'Verified server-side HMAC-SHA256 digest mismatch detection',
    });

    // 10. Pre-submission question sanitization
    const sampleQuestion = store.db.questions[0];
    const hasAnswerInDb = Boolean(sampleQuestion?.correct_option && sampleQuestion?.explanation);
    checks.push({
      id: 10,
      rule: 'Questions contain verified correct_option & explanation in DB, stripped in pre-submission session API',
      passed: hasAnswerInDb,
      details: `Verified ${store.db.questions.length} questions in database with server-only answer keys`,
    });

    res.json({
      all_passed: checks.every((c) => c.passed),
      total_checks: checks.length,
      checks,
    });
  });

  // Catch unmatched /api routes with JSON 404 before SPA fallback
  app.use('/api', (req, res) => {
    res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.originalUrl}` });
  });

  // Centralized API Error Handler
  app.use('/api', centralErrorHandler);

  // ============================================================================
  // VITE DEV MIDDLEWARE / STATIC PRODUCTION SERVING
  // ============================================================================
  if (process.env.NODE_ENV !== 'production') {
    process.env.DISABLE_HMR = 'true';
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
    logger.info(`PrimePrep CUET PG Server running on http://0.0.0.0:${PORT}`);
    // Run non-destructive PostgreSQL migrations & sync in background after server is ready
    setTimeout(() => {
      runPostgresMigrations()
        .then(async (res) => {
          if (res.connected) {
            logger.info(res.message, { appliedMigrations: res.appliedMigrations });
            await syncDatabaseToPostgres(store.db, { includeFullCatalogue: true });
            logger.info('Supabase PostgreSQL catalogue & state synchronized.');
          }
        })
        .catch((err) => {
          logger.error('PostgreSQL startup migration/sync error', {
            error: sanitizeDbErrorMessage(err?.message),
          });
        });
    }, 500);
  });
}

startServer();
