import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

const N = 16384;
const R = 8;
const P = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 64;

export async function hashPassword(password) {
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(password, salt, KEY_BYTES, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password, stored) {
  const parsed = parseStored(stored);
  if (!parsed) return false;
  const { n, r, p, salt, key } = parsed;
  try {
    const candidate = await scryptAsync(password, salt, key.length, { N: n, r, p });
    return timingSafeEqual(candidate, key);
  } catch {
    return false;
  }
}

// Hashing both sides makes the comparison fixed-length and constant-time.
export function sameEmail(given, expected) {
  if (!expected) return false;
  const digest = (value) => createHash('sha256').update(value.trim().toLowerCase()).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

function parseStored(stored) {
  if (typeof stored !== 'string') return null;
  const [scheme, n, r, p, salt, key, ...extra] = stored.split('$');
  if (scheme !== 'scrypt' || !key || extra.length) return null;
  const params = [n, r, p].map(Number);
  if (!params.every(Number.isSafeInteger)) return null;
  return {
    n: params[0],
    r: params[1],
    p: params[2],
    salt: Buffer.from(salt, 'base64'),
    key: Buffer.from(key, 'base64'),
  };
}
