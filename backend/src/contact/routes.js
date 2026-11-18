import { Router } from 'express';
import { z } from 'zod';
import { renderContactNotification } from '../email/contact-notification.js';
import { HttpError, asyncRoute, clientIp } from '../http.js';
import { parseBody } from '../content/schemas.js';
import { isHumanPaced, issueStartToken } from './start-token.js';

const LOGO_URL = 'https://aungkaungkhant.work/email/clay-wordmark.png';
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 3;

const MESSAGE_LENGTH_ERROR = 'Message must be between 10 and 5000 characters';

const field = (label, max) =>
  z.string({ error: `${label} is required` }).trim().max(max, `${label} must be at most ${max} characters`);

const contactSchema = z.object(
  {
    name: field('Name', 120).min(1, 'Name is required'),
    email: field('Email', 254).pipe(z.email('Enter a valid email address')),
    company: field('Company', 120).default(''),
    message: z
      .string({ error: MESSAGE_LENGTH_ERROR })
      .trim()
      .min(10, MESSAGE_LENGTH_ERROR)
      .max(5000, MESSAGE_LENGTH_ERROR),
  },
  { error: 'Body must be a JSON object' },
);

const isFilled = (value) => value !== undefined && value !== null && value !== '';

// Bots fill the hidden field and submit faster than a person can type.
function looksAutomated({ website, startToken }, { secret, now }) {
  return isFilled(website) || !isHumanPaced(startToken, secret, now.getTime());
}

// Counting and inserting under one per-IP lock keeps parallel submissions from exceeding the cap.
async function storeUnlessLimited(db, ip, submission, now) {
  const since = new Date(now.getTime() - WINDOW_MS).toISOString();
  return db.transaction(async (query) => {
    await query('select pg_advisory_xact_lock(hashtext($1))', [`contact:${ip}`]);
    const [{ recent }] = await query(
      'select count(*)::int as recent from contact_submissions where ip = $1 and created_at > $2',
      [ip, since],
    );
    if (recent >= MAX_PER_WINDOW) return false;
    await query(
      'insert into contact_submissions (ip, name, email, company, message, created_at) values ($1, $2, $3, $4, $5, $6)',
      [ip, submission.name, submission.email, submission.company, submission.message, now.toISOString()],
    );
    return true;
  });
}

export function contactRouter({ db, mailer, env, clock }) {
  const router = Router();

  router.get('/start', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ token: issueStartToken(env.SESSION_SECRET, clock().getTime()) });
  });

  router.post('/', asyncRoute(async (req, res) => {
    const input = req.body ?? {};
    const now = clock();
    if (looksAutomated(input, { secret: env.SESSION_SECRET, now })) return res.status(202).json({ ok: true });

    const submission = parseBody(contactSchema, input);
    if (!(await storeUnlessLimited(db, clientIp(req), submission, now))) {
      throw new HttpError(429, 'Too many messages. Try again later.');
    }

    // Sent after the transaction commits so the lock is never held during network I/O.
    const { subject, html, text } = renderContactNotification({ ...submission, receivedAt: now }, LOGO_URL);
    try {
      await mailer.send({ from: env.CONTACT_FROM, to: env.CONTACT_TO, replyTo: submission.email, subject, html, text });
    } catch (err) {
      console.error('Contact email failed', err);
      throw new HttpError(502, 'Message could not be sent. Email clay.net@proton.me directly.');
    }
    res.status(202).json({ ok: true });
  }));

  return router;
}
