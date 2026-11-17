import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { submitContact } from '../src/contact.js';

const fields = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  company: '',
  message: 'I would like to talk about a project.',
  website: '',
  startedAt: 1_700_000_000_000,
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
