import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as OTPAuth from 'otpauth';
import { verifyPassword } from '../../backend/src/auth/password.js';
import { verifyTotp } from '../../backend/src/auth/totp.js';
import {
  buildTotpUri,
  createCredentials,
  generateTotpSecret,
  passwordProblem,
} from '../scripts/lib/admin-credentials.js';

describe('passwordProblem', () => {
  it('requires the two entries to match', () => {
    assert.match(passwordProblem('a-long-enough-pass', 'a-long-enough-different'), /do not match/i);
  });

  it('requires at least 12 characters', () => {
    assert.match(passwordProblem('short-pass', 'short-pass'), /at least 12/);
    assert.equal(passwordProblem('exactly-12-ch', 'exactly-12-ch'), null);
    assert.equal(passwordProblem('x'.repeat(12), 'x'.repeat(12)), null);
  });
});

describe('TOTP secret and URI', () => {
  it('generates a 20-byte base32 secret, different every time', () => {
    const secret = generateTotpSecret();
    assert.equal(OTPAuth.Secret.fromBase32(secret).bytes.length, 20);
    assert.notEqual(secret, generateTotpSecret());
  });

  it('builds the authenticator URI for aungkaungkhant.work:admin', () => {
    const secret = generateTotpSecret();
    const uri = buildTotpUri(secret);
    assert.ok(uri.startsWith('otpauth://totp/aungkaungkhant.work:admin?'));

    const totp = OTPAuth.URI.parse(uri);
    assert.equal(totp.issuer, 'aungkaungkhant.work');
    assert.equal(totp.label, 'admin');
    assert.equal(totp.secret.base32, secret);
    assert.equal(totp.algorithm, 'SHA1');
    assert.equal(totp.digits, 6);
    assert.equal(totp.period, 30);
  });
});

describe('createCredentials', () => {
  it('produces a hash the backend verifies and a secret the backend accepts codes for', async () => {
    const password = 'correct horse battery staple';
    const { passwordHash, totpSecret, totpUri } = await createCredentials(password);

    assert.ok(passwordHash.startsWith('scrypt$'));
    assert.equal(await verifyPassword(password, passwordHash), true);
    assert.equal(await verifyPassword('another password!', passwordHash), false);

    const now = new Date();
    const code = OTPAuth.URI.parse(totpUri).generate({ timestamp: now.getTime() });
    assert.equal(verifyTotp(totpSecret, code, now), true);
  });
});
