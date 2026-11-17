import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import express from 'express';
import * as OTPAuth from 'otpauth';
import { hashPassword, verifyPassword } from '../src/auth/password.js';
import { verifyTotp } from '../src/auth/totp.js';
import { issueSession, requireAdmin } from '../src/auth/session.js';
import { errorHandler } from '../src/http.js';
import { serve, testApp } from './helpers.js';

const EMAIL = 'admin@portfolio.test';
const PASSWORD = randomBytes(12).toString('base64url');
const TOTP_SECRET = new OTPAuth.Secret({ size: 20 }).base32;
const SESSION_SECRET = randomBytes(32).toString('hex');
const START = new Date('2026-03-01T12:00:00Z');
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const BAD_CREDENTIALS = { error: 'Email, password or code is incorrect' };
const LOCKED_OUT = { error: 'Too many attempts. Try again in 15 minutes.' };

const codeAt = (date, secret = TOTP_SECRET) =>
  new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), algorithm: 'SHA1', digits: 6, period: 30 }).generate({
    timestamp: date.getTime(),
  });

describe('password hashing', () => {
  it('produces the documented scrypt format', async () => {
    const stored = await hashPassword(PASSWORD);
    const [scheme, n, r, p, salt, hash] = stored.split('$');
    assert.deepEqual([scheme, n, r, p], ['scrypt', '16384', '8', '1']);
    assert.ok(Buffer.from(salt, 'base64').length >= 16);
    assert.ok(Buffer.from(hash, 'base64').length >= 32);
  });

  it('salts every hash', async () => {
    assert.notEqual(await hashPassword(PASSWORD), await hashPassword(PASSWORD));
  });

  it('accepts the right password and rejects others', async () => {
    const stored = await hashPassword(PASSWORD);
    assert.equal(await verifyPassword(PASSWORD, stored), true);
    assert.equal(await verifyPassword(`${PASSWORD}x`, stored), false);
    assert.equal(await verifyPassword('', stored), false);
  });

  it('rejects malformed stored hashes instead of throwing', async () => {
    for (const stored of [undefined, '', 'plain', 'scrypt$16384$8$1$salt', 'bcrypt$16384$8$1$c2FsdA$aGFzaA']) {
      assert.equal(await verifyPassword(PASSWORD, stored), false);
    }
  });
});

describe('TOTP verification', () => {
  const step = 30_000;

  it('accepts the current code and one step either side', () => {
    for (const offset of [-step, 0, step]) {
      assert.equal(verifyTotp(TOTP_SECRET, codeAt(new Date(START.getTime() + offset)), START), true);
    }
  });

  it('rejects codes two steps away', () => {
    for (const offset of [-2 * step, 2 * step]) {
      assert.equal(verifyTotp(TOTP_SECRET, codeAt(new Date(START.getTime() + offset)), START), false);
    }
  });

  it('rejects malformed codes', () => {
    for (const code of [undefined, null, '', '12345', '1234567', 'abcdef', 123456]) {
      assert.equal(verifyTotp(TOTP_SECRET, code, START), false);
    }
  });

  it('rejects a code from a different secret', () => {
    const other = new OTPAuth.Secret({ size: 20 }).base32;
    assert.equal(verifyTotp(TOTP_SECRET, codeAt(START, other), START), false);
  });
});

