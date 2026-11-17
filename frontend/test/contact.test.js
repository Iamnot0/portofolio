import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createContactSession, submitContact } from '../src/contact.js';

const fields = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  company: '',
  message: 'I would like to talk about a project.',
  website: '',
  startToken: 'signed.token',
};

const reply = (body, status) => async () => new Response(JSON.stringify(body), { status });

describe('submitContact', () => {
  it('posts the fields as JSON to the contact endpoint', async () => {
    let request;
    const fetchImpl = async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify({ ok: true }), { status: 202 });
    };
    await submitContact(fields, fetchImpl);
    assert.equal(request.url, '/api/contact');
    assert.equal(request.init.method, 'POST');
    assert.equal(request.init.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(request.init.body), fields);
  });

  it('reports success on 202', async () => {
    assert.deepEqual(await submitContact(fields, reply({ ok: true }, 202)), { ok: true });
  });

  it('surfaces the API error text on 429', async () => {
    const result = await submitContact(fields, reply({ error: 'Too many messages. Try again later.' }, 429));
    assert.deepEqual(result, { ok: false, error: 'Too many messages. Try again later.' });
  });

  it('surfaces validation errors on 400', async () => {
    const result = await submitContact(fields, reply({ error: 'Enter a valid email address' }, 400));
    assert.deepEqual(result, { ok: false, error: 'Enter a valid email address' });
  });

  it('falls back to a direct email prompt when the network fails', async () => {
    const result = await submitContact(fields, async () => { throw new TypeError('fetch failed'); });
    assert.equal(result.ok, false);
    assert.match(result.error, /clay\.net@proton\.me/);
  });
});

