import * as OTPAuth from 'otpauth';
import { hashPassword } from '../../../backend/src/auth/password.js';

const ISSUER = 'aungkaungkhant.work';
const LABEL = 'admin';
const SECRET_BYTES = 20;
export const MIN_PASSWORD_LENGTH = 12;

export function passwordProblem(password, confirmation) {
  if (password !== confirmation) return 'The two entries do not match.';
  if (password.length < MIN_PASSWORD_LENGTH) return `The password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  return null;
}

export const generateTotpSecret = () => new OTPAuth.Secret({ size: SECRET_BYTES }).base32;

export function buildTotpUri(base32Secret) {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label: LABEL,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(base32Secret),
  }).toString();
}

export async function createCredentials(password) {
  const totpSecret = generateTotpSecret();
  return {
    passwordHash: await hashPassword(password),
    totpSecret,
    totpUri: buildTotpUri(totpSecret),
  };
}
