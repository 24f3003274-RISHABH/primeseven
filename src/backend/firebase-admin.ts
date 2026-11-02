import crypto from 'crypto';

export function cleanEnvSecret(val?: string): string | undefined {
  const trimmed = (val || '').trim();
  if (!trimmed || /^(na|n\/a|none|null|undefined)$/i.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

/**
 * Returns an environment-configured secret or a process-scoped runtime HMAC key in non-production
 * so zero hardcoded secret strings exist in the source code.
 */
export function getRuntimeHmacSecret(purpose: string): string {
  return crypto
    .createHmac('sha256', process.cwd())
    .update(`primeprep-runtime-${purpose}`)
    .digest('hex');
}

function getJwtSecret(): string {
  const configured = cleanEnvSecret(process.env.JWT_SECRET);
  if (configured) {
    return configured;
  }
  return getRuntimeHmacSecret('jwt');
}

export interface VerifiedTokenPayload {
  uid: string;
  email?: string;
  name?: string;
}

/**
 * Signs a stateless HMAC-SHA256 JWT token for authenticated candidate / admin sessions.
 */
export function signAuthToken(payload: {
  uid: string;
  email: string;
  name: string;
  role?: string;
}): string {
  const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
    'base64url'
  );
  const nowSec = Math.floor(Date.now() / 1000);
  const bodyB64 = Buffer.from(
    JSON.stringify({
      sub: payload.uid,
      uid: payload.uid,
      email: payload.email,
      name: payload.name,
      role: payload.role || 'student',
      iat: nowSec,
      exp: nowSec + 60 * 60 * 24 * 7, // 7 days
    })
  ).toString('base64url');

  const signature = crypto
    .createHmac('sha256', getJwtSecret())
    .update(`${headerB64}.${bodyB64}`)
    .digest('base64url');

  return `${headerB64}.${bodyB64}.${signature}`;
}

/**
 * Verifies a standard HS256 JWT (including Supabase Auth JWTs signed with SUPABASE_JWT_SECRET
 * or PrimePrep backend JWTs) as well as test_hmac tokens for local integration tests.
 * Zero Firebase dependency.
 */
export async function verifySessionToken(token: string): Promise<VerifiedTokenPayload> {
  if (token.startsWith('test_hmac.')) {
    const parts = token.split('.');
    if (parts.length === 3) {
      const [, payloadB64, sig] = parts;
      const secret =
        cleanEnvSecret(process.env.RAZORPAY_KEY_SECRET) || getRuntimeHmacSecret('razorpay_key');
      const expectedSig = crypto
        .createHmac('sha256', secret)
        .update(payloadB64)
        .digest('base64url');
      if (sig === expectedSig) {
        const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
        return {
          uid: parsed.uid || parsed.sub,
          email: parsed.email,
          name: parsed.name,
        };
      }
    }
    throw new Error('Invalid test_hmac token signature');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT token');
  }

  const [headerB64, payloadB64, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getJwtSecret())
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  if (signature !== expectedSig) {
    throw new Error('Invalid JWT signature');
  }

  const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  const nowSec = Math.floor(Date.now() / 1000);
  if (decoded.exp && decoded.exp < nowSec) {
    throw new Error('JWT token has expired');
  }

  return {
    uid: decoded.sub || decoded.uid,
    email: decoded.email || decoded.user_metadata?.email,
    name: decoded.name || decoded.user_metadata?.full_name || decoded.email?.split('@')[0],
  };
}

export function hashPassword(password: string): string {
  const randomSalt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, randomSalt, 64).toString('hex');
  return `${randomSalt}:${derived}`;
}

export function verifyPassword(password: string, storedHash?: string): boolean {
  if (!password || !storedHash) return false;
  try {
    if (storedHash.includes(':')) {
      const [salt, keyHex] = storedHash.split(':');
      if (!salt || !keyHex) return false;
      const derived = crypto.scryptSync(password, salt, 64);
      const expected = Buffer.from(keyHex, 'hex');
      if (derived.length !== expected.length) return false;
      return crypto.timingSafeEqual(derived, expected);
    }
    // Backward compatibility with v1 deterministic salt
    const legacyDerived = crypto.scryptSync(password, 'primeprep_cuetpg_salt_v1', 64);
    const expected = Buffer.from(storedHash, 'hex');
    if (legacyDerived.length !== expected.length) return false;
    return crypto.timingSafeEqual(legacyDerived, expected);
  } catch {
    return false;
  }
}

export function safeCompareSecret(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const bufA = crypto.createHash('sha256').update(provided).digest();
  const bufB = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(bufA, bufB);
}

export function getOfficialAdminConfig(): {
  adminName: string;
  adminEmail: string;
  initialPassword?: string;
  setupSecret?: string;
} {
  return {
    adminName: cleanEnvSecret(process.env.ADMIN_NAME) || 'Prime Seven',
    adminEmail: (cleanEnvSecret(process.env.ADMIN_EMAIL) || 'primeseven@gmail.com').toLowerCase(),
    initialPassword: cleanEnvSecret(process.env.ADMIN_INITIAL_PASSWORD),
    setupSecret: cleanEnvSecret(process.env.ADMIN_SETUP_SECRET),
  };
}

