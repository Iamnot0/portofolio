import { after, afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { getPayloadFromClientToken } from '@vercel/blob/client';
import { createVercelBlob } from '../src/blob.js';
import { issueSession } from '../src/auth/session.js';
import { fakeBlob, testApp } from './helpers.js';

const env = { SESSION_SECRET: randomBytes(32).toString('hex') };
const clock = () => new Date();
const BLOB = 'https://abc123.public.blob.vercel-storage.com';
const FOUR_MB = 4 * 1024 * 1024;
const GENERATE = 'blob.generate-client-token';

const tokenRequest = (pathname, clientPayload, extra = {}) => ({
  type: GENERATE,
  payload: { pathname, clientPayload, multipart: false, ...extra },
});

describe('Blob client uploads', () => {
  let app;
  let blob;
  let cookie;

  const send = (method, path, body, headers = {}) =>
    app.request(path, { method, body, headers: { origin: app.origin, ...headers } });
  const admin = (method, path, body) => send(method, path, body, { cookie });
  const requestToken = (body) => admin('POST', '/api/uploads', body);

  before(async () => {
    blob = fakeBlob();
    app = await testApp({ env, clock, blob });
    cookie = `clay_session=${await issueSession({ env, clock })}`;
  });
  after(() => app.close());
  beforeEach(async () => {
    blob.uploads.length = 0;
    blob.deleted.length = 0;
    blob.failDeletes = false;
    await app.db.query('truncate portfolio_projects, portfolio_certificates, portfolio_cv restart identity');
  });

  describe('POST /api/uploads', () => {
    it('rejects a request without a session', async () => {
      const res = await send('POST', '/api/uploads', tokenRequest('projects/a.png', 'image'));
      assert.equal(res.status, 401);
      assert.equal(blob.uploads.length, 0);
    });

    it('rejects a forged session cookie', async () => {
      const forged = await issueSession({ env: { SESSION_SECRET: 'x'.repeat(32) }, clock });
      const res = await send('POST', '/api/uploads', tokenRequest('projects/a.png', 'image'), {
        cookie: `clay_session=${forged}`,
      });
      assert.equal(res.status, 401);
    });

    it('still enforces the origin guard', async () => {
      const res = await app.request('/api/uploads', {
        method: 'POST',
        body: tokenRequest('projects/a.png', 'image'),
        headers: { cookie },
      });
      assert.equal(res.status, 403);
    });

    for (const pathname of ['projects/a.png', 'certificates/b.webp']) {
      it(`issues an image token for ${pathname}: png, jpeg and webp only, 4 MB, random suffix`, async () => {
        const res = await requestToken(tokenRequest(pathname, 'image'));
        assert.equal(res.status, 200);
        assert.deepEqual(res.body, { type: GENERATE, clientToken: 'fake-client-token' });
        assert.deepEqual(blob.uploads, [{
          pathname,
          clientPayload: 'image',
          tokenOptions: {
            allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp'],
            maximumSizeInBytes: FOUR_MB,
            addRandomSuffix: true,
          },
        }]);
      });
    }

    it('issues a CV token: pdf only, 4 MB, random suffix', async () => {
      const res = await requestToken(tokenRequest('cv/clay.pdf', 'cv'));
      assert.equal(res.status, 200);
      assert.deepEqual(blob.uploads[0].tokenOptions, {
        allowedContentTypes: ['application/pdf'],
        maximumSizeInBytes: FOUR_MB,
        addRandomSuffix: true,
      });
    });

    it('accepts multipart requests for an allowed pathname', async () => {
      const res = await requestToken(tokenRequest('cv/clay.pdf', 'cv', { multipart: true }));
      assert.equal(res.status, 200);
    });

    it('rejects a missing or unknown client payload', async () => {
      for (const clientPayload of [null, '', 'video', 'IMAGE', 'constructor', '__proto__', 'toString']) {
        const res = await requestToken(tokenRequest('projects/a.png', clientPayload));
        assert.equal(res.status, 400, String(clientPayload));
      }
      assert.equal(blob.uploads.length, 0);
    });

    it('rejects a pathname outside the prefixes allowed for the payload', async () => {
      const cases = [
        ['image', 'cv/a.png'],
        ['image', 'other/a.png'],
        ['image', 'Projects/a.png'],
        ['image', '/projects/a.png'],
        ['image', 'a.png'],
        ['image', 'projects/'],
        ['image', 'projectsx/a.png'],
        ['cv', 'projects/a.pdf'],
        ['cv', 'certificates/a.pdf'],
        ['cv', 'cv'],
        ['cv', 'cv/'],
      ];
      for (const [clientPayload, pathname] of cases) {
        const res = await requestToken(tokenRequest(pathname, clientPayload));
        assert.equal(res.status, 400, `${clientPayload} ${pathname}`);
      }
      assert.equal(blob.uploads.length, 0);
    });

    it('handles only the token-generation event', async () => {
      const completed = {
        type: 'blob.upload-completed',
        payload: { blob: { url: `${BLOB}/projects/a.png` }, tokenPayload: 'image' },
      };
      for (const body of [completed, { ...tokenRequest('projects/a.png', 'image'), type: 'blob.generate-presigned-url' }]) {
        assert.equal((await requestToken(body)).status, 400, body.type);
      }
      assert.equal(blob.uploads.length, 0);
    });

    it('rejects malformed bodies without calling the client library', async () => {
      const bodies = [
        null,
        [],
        'text',
        {},
        { type: GENERATE },
        { type: GENERATE, payload: null },
        { type: GENERATE, payload: { pathname: 5, clientPayload: 'image', multipart: false } },
        { type: GENERATE, payload: { pathname: 'projects/a.png', clientPayload: 'image' } },
        { type: GENERATE, payload: { pathname: 'projects/a.png', clientPayload: 'image', multipart: 'yes' } },
        { type: GENERATE, payload: { pathname: 'projects/a.png', clientPayload: 5, multipart: false } },
      ];
      for (const body of bodies) {
        assert.equal((await requestToken(body)).status, 400, JSON.stringify(body));
      }
      assert.equal(blob.uploads.length, 0);
    });

    it('answers a rejection with a short message and no internals', async () => {
      const res = await requestToken(tokenRequest('other/a.png', 'image'));
      assert.deepEqual(Object.keys(res.body), ['error']);
      assert.ok(res.body.error.length < 100);
    });
  });

  describe('with the real Vercel Blob client', () => {
    let real;
    let realApp;

    before(async () => {
      real = createVercelBlob('vercel_blob_rw_abc123_secret');
      realApp = await testApp({ env, clock, blob: real });
    });
    after(() => realApp.close());

    it('signs a client token that carries the constraints', async () => {
      const res = await realApp.request('/api/uploads', {
        method: 'POST',
        body: tokenRequest('projects/a.png', 'image'),
        headers: { origin: realApp.origin, cookie },
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.type, GENERATE);
      const claims = getPayloadFromClientToken(res.body.clientToken);
      assert.equal(claims.pathname, 'projects/a.png');
      assert.deepEqual(claims.allowedContentTypes, ['image/png', 'image/jpeg', 'image/webp']);
      assert.equal(claims.maximumSizeInBytes, FOUR_MB);
      assert.equal(claims.addRandomSuffix, true);
      assert.equal(claims.onUploadCompleted, undefined);
    });
  });

  describe('Blob cleanup', () => {
    const tables = { projects: 'portfolio_projects', certificates: 'portfolio_certificates' };
    const oldUrl = `${BLOB}/old.png`;
    const newUrl = `${BLOB}/new.png`;
    let logged;

    beforeEach(() => {
      logged = mock.method(console, 'error', () => {});
    });
    afterEach(() => logged.mock.restore());

    for (const kind of ['projects', 'certificates']) {
      describe(kind, () => {
        const base = `/api/admin/${kind}`;
        const valid = kind === 'projects'
          ? { title: 'Site', purpose: 'Does things', stack: 'Node', link: 'https://example.com', imageUrl: newUrl, published: true }
          : { title: 'Cert', issuerMeta: 'Issuer', verifyUrl: 'https://verify.example/1', imageUrl: newUrl, published: true };
        const seed = (imageUrl) =>
          app.db.query(
            `insert into ${tables[kind]} (title, image_url, display_order) values ('Seeded', $1, 1)`,
            [imageUrl],
          );
        const titleInDb = async () => (await app.db.query(`select title from ${tables[kind]}`))[0]?.title;

        it('deletes the image Blob when the row is deleted', async () => {
          await seed(oldUrl);
          assert.equal((await admin('DELETE', `${base}/1`)).status, 204);
          assert.deepEqual(blob.deleted, [oldUrl]);
        });

        it('deletes nothing when a deleted row had no image', async () => {
          await seed(null);
          assert.equal((await admin('DELETE', `${base}/1`)).status, 204);
          assert.deepEqual(blob.deleted, []);
        });

        it('deletes nothing when the row to delete does not exist', async () => {
          assert.equal((await admin('DELETE', `${base}/1`)).status, 404);
          assert.deepEqual(blob.deleted, []);
        });

        it('deletes the old Blob when an update replaces the image', async () => {
          await seed(oldUrl);
          const res = await admin('PUT', `${base}/1`, valid);
          assert.equal(res.status, 200);
          assert.equal(res.body.imageUrl, newUrl);
          assert.deepEqual(blob.deleted, [oldUrl]);
        });

        it('deletes the old Blob when an update clears the image', async () => {
          await seed(oldUrl);
          const res = await admin('PUT', `${base}/1`, { ...valid, imageUrl: null });
          assert.equal(res.status, 200);
          assert.equal(res.body.imageUrl, null);
          assert.deepEqual(blob.deleted, [oldUrl]);
        });

        it('keeps the Blob when an update leaves the image unchanged', async () => {
          await seed(oldUrl);
          const res = await admin('PUT', `${base}/1`, { ...valid, title: 'Renamed', imageUrl: oldUrl });
          assert.equal(res.status, 200);
          assert.deepEqual(blob.deleted, []);
        });

        it('deletes nothing when an update adds a first image', async () => {
          await seed(null);
          assert.equal((await admin('PUT', `${base}/1`, valid)).status, 200);
          assert.deepEqual(blob.deleted, []);
        });

        it('does not touch the row or the Blob when an update misses any field', async () => {
          await seed(oldUrl);
          for (const field of Object.keys(valid)) {
            const { [field]: omitted, ...partial } = valid;
            const res = await admin('PUT', `${base}/1`, partial);
            assert.equal(res.status, 400, `missing ${field}`);
          }
          assert.equal(await titleInDb(), 'Seeded');
          assert.deepEqual(blob.deleted, []);
        });

        it('still applies defaults on create', async () => {
          const res = await admin('POST', base, { title: 'Bare' });
          assert.equal(res.status, 201);
          assert.equal(res.body.published, true);
          assert.equal(res.body.imageUrl, null);
        });

        it('succeeds and logs when the Blob delete fails after a delete', async () => {
          await seed(oldUrl);
          blob.failDeletes = true;
          assert.equal((await admin('DELETE', `${base}/1`)).status, 204);
          assert.equal(await titleInDb(), undefined);
          assert.equal(logged.mock.callCount(), 1);
        });

        it('succeeds and logs when the Blob delete fails after an update', async () => {
          await seed(oldUrl);
          blob.failDeletes = true;
          const res = await admin('PUT', `${base}/1`, valid);
          assert.equal(res.status, 200);
          assert.equal(res.body.imageUrl, newUrl);
          assert.equal(logged.mock.callCount(), 1);
        });
      });
    }

    describe('CV', () => {
      const put = (fileUrl) => admin('PUT', '/api/admin/cv', { fileUrl, fileName: 'cv.pdf' });

      it('deletes nothing for the first CV', async () => {
        assert.equal((await put(`${BLOB}/a.pdf`)).status, 200);
        assert.deepEqual(blob.deleted, []);
      });

      it('deletes the previous CV Blob when the file changes', async () => {
        await put(`${BLOB}/a.pdf`);
        const res = await put(`${BLOB}/b.pdf`);
        assert.equal(res.status, 200);
        assert.equal(res.body.fileUrl, `${BLOB}/b.pdf`);
        assert.deepEqual(blob.deleted, [`${BLOB}/a.pdf`]);
      });

      it('keeps the Blob when the same file is saved again', async () => {
        await put(`${BLOB}/a.pdf`);
        assert.equal((await put(`${BLOB}/a.pdf`)).status, 200);
        assert.deepEqual(blob.deleted, []);
      });

      it('succeeds and logs when the Blob delete fails', async () => {
        await put(`${BLOB}/a.pdf`);
        blob.failDeletes = true;
        const res = await put(`${BLOB}/b.pdf`);
        assert.equal(res.status, 200);
        assert.equal(res.body.fileUrl, `${BLOB}/b.pdf`);
        assert.equal(logged.mock.callCount(), 1);
      });
    });
  });
});
