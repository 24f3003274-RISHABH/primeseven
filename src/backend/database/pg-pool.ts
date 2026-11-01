import { Pool, PoolClient } from 'pg';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.ts';
import type { DatabaseSchema } from '../store.ts';

declare global {
  var _primeprepPgPool: Pool | undefined;
}

function cleanEnvValue(val?: string): string | undefined {
  const trimmed = (val || '').trim();
  if (!trimmed || /^(na|n\/a|none|null|undefined)$/i.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

function getValidPostgresUri(): string | undefined {
  const val = (process.env.DATABASE_URL || '').trim();
  if (val.startsWith('postgres://') || val.startsWith('postgresql://')) {
    try {
      const parsed = new URL(val);
      // Strip sslmode query parameter so node-postgres uses our explicit ssl: { rejectUnauthorized: false }
      parsed.searchParams.delete('sslmode');
      return parsed.toString();
    } catch {
      return val;
    }
  }
  return undefined;
}

export function sanitizeDbErrorMessage(message?: string): string {
  if (!message) return 'Unknown database error';
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, 'postgresql://[REDACTED]')
    .replace(/password=\S+/gi, 'password=[REDACTED]');
}

/**
 * Returns a lazy PostgreSQL connection pool for Supabase PostgreSQL (edirrhfsnbhorahwhomp).
 */
export function getPostgresPool(): Pool | null {
  // Sanitize conflicting libpq env vars (like PGUSER="NA" or PGSSLMODE="require")
  if (/^(na|n\/a|none|null|undefined)$/i.test((process.env.PGUSER || '').trim())) {
    delete process.env.PGUSER;
  }
  if ((process.env.PGSSLMODE || '').toLowerCase() === 'require') {
    delete process.env.PGSSLMODE;
  }

  const connectionString = getValidPostgresUri();
  const host = cleanEnvValue(process.env.PGHOST) || cleanEnvValue(process.env.SQL_HOST);

  if (!connectionString && !host) {
    return null;
  }

  if (!global._primeprepPgPool) {
    global._primeprepPgPool = connectionString
      ? new Pool({
          connectionString,
          ssl: { rejectUnauthorized: false },
          max: 10,
          connectionTimeoutMillis: 15000,
        })
      : new Pool({
          host,
          user: cleanEnvValue(process.env.PGUSER) || cleanEnvValue(process.env.SQL_USER),
          password: cleanEnvValue(process.env.PGPASSWORD) || cleanEnvValue(process.env.SQL_PASSWORD),
          database:
            cleanEnvValue(process.env.PGDATABASE) ||
            cleanEnvValue(process.env.SQL_DB_NAME) ||
            'postgres',
          port: Number(cleanEnvValue(process.env.PGPORT) || 5432),
          ssl: { rejectUnauthorized: false },
          max: 10,
          connectionTimeoutMillis: 15000,
        });

    global._primeprepPgPool.on('error', (err) => {
      logger.error('Unexpected error on idle PostgreSQL pool client', {
        error: sanitizeDbErrorMessage(err.message),
      });
    });
  }

  return global._primeprepPgPool;
}

/**
 * Safely applies ordered SQL migrations from `/database/migrations` and seeds from `/database/seeds`.
 * Non-destructive: tracks applied versions in `schema_migrations` and uses IF NOT EXISTS.
 */
export async function runPostgresMigrations(): Promise<{
  connected: boolean;
  appliedMigrations: string[];
  message: string;
}> {
  const pool = getPostgresPool();
  if (!pool) {
    return {
      connected: false,
      appliedMigrations: [],
      message:
        'No external PostgreSQL connection configured in environment; running with local relational datastore (.data/primeprep-db.json).',
    };
  }

  const client = await pool.connect();
  const appliedMigrations: string[] = [];

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const migrationsDir = path.resolve(process.cwd(), 'database/migrations');
    if (fs.existsSync(migrationsDir)) {
      const files = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort();

      for (const file of files) {
        const version = file.split('_')[0];
        const existing = await client.query(
          'SELECT version FROM schema_migrations WHERE version = $1',
          [version]
        );
        if (existing.rowCount === 0) {
          const sqlContent = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
          await client.query(sqlContent);
          appliedMigrations.push(file);
          logger.info(`Applied PostgreSQL migration: ${file}`);
        }
      }
    }

    // Ensure non-destructive additive schema upgrades are always present
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT NULL;
      CREATE TABLE IF NOT EXISTS user_bookmarks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        test_id TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
        note TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_user_test_bookmark UNIQUE (user_id, test_id)
      );
      CREATE INDEX IF NOT EXISTS idx_user_bookmarks_user ON user_bookmarks (user_id, created_at DESC);
      ALTER TABLE user_bookmarks ENABLE ROW LEVEL SECURITY;
    `);

    const seedsDir = path.resolve(process.cwd(), 'database/seeds');
    if (fs.existsSync(seedsDir)) {
      const seedFiles = fs
        .readdirSync(seedsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort();
      for (const seedFile of seedFiles) {
        const sqlContent = fs.readFileSync(path.join(seedsDir, seedFile), 'utf-8');
        await client.query(sqlContent);
      }
    }

    return {
      connected: true,
      appliedMigrations,
      message: `PostgreSQL migrations verified (${appliedMigrations.length} newly applied).`,
    };
  } finally {
    client.release();
  }
}

/**
 * Non-destructively synchronizes the full PrimePrep relational dataset into Supabase PostgreSQL.
 * Uses ON CONFLICT upserts so existing records are preserved/updated without duplicating or truncating.
 */
export async function syncDatabaseToPostgres(
  db: DatabaseSchema,
  options: { includeFullCatalogue?: boolean } = { includeFullCatalogue: false }
): Promise<void> {
  const pool = getPostgresPool();
  if (!pool) return;

  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Categories
    for (const c of db.categories) {
      await client.query(
        `INSERT INTO categories (id, slug, name, description, default_duration_minutes, display_order)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           default_duration_minutes = EXCLUDED.default_duration_minutes,
           display_order = EXCLUDED.display_order`,
        [c.id, c.slug, c.name, c.description, c.default_duration_minutes, c.display_order]
      );
    }

    // 2. Subjects
    for (const s of db.subjects) {
      await client.query(
        `INSERT INTO subjects (id, name, slug, paper_code, description, is_active, display_order, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           slug = EXCLUDED.slug,
           paper_code = EXCLUDED.paper_code,
           description = EXCLUDED.description,
           is_active = EXCLUDED.is_active,
           display_order = EXCLUDED.display_order,
           updated_at = EXCLUDED.updated_at`,
        [
          s.id,
          s.name,
          s.slug,
          s.paper_code,
          s.description,
          s.is_active,
          s.display_order,
          s.created_at,
          s.updated_at,
        ]
      );
    }

    // 3. Subject-Series Packages
    for (const p of db.packages) {
      await client.query(
        `INSERT INTO packages (id, subject_id, package_name, description, price_paise, currency, is_available_for_sale, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           package_name = EXCLUDED.package_name,
           description = EXCLUDED.description,
           price_paise = EXCLUDED.price_paise,
           is_available_for_sale = EXCLUDED.is_available_for_sale,
           updated_at = EXCLUDED.updated_at`,
        [
          p.id,
          p.subject_id,
          p.package_name,
          p.description,
          p.price_paise,
          p.currency,
          p.is_available_for_sale,
          p.created_at,
          p.updated_at,
        ]
      );
    }

    if (options.includeFullCatalogue) {
      // 4. Tests (210 tests — batched multi-row upsert)
      const testBatchSize = 50;
      for (let i = 0; i < db.tests.length; i += testBatchSize) {
        const chunk = db.tests.slice(i, i + testBatchSize);
        const values: any[] = [];
        const placeholders = chunk
          .map((t, idx) => {
            const base = idx * 17;
            values.push(
              t.id,
              t.subject_id,
              t.category_id,
              t.category_slug,
              t.title,
              t.test_number,
              t.description,
              t.duration_minutes,
              t.total_questions,
              t.maximum_marks,
              t.positive_marks,
              t.negative_marks,
              t.access_type,
              t.publication_status,
              t.display_order,
              t.created_at,
              t.updated_at
            );
            return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},$${base + 14},$${base + 15},$${base + 16},$${base + 17})`;
          })
          .join(',');

        await client.query(
          `INSERT INTO tests (
             id, subject_id, category_id, category_slug, title, test_number, description,
             duration_minutes, total_questions, maximum_marks, positive_marks, negative_marks,
             access_type, publication_status, display_order, created_at, updated_at
           ) VALUES ${placeholders}
           ON CONFLICT (id) DO UPDATE SET
             title = EXCLUDED.title,
             duration_minutes = EXCLUDED.duration_minutes,
             total_questions = EXCLUDED.total_questions,
             maximum_marks = EXCLUDED.maximum_marks,
             access_type = EXCLUDED.access_type,
             publication_status = EXCLUDED.publication_status,
             updated_at = EXCLUDED.updated_at`,
          values
        );
      }

      // 5. Questions (1,400 questions — batched multi-row upsert)
      const qBatchSize = 100;
      for (let i = 0; i < db.questions.length; i += qBatchSize) {
        const chunk = db.questions.slice(i, i + qBatchSize);
        const values: any[] = [];
        const placeholders = chunk
          .map((q, idx) => {
            const base = idx * 15;
            values.push(
              q.id,
              q.test_id,
              q.question_text,
              q.question_type || 'mcq_single',
              q.option_a,
              q.option_b,
              q.option_c,
              q.option_d,
              q.correct_option,
              q.explanation,
              q.marks,
              q.negative_marks,
              q.display_order,
              q.created_at,
              q.updated_at
            );
            return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},$${base + 14},$${base + 15})`;
          })
          .join(',');

        await client.query(
          `INSERT INTO questions (
             id, test_id, question_text, question_type, option_a, option_b, option_c, option_d,
             correct_option, explanation, marks, negative_marks, display_order, created_at, updated_at
           ) VALUES ${placeholders}
           ON CONFLICT (id) DO UPDATE SET
             question_text = EXCLUDED.question_text,
             option_a = EXCLUDED.option_a,
             option_b = EXCLUDED.option_b,
             option_c = EXCLUDED.option_c,
             option_d = EXCLUDED.option_d,
             correct_option = EXCLUDED.correct_option,
             explanation = EXCLUDED.explanation,
             marks = EXCLUDED.marks,
             negative_marks = EXCLUDED.negative_marks,
             updated_at = EXCLUDED.updated_at`,
          values
        );
      }
    }

    // 6. Global Free-Test Configuration (Singleton id = 1)
    if (db.free_test_config) {
      await client.query(
        `INSERT INTO free_test_config (id, free_sectional_test_id, free_pyq_test_id, updated_at, updated_by)
         VALUES (1, $1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET
           free_sectional_test_id = EXCLUDED.free_sectional_test_id,
           free_pyq_test_id = EXCLUDED.free_pyq_test_id,
           updated_at = EXCLUDED.updated_at,
           updated_by = EXCLUDED.updated_by`,
        [
          db.free_test_config.free_sectional_test_id,
          db.free_test_config.free_pyq_test_id,
          db.free_test_config.updated_at,
          db.free_test_config.updated_by || 'system',
        ]
      );
    }

    // 7. Users
    for (const u of db.users) {
      await client.query(
        `INSERT INTO users (id, full_name, email, password_hash, role, account_status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           full_name = EXCLUDED.full_name,
           email = EXCLUDED.email,
           password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
           role = EXCLUDED.role,
           account_status = EXCLUDED.account_status,
           updated_at = EXCLUDED.updated_at`,
        [
          u.id,
          u.full_name,
          u.email,
          u.password_hash || null,
          u.role,
          u.account_status,
          u.created_at,
          u.updated_at,
        ]
      );
    }

    // 8. Payment Orders
    for (const po of db.payment_orders) {
      await client.query(
        `INSERT INTO payment_orders (id, user_id, package_id, subject_id, gateway, gateway_order_id, expected_amount_paise, currency, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           updated_at = EXCLUDED.updated_at`,
        [
          po.id,
          po.user_id,
          po.package_id,
          po.subject_id,
          po.gateway,
          po.gateway_order_id,
          po.expected_amount_paise,
          po.currency,
          po.status,
          po.created_at,
          po.updated_at,
        ]
      );
    }

    // 9. Payment Transactions
    for (const pt of db.payment_transactions) {
      await client.query(
        `INSERT INTO payment_transactions (id, order_id, user_id, gateway_payment_id, payment_status, verification_status, amount_paise, currency, gateway_reference, verified_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET
           payment_status = EXCLUDED.payment_status,
           verification_status = EXCLUDED.verification_status,
           verified_at = EXCLUDED.verified_at`,
        [
          pt.id,
          pt.order_id,
          pt.user_id,
          pt.gateway_payment_id,
          pt.payment_status,
          pt.verification_status,
          pt.amount_paise,
          pt.currency,
          pt.gateway_reference,
          pt.verified_at,
          pt.created_at,
        ]
      );
    }

    // 10. Purchases / Entitlements
    for (const pur of db.purchases) {
      await client.query(
        `INSERT INTO purchases (id, user_id, package_id, subject_id, payment_transaction_id, entitlement_status, purchased_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (user_id, subject_id) DO UPDATE SET
           entitlement_status = EXCLUDED.entitlement_status,
           payment_transaction_id = EXCLUDED.payment_transaction_id,
           updated_at = EXCLUDED.updated_at`,
        [
          pur.id,
          pur.user_id,
          pur.package_id,
          pur.subject_id,
          pur.payment_transaction_id,
          pur.entitlement_status,
          pur.purchased_at,
          pur.created_at,
          pur.updated_at,
        ]
      );
    }

    // 11. Test Attempts
    for (const att of db.attempts) {
      await client.query(
        `INSERT INTO attempts (
           id, user_id, test_id, subject_id, category_slug, attempt_number, status,
           started_at, expires_at, submitted_at, total_score, maximum_marks,
           correct_count, incorrect_count, unanswered_count, time_taken_seconds
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           submitted_at = EXCLUDED.submitted_at,
           total_score = EXCLUDED.total_score,
           maximum_marks = EXCLUDED.maximum_marks,
           correct_count = EXCLUDED.correct_count,
           incorrect_count = EXCLUDED.incorrect_count,
           unanswered_count = EXCLUDED.unanswered_count,
           time_taken_seconds = EXCLUDED.time_taken_seconds`,
        [
          att.id,
          att.user_id,
          att.test_id,
          att.subject_id,
          att.category_slug,
          att.attempt_number,
          att.status,
          att.started_at,
          att.expires_at,
          att.submitted_at,
          att.total_score,
          att.maximum_marks,
          att.correct_count,
          att.incorrect_count,
          att.unanswered_count,
          att.time_taken_seconds,
        ]
      );
    }

    // 12. Attempt Answers
    for (const ans of db.attempt_answers) {
      await client.query(
        `INSERT INTO attempt_answers (id, attempt_id, question_id, selected_option, is_marked_for_review, is_visited, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (attempt_id, question_id) DO UPDATE SET
           selected_option = EXCLUDED.selected_option,
           is_marked_for_review = EXCLUDED.is_marked_for_review,
           is_visited = EXCLUDED.is_visited,
           updated_at = EXCLUDED.updated_at`,
        [
          ans.id,
          ans.attempt_id,
          ans.question_id,
          ans.selected_option,
          ans.is_marked_for_review,
          ans.is_visited,
          ans.updated_at,
        ]
      );
    }

    // 13. Audit Logs (latest 100)
    for (const log of (db.audit_logs || []).slice(0, 100)) {
      await client.query(
        `INSERT INTO audit_logs (id, actor_id, actor_email, action, target_type, target_id, details, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        [
          log.id,
          log.actor_id,
          log.actor_email,
          log.action,
          log.target_type,
          log.target_id,
          log.details,
          log.created_at,
        ]
      );
    }

    // 14. Webhook Events
    for (const wh of db.webhook_events || []) {
      await client.query(
        `INSERT INTO webhook_events (id, event_id, event_type, gateway_order_id, processed_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (event_id) DO NOTHING`,
        [wh.id, wh.event_id, wh.event_type, wh.gateway_order_id, wh.processed_at]
      );
    }

    // 15. User Bookmarks
    for (const bm of db.bookmarks || []) {
      await client.query(
        `INSERT INTO user_bookmarks (id, user_id, test_id, note, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (user_id, test_id) DO UPDATE SET
           note = EXCLUDED.note,
           updated_at = NOW()`,
        [bm.id, bm.userId, bm.testId, bm.note, bm.created_at]
      );
    }

    await client.query('COMMIT');
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('Failed to sync store state to Supabase PostgreSQL', {
      error: err.message,
    });
  } finally {
    client.release();
  }
}
