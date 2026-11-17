import { Router } from 'express';
import { HttpError, asyncRoute, clientIp } from '../http.js';
import { sameEmail, verifyPassword } from './password.js';
import { clearAttempts, registerAttempt } from './rate-limit.js';
import { clearSessionCookie, issueSession, readSession, setSessionCookie } from './session.js';
import { claimTotpStep, totpStep } from './totp.js';

const MAX_FIELD_LENGTH = 1024;

const text = (value) => (typeof value === 'string' && value.length <= MAX_FIELD_LENGTH ? value : '');

export function authRouter(ctx) {
  const { db, env, clock } = ctx;
  const router = Router();

  router.post('/login', asyncRoute(async (req, res) => {
    const ip = clientIp(req);
    const now = clock();
    if ((await registerAttempt(db, ip, now)).locked) {
      throw new HttpError(429, 'Too many attempts. Try again in 15 minutes.');
    }

    const email = text(req.body?.email);
    const password = text(req.body?.password);
    const code = text(req.body?.code);
    // Evaluate every factor so a wrong field costs the same as a wrong password.
    const emailOk = sameEmail(email, env.ADMIN_EMAIL);
    const passwordOk = await verifyPassword(password, env.ADMIN_PASSWORD_HASH);
    const step = totpStep(env.ADMIN_TOTP_SECRET, code, now);

    // The code is only spent, and the attempts only cleared, when every factor passed.
    const signedIn =
      emailOk &&
      passwordOk &&
      step !== null &&
      (await db.transaction(async (query) => {
        const claimed = await claimTotpStep(query, step);
        if (claimed) await clearAttempts(query, ip);
        return claimed;
      }));
    if (!signedIn) throw new HttpError(401, 'Email, password or code is incorrect');

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
