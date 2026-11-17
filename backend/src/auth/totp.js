import * as OTPAuth from 'otpauth';

const WINDOW = 1;

export function verifyTotp(secret, code, now) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return false;
  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secret),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });
  return totp.validate({ token: code, timestamp: now.getTime(), window: WINDOW }) !== null;
}
