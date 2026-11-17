import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../src/app.js';

const MIGRATIONS_DIR = new URL('../db/migrations/', import.meta.url);

export async function createTestDb() {
  const pg = new PGlite();
  for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
    await pg.exec(readFileSync(new URL(file, MIGRATIONS_DIR), 'utf8'));
  }
  const run = (client) => async (text, params = []) => (await client.query(text, params)).rows;
  return {
    query: run(pg),
    transaction: (fn) => pg.transaction((tx) => fn(run(tx))),
    close: () => pg.close(),
  };
}

// Stands in for the Vercel Blob client: runs the route's token callback and records every call.
export function fakeBlob() {
  const blob = {
    uploads: [],
    deleted: [],
    failDeletes: false,
    async handleUpload(request, body, options) {
      const { pathname, clientPayload, multipart } = body.payload;
      const tokenOptions = await options.onBeforeGenerateToken(pathname, clientPayload, multipart);
      blob.uploads.push({ pathname, clientPayload, tokenOptions });
      return { type: body.type, clientToken: 'fake-client-token' };
    },
    async del(url) {
      blob.deleted.push(url);
      if (blob.failDeletes) throw new Error('Blob store unavailable');
    },
  };
  return blob;
}

// Stands in for the Resend client: records every message, or rejects when `failWith` is set.
export function fakeMailer() {
  const mailer = {
    sent: [],
    failWith: null,
    async send(message) {
      if (mailer.failWith) throw mailer.failWith;
      mailer.sent.push(message);
      return { id: `fake-${mailer.sent.length}` };
    },
  };
  return mailer;
}

// A contact form body a human would send: filled at `now - 10 s`, honeypot empty.
export const contactBody = (overrides = {}, now = new Date()) => ({
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  company: 'Analytical Engines',
  message: 'I would like to talk about a project.',
  website: '',
  startedAt: now.getTime() - 10_000,
  ...overrides,
});

export async function serve(app) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    async request(path, { method = 'GET', body, headers = {} } = {}) {
      const res = await fetch(origin + path, {
        method,
        headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
        body: typeof body === 'string' || body === undefined ? body : JSON.stringify(body),
      });
      const text = await res.text();
      return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

export async function testApp(overrides = {}) {
  const db = await createTestDb();
  const app = createApp({ db, env: {}, ...overrides });
  const server = await serve(app);
  return {
    db,
    origin: server.origin,
    request: server.request,
    close: async () => {
      await server.close();
      await db.close();
    },
  };
}