describe('admin sign-in', () => {
  let app;
  let now;
  const clock = () => now;

  before(async () => {
    const env = {
      ADMIN_EMAIL: EMAIL,
      ADMIN_PASSWORD_HASH: await hashPassword(PASSWORD),
      ADMIN_TOTP_SECRET: TOTP_SECRET,
      SESSION_SECRET,
    };
    app = await testApp({ env, clock });
  });
  after(() => app.close());

  beforeEach(async () => {
    now = START;
    await app.db.query('delete from login_attempts');
  });

  const post = (path, body, headers = {}) =>
    app.request(path, { method: 'POST', body, headers: { origin: app.origin, ...headers } });

  const credentials = (overrides = {}) => ({ email: EMAIL, password: PASSWORD, code: codeAt(now), ...overrides });
  const login = (overrides, headers) => post('/api/auth/login', credentials(overrides), headers);
  const cookieOf = (res) => res.headers.get('set-cookie').split(';')[0];
  const session = (cookie) => app.request('/api/auth/session', { headers: cookie ? { cookie } : {} });

  it('signs in with email, password and code and sets a hardened cookie', async () => {
    const res = await login();
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { signedIn: true });
    const setCookie = res.headers.get('set-cookie');
    assert.match(setCookie, /^clay_session=[^;]+/);
    for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Strict', `Max-Age=${8 * 3600}`]) {
      assert.ok(setCookie.includes(attribute), `missing ${attribute} in ${setCookie}`);
    }
    assert.deepEqual((await session(cookieOf(res))).body, { signedIn: true });
  });

  it('accepts the email in any case and with stray whitespace', async () => {
    const res = await login({ email: `  ${EMAIL.toUpperCase()} ` });
    assert.equal(res.status, 200);
  });

  for (const [field, value] of [
    ['email', 'someone.else@portfolio.test'],
    ['password', 'not-the-password'],
    ['code', '000000'],
  ]) {
    it(`gives the same 401 for a wrong ${field}`, async () => {
      const res = await login({ [field]: value });
      assert.equal(res.status, 401);
      assert.deepEqual(res.body, BAD_CREDENTIALS);
      assert.equal(res.headers.get('set-cookie'), null);
    });
  }

  it('gives the same 401 for missing or non-string fields', async () => {
    for (const body of [{}, { email: EMAIL }, { email: 1, password: [], code: {} }, undefined]) {
      const res = await post('/api/auth/login', body);
      assert.equal(res.status, 401);
      assert.deepEqual(res.body, BAD_CREDENTIALS);
    }
  });

  it('rejects a code from two steps ago', async () => {
    const stale = codeAt(new Date(now.getTime() - 60_000));
    const res = await login({ code: stale });
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, BAD_CREDENTIALS);
  });

  it('locks an IP out after five failures, even for correct credentials', async () => {
    for (let i = 0; i < 5; i += 1) {
      assert.equal((await login({ password: 'wrong' })).status, 401);
    }
    const res = await login();
    assert.equal(res.status, 429);
    assert.deepEqual(res.body, LOCKED_OUT);
    assert.equal(res.headers.get('set-cookie'), null);
  });

  it('lifts the lock once the 15 minute window has passed', async () => {
    for (let i = 0; i < 5; i += 1) await login({ password: 'wrong' });
    now = new Date(now.getTime() + 14 * MINUTE);
    assert.equal((await login()).status, 429);
    now = new Date(START.getTime() + 15 * MINUTE + 1000);
    assert.equal((await login()).status, 200);
  });

  it('counts failures per IP', async () => {
    for (let i = 0; i < 5; i += 1) {
      await login({ password: 'wrong' }, { 'x-forwarded-for': '198.51.100.7' });
    }
    assert.equal((await login({}, { 'x-forwarded-for': '198.51.100.7' })).status, 429);
    assert.equal((await login({}, { 'x-forwarded-for': '198.51.100.8' })).status, 200);
  });

  it('keys on the first forwarded address, not the proxy chain', async () => {
    for (let i = 0; i < 5; i += 1) {
      await login({ password: 'wrong' }, { 'x-forwarded-for': '198.51.100.9, 10.0.0.1' });
    }
    assert.equal((await login({}, { 'x-forwarded-for': '198.51.100.9, 10.0.0.2' })).status, 429);
  });

  it('clears the failure count on a successful sign-in', async () => {
    for (let round = 0; round < 2; round += 1) {
      for (let i = 0; i < 4; i += 1) await login({ password: 'wrong' });
      assert.equal((await login()).status, 200);
    }
  });

  it('reports no session without a cookie, with junk, or with a forged token', async () => {
    const forged = await issueSession({ env: { SESSION_SECRET: 'x'.repeat(32) }, clock });
    for (const cookie of [undefined, 'clay_session=', 'clay_session=junk', `clay_session=${forged}`]) {
      const res = await session(cookie);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { signedIn: false });
    }
  });

  it('expires the session after eight hours', async () => {
    const cookie = cookieOf(await login());
    now = new Date(START.getTime() + 8 * HOUR - 1000);
    assert.deepEqual((await session(cookie)).body, { signedIn: true });
    now = new Date(START.getTime() + 8 * HOUR + 1000);
    assert.deepEqual((await session(cookie)).body, { signedIn: false });
  });

  it('clears the cookie on logout with the same attributes', async () => {
    const res = await post('/api/auth/logout');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { signedIn: false });
    const setCookie = res.headers.get('set-cookie');
    assert.match(setCookie, /^clay_session=;/);
    for (const attribute of ['Max-Age=0', 'HttpOnly', 'Secure', 'SameSite=Strict']) {
      assert.ok(setCookie.includes(attribute), `missing ${attribute} in ${setCookie}`);
    }
  });
});

