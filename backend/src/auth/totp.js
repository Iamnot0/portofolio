import * as OTPAuth from 'otpauth';

const WINDOW = 1;
const PERIOD_MS = 30_000;

// Returns the time step the code belongs to, or null when it is not valid right now.
export function totpStep(secret, code, now) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secret),
    algorithm: 'SHA1',
    digits: 6,
    period: PERIOD_MS / 1000,
  });
  const delta = totp.validate({ token: code, timestamp: now.getTime(), window: WINDOW });
  return delta === null ? null : Math.floor(now.getTime() / PERIOD_MS) + delta;
}

export const verifyTotp = (secret, code, now) => totpStep(secret, code, now) !== null;

// Single atomic statement: the step is taken only if it is later than every step used so far.
export async function claimTotpStep(query, step) {
  const rows = await query(
    `insert into admin_totp_state (id, last_step) values (1, $1)
     on conflict (id) do update set last_step = excluded.last_step
       where admin_totp_state.last_step < excluded.last_step
     returning last_step`,
    [step],
  );
  return rows.length > 0;
}
