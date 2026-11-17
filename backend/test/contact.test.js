import { after, before, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createResendMailer } from '../src/email/resend.js';
import { contactBody, fakeMailer, testApp } from './helpers.js';

const START = new Date('2026-03-01T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const ENV = { CONTACT_TO: 'clay.net@proton.me', CONTACT_FROM: 'contact@aungkaungkhant.work' };

const TOO_MANY = { error: 'Too many messages. Try again later.' };
const NOT_SENT = { error: 'Message could not be sent. Email clay.net@proton.me directly.' };

describe('contact form', () => {
  let app;
  let mailer;
  let now;

  before(async () => {
    mailer = fakeMailer();
    app = await testApp({ env: ENV, mailer, clock: () => now });
  });
  after(() => app.close());

  beforeEach(async () => {
    now = START;
    mailer.sent.length = 0;
    mailer.failWith = null;
    await app.db.query('delete from contact_submissions');
  });

  const submit = (overrides = {}, headers = {}) =>
    app.request('/api/contact', { method: 'POST', body: contactBody(overrides, now), headers });
  const from = (ip) => ({ 'x-forwarded-for': ip });
  const stored = () => app.db.query('select ip, name, email, company, message, created_at from contact_submissions order by id');

  describe('delivery', () => {
    it('stores a valid submission and emails Clay with the visitor as reply-to', async () => {
      const res = await submit({}, from('203.0.113.7, 10.0.0.1'));
      assert.equal(res.status, 202);
      assert.deepEqual(res.body, { ok: true });

      assert.equal(mailer.sent.length, 1);
      const [message] = mailer.sent;
      assert.equal(message.to, 'clay.net@proton.me');
      assert.equal(message.from, 'contact@aungkaungkhant.work');
      assert.equal(message.replyTo, 'ada@example.com');
      assert.match(message.subject, /Ada Lovelace/);
      assert.match(message.html, /https:\/\/www\.aungkaungkhant\.work\/email\/clay-wordmark\.png/);
      assert.match(message.text, /I would like to talk about a project\./);

      const rows = await stored();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].ip, '203.0.113.7');
      assert.equal(rows[0].email, 'ada@example.com');
      assert.equal(rows[0].company, 'Analytical Engines');
      assert.equal(new Date(rows[0].created_at).getTime(), START.getTime());
    });

    it('escapes script tags in the message', async () => {
      const res = await submit({ message: '<script>alert(1)</script> hello there' });
      assert.equal(res.status, 202);
      const { html } = mailer.sent[0];
      assert.match(html, /&lt;script&gt;/);
      assert.doesNotMatch(html, /<script/);
    });

    it('accepts a missing company', async () => {
      const body = contactBody({}, now);
      delete body.company;
      const res = await app.request('/api/contact', { method: 'POST', body });
      assert.equal(res.status, 202);
      assert.equal((await stored())[0].company, '');
    });

    it('answers 502 when the mailer fails and keeps the stored row', async () => {
      mailer.failWith = new Error('Resend is down');
      const log = mock.method(console, 'error', () => {});
      try {
        const res = await submit();
        assert.equal(res.status, 502);
        assert.deepEqual(res.body, NOT_SENT);
        assert.equal(log.mock.callCount(), 1);
      } finally {
        log.mock.restore();
      }
      assert.equal((await stored()).length, 1);
    });
  });

  describe('bot traps', () => {
    const trapped = async (overrides) => {
      const res = await submit(overrides);
      assert.equal(res.status, 202);
      assert.deepEqual(res.body, { ok: true });
      assert.equal(mailer.sent.length, 0);
      assert.equal((await stored()).length, 0);
    };

    it('swallows a filled honeypot', () => trapped({ website: 'https://spam.example' }));
    it('swallows a missing startedAt', () => trapped({ startedAt: undefined }));
    it('swallows a non-numeric startedAt', () => trapped({ startedAt: String(START.getTime() - 10_000) }));
    it('swallows a startedAt in the future', () => trapped({ startedAt: START.getTime() + 60_000 }));
    it('swallows a form filled in under 3 seconds', () => trapped({ startedAt: START.getTime() - 2_999 }));

    it('accepts a form filled in exactly 3 seconds', async () => {
      assert.equal((await submit({ startedAt: START.getTime() - 3_000 })).status, 202);
      assert.equal(mailer.sent.length, 1);
    });

    it('answers a non-JSON-object body like a bot, without throwing', async () => {
      const res = await app.request('/api/contact', { method: 'POST', body: [] });
      assert.equal(res.status, 202);
      assert.equal((await stored()).length, 0);
    });
  });

  describe('validation', () => {
    const rejects = async (overrides, message) => {
      const res = await submit(overrides);
      assert.equal(res.status, 400);
      assert.deepEqual(res.body, { error: message });
      assert.equal(mailer.sent.length, 0);
      assert.equal((await stored()).length, 0);
    };

    it('requires a name', () => rejects({ name: '   ' }, 'Name is required'));
    it('rejects a missing name', () => rejects({ name: undefined }, 'Name is required'));
    it('caps the name at 120 characters', () => rejects({ name: 'a'.repeat(121) }, 'Name must be at most 120 characters'));
    it('rejects a malformed email', () => rejects({ email: 'not-an-email' }, 'Enter a valid email address'));
    it('rejects an email with a line break', () => rejects({ email: 'a@example.com\nbcc: x@example.com' }, 'Enter a valid email address'));
    it('caps the email at 254 characters', () => rejects({ email: `${'a'.repeat(250)}@example.com` }, 'Email must be at most 254 characters'));
    it('caps the company at 120 characters', () => rejects({ company: 'a'.repeat(121) }, 'Company must be at most 120 characters'));
    it('rejects a message under 10 characters', () => rejects({ message: 'too short' }, 'Message must be between 10 and 5000 characters'));
    it('rejects a message over 5000 characters', () => rejects({ message: 'a'.repeat(5001) }, 'Message must be between 10 and 5000 characters'));
    it('rejects non-text fields', () => rejects({ message: { $gt: '' } }, 'Message must be between 10 and 5000 characters'));

    it('accepts a message at both limits', async () => {
      assert.equal((await submit({ message: 'a'.repeat(10) })).status, 202);
      assert.equal((await submit({ message: 'a'.repeat(5000) })).status, 202);
    });
  });

  describe('rate limit', () => {
    it('refuses the 4th message from one IP within an hour and stores nothing more', async () => {
      for (let i = 0; i < 3; i += 1) assert.equal((await submit({}, from('198.51.100.1'))).status, 202);
      const res = await submit({}, from('198.51.100.1'));
      assert.equal(res.status, 429);
      assert.deepEqual(res.body, TOO_MANY);
      assert.equal((await stored()).length, 3);
      assert.equal(mailer.sent.length, 3);
    });

    it('counts each IP on its own', async () => {
      for (let i = 0; i < 3; i += 1) await submit({}, from('198.51.100.1'));
      assert.equal((await submit({}, from('198.51.100.2'))).status, 202);
    });

    it('does not count bot traps or invalid submissions', async () => {
      for (let i = 0; i < 3; i += 1) await submit({ website: 'spam' }, from('198.51.100.1'));
      for (let i = 0; i < 3; i += 1) await submit({ email: 'nope' }, from('198.51.100.1'));
      assert.equal((await submit({}, from('198.51.100.1'))).status, 202);
    });

    it('reopens once the hour has passed', async () => {
      for (let i = 0; i < 3; i += 1) await submit({}, from('198.51.100.1'));
      now = new Date(START.getTime() + HOUR - 1000);
      assert.equal((await submit({}, from('198.51.100.1'))).status, 429);
      now = new Date(START.getTime() + HOUR);
      assert.equal((await submit({}, from('198.51.100.1'))).status, 202);
    });

    it('lets only three of many parallel submissions through', async () => {
      const results = await Promise.all(Array.from({ length: 8 }, () => submit({}, from('198.51.100.9'))));
      assert.equal(results.filter((res) => res.status === 202).length, 3);
      assert.equal(results.filter((res) => res.status === 429).length, 5);
      assert.equal((await stored()).length, 3);
    });

    it('still counts a submission whose email failed to send', async () => {
      mailer.failWith = new Error('Resend is down');
      const log = mock.method(console, 'error', () => {});
      try {
        for (let i = 0; i < 3; i += 1) assert.equal((await submit({}, from('198.51.100.1'))).status, 502);
        assert.equal((await submit({}, from('198.51.100.1'))).status, 429);
      } finally {
        log.mock.restore();
      }
    });
  });
});