describe('origin guard', () => {
  let app;
  before(async () => {
    app = await testApp({ env: {} });
  });
  after(() => app.close());

  const post = (path, headers) => app.request(path, { method: 'POST', body: {}, headers });

  it('rejects a foreign Origin', async () => {
    const res = await post('/api/auth/login', { origin: 'https://evil.example' });
    assert.equal(res.status, 403);
    assert.deepEqual(res.body, { error: 'Forbidden' });
  });

  it('rejects a missing Origin', async () => {
    const res = await post('/api/auth/logout', {});
    assert.equal(res.status, 403);
    assert.deepEqual(res.body, { error: 'Forbidden' });
  });

  it('rejects the right host on the wrong scheme', async () => {
    const res = await post('/api/auth/logout', { origin: app.origin.replace('http:', 'https:') });
    assert.equal(res.status, 403);
  });

  it('allows the request\'s own origin', async () => {
    const res = await post('/api/auth/logout', { origin: app.origin });
    assert.equal(res.status, 200);
  });

  it('builds the own origin from x-forwarded-proto behind a proxy', async () => {
    const proxied = { 'x-forwarded-proto': 'https', origin: app.origin.replace('http:', 'https:') };
    assert.equal((await post('/api/auth/logout', proxied)).status, 200);
    assert.equal((await post('/api/auth/logout', { 'x-forwarded-proto': 'https', origin: app.origin })).status, 403);
  });

  it('does not guard GET requests', async () => {
    const res = await app.request('/api/health', { headers: { origin: 'https://evil.example' } });
    assert.equal(res.status, 200);
  });

  it('leaves the public contact form open to cross-origin posts', async () => {
    const res = await post('/api/contact', { origin: 'https://evil.example' });
    assert.notEqual(res.status, 403);
  });
});

describe('requireAdmin', () => {
  let server;
  let now;
  const ctx = { env: { SESSION_SECRET }, clock: () => now };

  before(async () => {
    const app = express();
    app.get('/private', requireAdmin(ctx), (req, res) => res.json({ secret: true }));
    app.use(errorHandler);
    server = await serve(app);
  });
  after(() => server.close());
  beforeEach(() => {
    now = START;
  });

  it('answers 401 without a session', async () => {
    const res = await server.request('/private');
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { error: 'Sign in required' });
  });

  it('lets a valid session through and rejects it once expired', async () => {
    const cookie = `clay_session=${await issueSession(ctx)}`;
    assert.equal((await server.request('/private', { headers: { cookie } })).status, 200);
    now = new Date(START.getTime() + 8 * HOUR + 1000);
    assert.equal((await server.request('/private', { headers: { cookie } })).status, 401);
  });
});
