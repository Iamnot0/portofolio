import { createHmac, timingSafeEqual } from 'node:crypto';

const MIN_AGE_MS = 3000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const encode = (value) => Buffer.from(value).toString('base64url');
const sign = (secret, issuedAt) => createHmac('sha256', secret).update(String(issuedAt)).digest();

// The server stamps the moment a visitor starts the form, so the fill-time check never trusts a client clock.
export function issueStartToken(secret, issuedAt) {
  return `${encode(String(issuedAt))}.${encode(sign(secret, issuedAt))}`;
}

// True only for an authentic token issued between 3 seconds and 24 hours before `now`.
export function isHumanPaced(token, secret, now) {
  if (!secret || typeof token !== 'string') return false;
  const [stamp, signature, ...rest] = token.split('.');
  if (!stamp || !signature || rest.length > 0) return false;

  const issued = Buffer.from(stamp, 'base64url').toString();
  if (!/^\d{1,15}$/.test(issued)) return false;
  const expected = sign(secret, issued);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;

  const age = now - Number(issued);
  return age >= MIN_AGE_MS && age <= MAX_AGE_MS;
}