describe('Resend mailer', () => {
  const API_KEY = 're_test_secret_key';
  const message = {
    from: 'contact@aungkaungkhant.work',
    to: 'clay.net@proton.me',
    replyTo: 'ada@example.com',
    subject: 'New message from Ada',
    html: '<p>hi</p>',
    text: 'hi',
  };
  let fetchMock;

  const respond = (status, body) => {
    fetchMock = mock.method(globalThis, 'fetch', async () => Response.json(body, { status }));
  };
  const restore = () => fetchMock?.mock.restore();
  after(restore);

  it('posts the message to Resend with the bearer key and returns the id', async () => {
    respond(200, { id: 'msg_123' });
    try {
      assert.deepEqual(await createResendMailer(API_KEY).send(message), { id: 'msg_123' });
      const [url, init] = fetchMock.mock.calls[0].arguments;
      assert.equal(url, 'https://api.resend.com/emails');
      assert.equal(init.method, 'POST');
      assert.equal(init.headers.authorization, `Bearer ${API_KEY}`);
      assert.equal(init.headers['content-type'], 'application/json');
      assert.deepEqual(JSON.parse(init.body), {
        from: message.from,
        to: [message.to],
        reply_to: message.replyTo,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
    } finally {
      restore();
    }
  });

  it('throws on a non-2xx response without leaking the API key', async () => {
    respond(403, { name: 'validation_error', message: 'The domain is not verified' });
    try {
      const error = await createResendMailer(API_KEY).send(message).catch((err) => err);
      assert.ok(error instanceof Error);
      assert.match(error.message, /403/);
      assert.doesNotMatch(`${error.message}${error.stack}`, new RegExp(API_KEY));
    } finally {
      restore();
    }
  });
});
