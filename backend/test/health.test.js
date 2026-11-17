import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { HttpError, asyncRoute, errorHandler, notFound } from '../src/http.js';
import { serve, testApp } from './helpers.js';

describe('app foundation', () => {
  let app;
  before(async () => {
    app = await testApp();
  });
  after(() => app.close());

  it('answers the health check', async () => {
    const res = await app.request('/api/health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
  });

  it('does not advertise Express', async () => {
    const res = await app.request('/api/health');
    assert.equal(res.headers.get('x-powered-by'), null);
  });

  it('answers unknown routes with a JSON 404', async () => {
    const res = await app.request('/api/nope');
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'Not found' });
  });

  it('rejects malformed JSON with a 400', async () => {
    const res = await app.request('/api/health', { method: 'POST', body: '{bad', headers: { origin: app.origin } });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Invalid JSON' });
  });

  it('rejects oversized bodies with a 413', async () => {
    const res = await app.request('/api/health', {
      method: 'POST',
      body: { pad: 'x'.repeat(5 * 1024 * 1024) },
      headers: { origin: app.origin },
    });
    assert.equal(res.status, 413);
    assert.deepEqual(res.body, { error: 'Request body too large' });
  });
});

describe('error handling', () => {
  let server;
  let logged;
  const realError = console.error;

  before(async () => {
    const app = express();
    app.get('/api/boom', () => {
      throw new Error('secret connection string leaked');
    });
    app.get('/api/boom-async', asyncRoute(async () => {
      throw new Error('secret connection string leaked');
    }));
    app.get('/api/teapot', () => {
      throw new HttpError(418, 'Short and stout');
    });
    app.use(notFound);
    app.use(errorHandler);
    server = await serve(app);
  });
  after(() => server.close());

  it('hides the message of unexpected errors and logs it', async () => {
    logged = [];
    console.error = (...args) => logged.push(args);
    try {
      for (const path of ['/api/boom', '/api/boom-async']) {
        const res = await server.request(path);
        assert.equal(res.status, 500);
        assert.deepEqual(res.body, { error: 'Something went wrong' });
      }
    } finally {
      console.error = realError;
    }
    assert.equal(logged.length, 2);
  });

  it('passes HttpError status and message through', async () => {
    const res = await server.request('/api/teapot');
    assert.equal(res.status, 418);
    assert.deepEqual(res.body, { error: 'Short and stout' });
  });
});
