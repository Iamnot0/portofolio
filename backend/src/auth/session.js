import { SignJWT, jwtVerify } from 'jose';
import { HttpError, asyncRoute } from '../http.js';

export const SESSION_COOKIE = 'clay_session';
const SESSION_SECONDS = 8 * 60 * 60;
const SUBJECT = 'admin';

const cookieOptions = { httpOnly: true, secure: true, sameSite: 'strict', path: '/api' };
const key = (env) => new TextEncoder().encode(env.SESSION_SECRET);

export function issueSession({ env, clock }) {
  const issuedAt = Math.floor(clock().getTime() / 1000);
  return new SignJWT()
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(SUBJECT)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + SESSION_SECONDS)
    .sign(key(env));
}

export async function readSession(req, { env, clock }) {
  const token = cookieValue(req.headers.cookie, SESSION_COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(env), {
      algorithms: ['HS256'],
      subject: SUBJECT,
      currentDate: clock(),
    });
    return payload;
  } catch {
    return null;
  }
}

export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_SECONDS * 1000 });
}

export function clearSessionCookie(res) {
  res.cookie(SESSION_COOKIE, '', { ...cookieOptions, maxAge: 0 });
}

export const requireAdmin = (ctx) => asyncRoute(async (req, res, next) => {
  if (!(await readSession(req, ctx))) throw new HttpError(401, 'Sign in required');
  next();
});

function cookieValue(header = '', name) {
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return null;
}