describe('createContactSession', () => {
  const { startToken, ...visitorFields } = fields;
  const EMAIL_FALLBACK = 'Message could not be sent. Email clay.net@proton.me directly.';

  const settle = () => new Promise((resolve) => setImmediate(resolve));

  // A fake clock whose wait() advances time instead of sleeping.
  const clock = () => {
    const state = { time: 1_000, waits: [] };
    return {
      state,
      now: () => state.time,
      wait: async (ms) => { state.waits.push(ms); state.time += ms; },
    };
  };

  const server = (clk, { tokens = ['token-1'], post = () => new Response(JSON.stringify({ ok: true }), { status: 202 }) } = {}) => {
    const calls = [];
    const queue = [...tokens];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init, at: clk.now() });
      if (url === '/api/contact/start') {
        const token = queue.shift();
        if (token === undefined) throw new TypeError('fetch failed');
        return new Response(JSON.stringify({ token }), { status: 200 });
      }
      return post(url, init);
    };
    return { calls, fetchImpl };
  };

  it('sends the server-issued token with the submission', async () => {
    const clk = clock();
    const { calls, fetchImpl } = server(clk);
    const session = createContactSession({ fetchImpl, now: clk.now, wait: clk.wait });
    session.begin();
    assert.deepEqual(await session.submit(visitorFields), { ok: true });

    const post = calls.find((call) => call.url === '/api/contact');
    assert.deepEqual(JSON.parse(post.init.body), { ...visitorFields, startToken: 'token-1' });
  });

  it('waits until 3.5 s after the token arrived before posting', async () => {
    const clk = clock();
    const { calls, fetchImpl } = server(clk);
    const session = createContactSession({ fetchImpl, now: clk.now, wait: clk.wait });
    session.begin();
    await session.submit(visitorFields);
    assert.deepEqual(clk.state.waits, [3500]);
    assert.equal(calls.find((call) => call.url === '/api/contact').at, 1_000 + 3500);
  });

  it('waits only for the time still missing', async () => {
    const clk = clock();
    const { fetchImpl } = server(clk);
    const session = createContactSession({ fetchImpl, now: clk.now, wait: clk.wait });
    session.begin();
    await settle();
    clk.state.time += 3000;
    await session.submit(visitorFields);
    assert.deepEqual(clk.state.waits, [500]);
  });

  it('does not wait when the floor has already passed', async () => {
    const clk = clock();
    const { fetchImpl } = server(clk);
    const session = createContactSession({ fetchImpl, now: clk.now, wait: clk.wait });
    session.begin();
    await settle();
    clk.state.time += 10_000;
    await session.submit(visitorFields);
    assert.deepEqual(clk.state.waits, []);
  });

  it('retries a failed token fetch once at submit', async () => {
    const clk = clock();
    let starts = 0;
    const fetchImpl = async (url, init) => {
      if (url === '/api/contact/start') {
        starts += 1;
        if (starts === 1) throw new TypeError('fetch failed');
        return new Response(JSON.stringify({ token: 'late-token' }), { status: 200 });
      }
      assert.equal(JSON.parse(init.body).startToken, 'late-token');
      return new Response(JSON.stringify({ ok: true }), { status: 202 });
    };
    const session = createContactSession({ fetchImpl, now: clk.now, wait: clk.wait });
    session.begin();
    assert.deepEqual(await session.submit(visitorFields), { ok: true });
    assert.equal(starts, 2);
  });

  it('shows the email fallback when the token cannot be fetched, without posting', async () => {
    const clk = clock();
    const { calls, fetchImpl } = server(clk, { tokens: [] });
    const session = createContactSession({ fetchImpl, now: clk.now, wait: clk.wait });
    session.begin();
    assert.deepEqual(await session.submit(visitorFields), { ok: false, error: EMAIL_FALLBACK });
    assert.equal(calls.some((call) => call.url === '/api/contact'), false);
  });

  it('surfaces the API error text after a successful token', async () => {
    const clk = clock();
    const { fetchImpl } = server(clk, { post: () => new Response(JSON.stringify({ error: 'Too many messages. Try again later.' }), { status: 429 }) });
    const session = createContactSession({ fetchImpl, now: clk.now, wait: clk.wait });
    assert.deepEqual(await session.submit(visitorFields), { ok: false, error: 'Too many messages. Try again later.' });
  });

  it('reuses one token across repeated focus events', async () => {
    const clk = clock();
    const { calls, fetchImpl } = server(clk);
    const session = createContactSession({ fetchImpl, now: clk.now, wait: clk.wait });
    session.begin();
    session.begin();
    await session.submit(visitorFields);
    assert.equal(calls.filter((call) => call.url === '/api/contact/start').length, 1);
  });

  it('fetches a fresh token when the held one is older than an hour', async () => {
    const clk = clock();
    const { calls, fetchImpl } = server(clk, { tokens: ['stale-token', 'fresh-token'] });
    const session = createContactSession({ fetchImpl, now: clk.now, wait: clk.wait });
    session.begin();
    await settle();
    clk.state.time += 60 * 60 * 1000 + 1;
    await session.submit(visitorFields);

    assert.equal(calls.filter((call) => call.url === '/api/contact/start').length, 2);
    const post = calls.find((call) => call.url === '/api/contact');
    assert.equal(JSON.parse(post.init.body).startToken, 'fresh-token');
    assert.deepEqual(clk.state.waits, [3500]);
    assert.equal(post.at - calls.filter((call) => call.url === '/api/contact/start')[1].at, 3500);
  });

  it('keeps a token that is under an hour old', async () => {
    const clk = clock();
    const { calls, fetchImpl } = server(clk, { tokens: ['token-1', 'token-2'] });
    const session = createContactSession({ fetchImpl, now: clk.now, wait: clk.wait });
    session.begin();
    await settle();
    clk.state.time += 59 * 60 * 1000;
    await session.submit(visitorFields);
    assert.equal(calls.filter((call) => call.url === '/api/contact/start').length, 1);
  });

  it('treats a 200 without a string token as a failed fetch', async () => {
    const clk = clock();
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      return new Response(JSON.stringify(url === '/api/contact/start' ? { token: 42 } : { ok: true }), { status: 200 });
    };
    const session = createContactSession({ fetchImpl, now: clk.now, wait: clk.wait });
    session.begin();
    assert.deepEqual(await session.submit(visitorFields), { ok: false, error: EMAIL_FALLBACK });
    assert.equal(calls.filter((url) => url === '/api/contact/start').length, 2);
    assert.equal(calls.includes('/api/contact'), false);
  });

  it('recovers when the retry after a malformed token returns a good one', async () => {
    const clk = clock();
    const bodies = [{}, { token: 'good-token' }];
    const fetchImpl = async (url, init) => {
      if (url === '/api/contact/start') return new Response(JSON.stringify(bodies.shift()), { status: 200 });
      assert.equal(JSON.parse(init.body).startToken, 'good-token');
      return new Response(JSON.stringify({ ok: true }), { status: 202 });
    };
    const session = createContactSession({ fetchImpl, now: clk.now, wait: clk.wait });
    assert.deepEqual(await session.submit(visitorFields), { ok: true });
  });
});
