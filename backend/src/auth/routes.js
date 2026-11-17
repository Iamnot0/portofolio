import { Router } from 'express';
import { HttpError, asyncRoute } from '../http.js';
import { sameEmail, verifyPassword } from './password.js';
import { clearFailures, isLockedOut, recordFailure } from './rate-limit.js';
import { clearSessionCookie, issueSession, readSession, setSessionCookie } from './session.js';
import { verifyTotp } from './totp.js';

const MAX_FIELD_LENGTH = 1024;

const text = (value) => (typeof value === 'string' && value.length <= MAX_FIELD_LENGTH ? value : '');
const clientIp = (req) => req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;

export function authRouter(ctx) {
  const { db, env, clock } = ctx;
  const router = Router();

  router.post('/login', asyncRoute(async (req, res) => {
    const ip = clientIp(req);
    const now = clock();
    if (await isLockedOut(db, ip, now)) {
      throw new HttpError(429, 'Too many attempts. Try again in 15 minutes.');
    }

    const email = text(req.body?.email);
    const password = text(req.body?.password);
    const code = text(req.body?.code);
    // Evaluate every factor so a wrong field costs the same as a wrong password.
    const checks = [
      sameEmail(email, env.ADMIN_EMAIL),
      await verifyPassword(password, env.ADMIN_PASSWORD_HASH),
      verifyTotp(env.ADMIN_TOTP_SECRET, code, now),
    ];
    if (!checks.every(Boolean)) {
      await recordFailure(db, ip, now);
      throw new HttpError(401, 'Email, password or code is incorrect');
    }

    await clearFailures(db, ip);
    setSessionCookie(res, await issueSession(ctx));
    res.json({ signedIn: true });
  }));

  router.post('/logout', (req, res) => {
    clearSessionCookie(res);
    res.json({ signedIn: false });
  });

  router.get('/session', asyncRoute(async (req, res) => {
    res.json({ signedIn: Boolean(await readSession(req, ctx)) });
  }));

  return router;
}
