import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { issueSession } from '../src/auth/session.js';
import { certificatesRepository, cvRepository, projectsRepository } from '../src/content/repository.js';
import { fakeBlob, testApp } from './helpers.js';

const env = { SESSION_SECRET: randomBytes(32).toString('hex') };
const clock = () => new Date();
const BLOB = 'https://abc123.public.blob.vercel-storage.com';
const ORDER_ERROR = { error: 'Order must list every item exactly once' };
const NOT_FOUND = { error: 'Not found' };

describe('content API', () => {
  let app;
  let cookie;
  const tables = { projects: 'portfolio_projects', certificates: 'portfolio_certificates' };

  const send = (method, path, body, headers = {}) =>
    app.request(path, { method, body, headers: { origin: app.origin, ...headers } });
  const admin = (method, path, body) => send(method, path, body, { cookie });
  const orderOf = async (kind) =>
    (await admin('GET', `/api/admin/${kind}`)).body.map((row) => row.id);
  const seed = (kind, rows) =>
    Promise.all(rows.map(([title, order, published = true]) =>
      app.db.query(
        `insert into ${tables[kind]} (title, display_order, published) values ($1, $2, $3)`,
        [title, order, published],
      )));

  before(async () => {
    app = await testApp({ env, clock, blob: fakeBlob() });
    cookie = `clay_session=${await issueSession({ env, clock })}`;
  });
  after(() => app.close());
  beforeEach(async () => {
    await app.db.query('truncate portfolio_projects, portfolio_certificates, portfolio_cv restart identity');
  });

  describe('public reads', () => {
    it('lists published projects in display order with the public shape', async () => {
      await app.db.query(
        `insert into portfolio_projects (title, purpose, stack, link, image_url, display_order, published)
         values ('Second', 'p2', 's2', 'https://example.com', $1, 2, true),
                ('Hidden', '', '', null, null, 0, false),
                ('First', 'p1', 's1', null, null, 1, true)`,
        [`${BLOB}/a.png`],
      );
      const res = await app.request('/api/projects');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, [
        { id: 3, title: 'First', purpose: 'p1', stack: 's1', link: null, imageUrl: null },
        { id: 1, title: 'Second', purpose: 'p2', stack: 's2', link: 'https://example.com', imageUrl: `${BLOB}/a.png` },
      ]);
    });

    it('lists published certificates in display order with the public shape', async () => {
      await app.db.query(
        `insert into portfolio_certificates (title, issuer_meta, verify_url, image_url, display_order, published)
         values ('B', 'Issuer B', 'https://verify.example/b', null, 2, true),
                ('Hidden', '', null, null, 0, false),
                ('A', 'Issuer A', null, $1, 1, true)`,
        [`${BLOB}/c.png`],
      );
      const res = await app.request('/api/certificates');
      assert.deepEqual(res.body, [
        { id: 3, title: 'A', issuerMeta: 'Issuer A', verifyUrl: null, imageUrl: `${BLOB}/c.png` },
        { id: 1, title: 'B', issuerMeta: 'Issuer B', verifyUrl: 'https://verify.example/b', imageUrl: null },
      ]);
    });

    it('returns null for the CV until one is uploaded, then its public shape', async () => {
      assert.equal((await app.request('/api/cv')).body, null);
      await admin('PUT', '/api/admin/cv', { fileUrl: `${BLOB}/cv.pdf`, fileName: 'cv.pdf' });
      const res = await app.request('/api/cv');
      assert.deepEqual(Object.keys(res.body), ['fileUrl', 'fileName', 'uploadedAt']);
      assert.equal(res.body.fileUrl, `${BLOB}/cv.pdf`);
      assert.equal(res.body.fileName, 'cv.pdf');
      assert.ok(!Number.isNaN(Date.parse(res.body.uploadedAt)));
    });
  });

  describe('authentication', () => {
    const routes = [
      ['GET', '/api/admin/projects'],
      ['POST', '/api/admin/projects', { title: 'x' }],
      ['PUT', '/api/admin/projects/1', { title: 'x' }],
      ['DELETE', '/api/admin/projects/1'],
      ['PUT', '/api/admin/projects/order', { ids: [] }],
      ['GET', '/api/admin/certificates'],
      ['POST', '/api/admin/certificates', { title: 'x' }],
      ['PUT', '/api/admin/certificates/1', { title: 'x' }],
      ['DELETE', '/api/admin/certificates/1'],
      ['PUT', '/api/admin/certificates/order', { ids: [] }],
      ['PUT', '/api/admin/cv', { fileUrl: `${BLOB}/cv.pdf`, fileName: 'cv.pdf' }],
    ];

    it('rejects every admin route without a session', async () => {
      for (const [method, path, body] of routes) {
        const res = await send(method, path, body);
        assert.equal(res.status, 401, `${method} ${path}`);
      }
    });

    it('rejects a forged session cookie', async () => {
      const forged = await issueSession({ env: { SESSION_SECRET: 'x'.repeat(32) }, clock });
      const res = await send('GET', '/api/admin/projects', undefined, { cookie: `clay_session=${forged}` });
      assert.equal(res.status, 401);
    });

    it('still enforces the origin guard on writes', async () => {
      const res = await app.request('/api/admin/projects', { method: 'POST', body: { title: 'x' }, headers: { cookie } });
      assert.equal(res.status, 403);
    });
  });

  for (const kind of ['projects', 'certificates']) {
    describe(`admin ${kind}`, () => {
      const valid = kind === 'projects'
        ? { title: 'Site', purpose: 'Does things', stack: 'Node', link: 'https://example.com', imageUrl: `${BLOB}/i.png`, published: true }
        : { title: 'Cert', issuerMeta: 'Issuer, 2026', verifyUrl: 'https://verify.example/1', imageUrl: `${BLOB}/i.png`, published: true };
      const linkField = kind === 'projects' ? 'link' : 'verifyUrl';
      const base = `/api/admin/${kind}`;

      it('lists everything including unpublished, with published and displayOrder', async () => {
        await seed(kind, [['Shown', 1], ['Hidden', 2, false]]);
        const res = await admin('GET', base);
        assert.equal(res.status, 200);
        assert.deepEqual(res.body.map((r) => [r.title, r.published, r.displayOrder]), [
          ['Shown', true, 1],
          ['Hidden', false, 2],
        ]);
      });

      it('creates a row at the end of the order and returns it', async () => {
        await seed(kind, [['Existing', 7]]);
        const res = await admin('POST', base, valid);
        assert.equal(res.status, 201);
        assert.deepEqual(res.body, { id: 2, ...valid, displayOrder: 8 });
        assert.deepEqual((await admin('GET', base)).body.map((r) => r.id), [1, 2]);
      });

      it('creates the first row with display order 1 and applies defaults', async () => {
        const res = await admin('POST', base, { title: 'Bare' });
        assert.equal(res.status, 201);
        assert.equal(res.body.displayOrder, 1);
        assert.equal(res.body.published, true);
        assert.equal(res.body[linkField], null);
        assert.equal(res.body.imageUrl, null);
      });

      it('stores hostile text verbatim through parameters', async () => {
        const title = `x'); drop table ${tables[kind]}; --`;
        assert.equal((await admin('POST', base, { ...valid, title })).status, 201);
        assert.equal((await admin('GET', base)).body[0].title, title);
      });

      it('rejects non-https and script URLs', async () => {
        for (const url of ['javascript:alert(1)', 'http://example.com', 'data:text/html,hi', '//example.com', 'not a url', 'https://user:pw@example.com']) {
          const res = await admin('POST', base, { ...valid, [linkField]: url });
          assert.equal(res.status, 400, url);
        }
        assert.deepEqual(await orderOf(kind), []);
      });

      it('rejects image URLs outside the Blob store host', async () => {
        const bad = [
          'https://evil.example/i.png',
          'https://public.blob.vercel-storage.com/i.png',
          'https://abc.public.blob.vercel-storage.com.evil.example/i.png',
          'https://evil.example/x@abc.public.blob.vercel-storage.com',
          'http://abc.public.blob.vercel-storage.com/i.png',
        ];
        for (const imageUrl of bad) {
          assert.equal((await admin('POST', base, { ...valid, imageUrl })).status, 400, imageUrl);
        }
      });

      it('answers validation failures with a short message and no schema internals', async () => {
        const res = await admin('POST', base, { ...valid, title: '' });
        assert.equal(res.status, 400);
        assert.deepEqual(Object.keys(res.body), ['error']);
        assert.equal(typeof res.body.error, 'string');
        assert.ok(res.body.error.length < 100);
        assert.doesNotMatch(res.body.error, /zod|\[|\{|invalid_/i);
      });

      it('enforces text limits', async () => {
        const tooLong = kind === 'projects'
          ? [{ title: 'a'.repeat(121) }, { purpose: 'a'.repeat(301) }, { stack: 'a'.repeat(161) }]
          : [{ title: 'a'.repeat(121) }, { issuerMeta: 'a'.repeat(121) }];
        for (const patch of tooLong) {
          assert.equal((await admin('POST', base, { ...valid, ...patch })).status, 400, Object.keys(patch)[0]);
        }
        const edge = kind === 'projects'
          ? { title: 'a'.repeat(120), purpose: 'a'.repeat(300), stack: 'a'.repeat(160) }
          : { title: 'a'.repeat(120), issuerMeta: 'a'.repeat(120) };
        assert.equal((await admin('POST', base, { ...valid, ...edge })).status, 201);
      });

      it('rejects bodies that are not objects or have wrong types', async () => {
        for (const body of [null, [], 'text', { title: 5 }, { ...valid, published: 'yes' }, {}]) {
          assert.equal((await admin('POST', base, body)).status, 400, JSON.stringify(body));
        }
      });

      it('updates a row in place', async () => {
        await seed(kind, [['Old', 3]]);
        const res = await admin('PUT', `${base}/1`, { ...valid, title: 'New', published: false });
        assert.equal(res.status, 200);
        assert.deepEqual(res.body, { id: 1, ...valid, title: 'New', published: false, displayOrder: 3 });
        assert.equal((await app.request(`/api/${kind}`)).body.length, 0);
      });

      it('returns 404 when updating or deleting an unknown or malformed id', async () => {
        for (const id of ['999', 'abc', '0', '-1', '1.5', '99999999999']) {
          assert.deepEqual((await admin('PUT', `${base}/${id}`, valid)).body, NOT_FOUND, `PUT ${id}`);
          assert.deepEqual((await admin('DELETE', `${base}/${id}`)).body, NOT_FOUND, `DELETE ${id}`);
        }
      });

      it('validates the body before touching the row', async () => {
        await seed(kind, [['Keep', 1]]);
        const res = await admin('PUT', `${base}/1`, { ...valid, [linkField]: 'javascript:alert(1)' });
        assert.equal(res.status, 400);
        assert.equal((await admin('GET', base)).body[0].title, 'Keep');
      });

      it('deletes with 204 and no body', async () => {
        await seed(kind, [['Gone', 1]]);
        const res = await admin('DELETE', `${base}/1`);
        assert.equal(res.status, 204);
        assert.equal(res.body, null);
        assert.deepEqual(await orderOf(kind), []);
      });

      describe('reorder', () => {
        beforeEach(() => seed(kind, [['One', 1], ['Two', 2], ['Three', 3]]));

        it('applies the given order', async () => {
          const res = await admin('PUT', `${base}/order`, { ids: [3, 1, 2] });
          assert.equal(res.status, 204);
          assert.deepEqual(await orderOf(kind), [3, 1, 2]);
          assert.deepEqual((await app.request(`/api/${kind}`)).body.map((r) => r.id), [3, 1, 2]);
        });

        it('swaps two rows', async () => {
          await app.db.query(`delete from ${tables[kind]} where id = 3`);
          await admin('PUT', `${base}/order`, { ids: [2, 1] });
          assert.deepEqual(await orderOf(kind), [2, 1]);
        });

        it('rejects non-integer ids without touching the database', async () => {
          for (const ids of [['1; drop table x', 2, 3], [1.5, 2, 3], [0, 2, 3], [null, 2, 3], 'nope', undefined]) {
            assert.equal((await admin('PUT', `${base}/order`, { ids })).status, 400, JSON.stringify(ids));
          }
          assert.deepEqual(await orderOf(kind), [1, 2, 3]);
        });

        it('rejects duplicate, unknown and missing ids and leaves the order unchanged', async () => {
          for (const ids of [[1, 1, 2], [1, 2, 99], [1, 2], [1, 2, 3, 3], [1, 2, 3, 4], []]) {
            const res = await admin('PUT', `${base}/order`, { ids });
            assert.equal(res.status, 400, JSON.stringify(ids));
            assert.deepEqual(res.body, ORDER_ERROR);
          }
          assert.deepEqual(await orderOf(kind), [1, 2, 3]);
        });
      });
    });
  }

  describe('admin CV', () => {
    const cv = { fileUrl: `${BLOB}/cv.pdf`, fileName: 'Clay CV.pdf' };

    it('stores and replaces the single CV', async () => {
      const first = await admin('PUT', '/api/admin/cv', cv);
      assert.equal(first.status, 200);
      assert.deepEqual(Object.keys(first.body), ['fileUrl', 'fileName', 'uploadedAt']);
      const second = await admin('PUT', '/api/admin/cv', { fileUrl: `${BLOB}/cv2.pdf`, fileName: 'cv2.pdf' });
      assert.equal(second.body.fileUrl, `${BLOB}/cv2.pdf`);
      assert.equal((await app.db.query('select count(*)::int as n from portfolio_cv'))[0].n, 1);
    });

    it('validates the file URL and name', async () => {
      for (const body of [
        { ...cv, fileUrl: null },
        { ...cv, fileUrl: 'https://evil.example/cv.pdf' },
        { ...cv, fileName: '' },
        { ...cv, fileName: 'a'.repeat(256) },
        {},
      ]) {
        assert.equal((await admin('PUT', '/api/admin/cv', body)).status, 400, JSON.stringify(body));
      }
      assert.equal((await app.request('/api/cv')).body, null);
    });
  });

  describe('repository results for Blob cleanup', () => {
    it('returns the removed project and certificate image URLs, or null when absent', async () => {
      await app.db.query(
        `insert into portfolio_projects (title, image_url, display_order) values ('P', $1, 1)`,
        [`${BLOB}/p.png`],
      );
      await app.db.query(
        `insert into portfolio_certificates (title, image_url, display_order) values ('C', $1, 1)`,
        [`${BLOB}/c.png`],
      );
      assert.equal((await projectsRepository(app.db).remove(1)).imageUrl, `${BLOB}/p.png`);
      assert.equal((await certificatesRepository(app.db).remove(1)).imageUrl, `${BLOB}/c.png`);
      assert.equal(await projectsRepository(app.db).remove(1), null);
      assert.equal(await certificatesRepository(app.db).remove(1), null);
    });

    it('returns the previous CV file URL on replacement, or null for the first upload', async () => {
      const repo = cvRepository(app.db);
      const first = await repo.replace({ fileUrl: `${BLOB}/a.pdf`, fileName: 'a.pdf' });
      assert.equal(first.previousFileUrl, null);
      const second = await repo.replace({ fileUrl: `${BLOB}/b.pdf`, fileName: 'b.pdf' });
      assert.equal(second.previousFileUrl, `${BLOB}/a.pdf`);
      assert.equal(second.cv.fileUrl, `${BLOB}/b.pdf`);
    });
  });
});
