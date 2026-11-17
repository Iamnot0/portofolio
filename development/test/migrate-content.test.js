import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrate } from '../scripts/lib/migrate.js';
import { applyPlan, buildPlan, describePlan, parseArgs } from '../scripts/lib/migrate-content.js';
import { PUBLIC_DIR } from '../scripts/seed-content.js';
import { IMAGE_BYTES, LEGACY_SCHEMA, createTestDb, dataUrl, fakeBlob } from './helpers.js';

const BLOB = 'https://store.public.blob.vercel-storage.com/';
const RETIRED = [
  'SLOW BAR',
  '  sein lin electronic center ',
  'MR ROBOT COMPUTER SERVICE',
  'ZENITHLOVESDAISY',
  'Tattoo House',
  'PARADOX POS',
  'AI POWERED CONTENT CREATOR',
];

async function seedLegacy(db) {
  await db.query(LEGACY_SCHEMA);
  for (const [index, title] of RETIRED.entries()) {
    await db.query('insert into projects (title, description, display_order) values ($1, $2, $3)', [title, 'retired', index + 10]);
  }
  const addProject = (title, description, link, image, order) =>
    db.query('insert into projects (title, description, link, image, display_order) values ($1, $2, $3, $4, $5)', [
      title, description, link, image, order,
    ]);
  await addProject(
    'Pae Ka Yauk',
    JSON.stringify({ purpose: ' Local food discovery ', techStack: 'React,   Node\n Express' }),
    'https://paekayauk.example/',
    dataUrl('application/octet-stream', IMAGE_BYTES.jpeg),
    5,
  );
  await addProject('Plain Text', 'A plain description.', 'http://insecure.example/', null, 2);
  await addProject('Placeholder', JSON.stringify({ purpose: 'SaaS 12', techStack: '' }), null, '', 3);
  await addProject('SLOW BAR 2', JSON.stringify({ purpose: 'Not retired' }), 'https://lookalike.example/', null, 4);

  const addCert = (title, image, order) =>
    db.query('insert into certificates (title, image, is_pdf, display_order) values ($1, $2, $3, $4)', [
      title, image, image?.startsWith('data:application/pdf') ?? false, order,
    ]);
  await addCert('Old Cert B', dataUrl('application/octet-stream', IMAGE_BYTES.png), 2);
  await addCert('Old Cert A', dataUrl('image/jpeg', IMAGE_BYTES.webp), 1);
  await addCert('Old PDF Cert', dataUrl('application/pdf', IMAGE_BYTES.pdf), 3);

  await db.query('insert into cv_files (file_name, file_data, file_type, uploaded_at) values ($1, $2, $3, $4)', [
    'old-cv.pdf', dataUrl('application/pdf', Buffer.from('%PDF-old')), 'application/pdf', '2024-01-01T00:00:00Z',
  ]);
  await db.query('insert into cv_files (file_name, file_data, file_type, uploaded_at) values ($1, $2, $3, $4)', [
    'Aung Kaung Khant CV.pdf', dataUrl('application/pdf', IMAGE_BYTES.pdf), 'application/pdf', '2026-05-01T00:00:00Z',
  ]);
}

const count = async (db, table) => (await db.query(`select count(*)::int as n from ${table}`))[0].n;

describe('parseArgs', () => {
  it('accepts exactly one mode and an optional --drop-old with --apply', () => {
    assert.deepEqual(parseArgs(['--dry-run']), { apply: false, dropOld: false });
    assert.deepEqual(parseArgs(['--apply']), { apply: true, dropOld: false });
    assert.deepEqual(parseArgs(['--apply', '--drop-old']), { apply: true, dropOld: true });
  });

  it('rejects missing, conflicting and unknown flags', () => {
    assert.throws(() => parseArgs([]), /--dry-run or --apply/);
    assert.throws(() => parseArgs(['--dry-run', '--apply']), /--dry-run or --apply/);
    assert.throws(() => parseArgs(['--dry-run', '--drop-old']), /--drop-old requires --apply/);
    assert.throws(() => parseArgs(['--apply', '--wat']), /--wat/);
  });
});

describe('content move', () => {
  let db;
  let put;
  beforeEach(async () => {
    db = createTestDb();
    put = fakeBlob();
    await migrate(db);
    await seedLegacy(db);
  });
  afterEach(() => db.close());

  describe('dry run', () => {
    it('describes the plan and changes nothing', async () => {
      const before = { projects: await count(db, 'projects'), certificates: await count(db, 'certificates') };
      const plan = await buildPlan(db);
      const text = describePlan(plan, { dropOld: false });

      assert.match(text, /projects: insert 8/);
      assert.match(text, /certificates: insert 6/);
      assert.match(text, /cv: Aung Kaung Khant CV\.pdf/);
      assert.match(text, /delete 7 retired/);
      assert.match(text, /SLOW BAR/);
      assert.match(text, /Old PDF Cert: image is not a JPEG, PNG, WebP or GIF/);

      assert.equal(put.puts.length, 0);
      assert.equal(await count(db, 'projects'), before.projects);
      assert.equal(await count(db, 'certificates'), before.certificates);
      for (const table of ['portfolio_projects', 'portfolio_certificates', 'portfolio_cv']) {
        assert.equal(await count(db, table), 0);
      }
    });
  });

  describe('apply', () => {
    it('inserts the featured projects first, then the kept old ones in their old order', async () => {
      await applyPlan(db, put, await buildPlan(db));
      const rows = await db.query(
        'select title, purpose, stack, link, image_url, display_order, published from portfolio_projects order by display_order',
      );

      assert.deepEqual(
        rows.map((row) => [row.display_order, row.title, row.purpose, row.stack, row.link]),
        [
          [1, 'MR ROBOT · Optimus Technica', 'Managed IT, business automation and custom software in Myanmar.', '', 'https://optimustechnica.com/'],
          [
            2,
            'Leyar Shift',
            'NASA Space Apps Challenge 2026. Compares crop rotations for a field by water, income and weather risk, using NASA Earth data.',
            '',
            'https://leyarshift.earth/',
          ],
          [
            3,
            'Knowledge Center',
            'Optimus Technica’s learning library: guides, technical references and field notes from the team.',
            '',
            'https://knowledgecenter.optimustechnica.com/',
          ],
          [4, 'PARADOX', 'Online store for PARADOX, a streetwear brand born in Burma in 2020.', '', 'https://burmesedox.com/'],
          [5, 'Plain Text', 'A plain description.', '', null],
          [6, 'Placeholder', '', '', null],
          [7, 'SLOW BAR 2', 'Not retired', '', 'https://lookalike.example/'],
          [8, 'Pae Ka Yauk', 'Local food discovery', 'React, Node Express', 'https://paekayauk.example/'],
        ],
      );
      assert.ok(rows.every((row) => row.published));
      assert.deepEqual(
        rows.slice(0, 4).map((row) => row.image_url),
        [
          `${BLOB}projects/mr-robot-optimus-technica.webp`,
          `${BLOB}projects/leyar-shift.webp`,
          `${BLOB}projects/knowledge-center.webp`,
          `${BLOB}projects/paradox.webp`,
        ],
      );
      assert.deepEqual(
        rows.slice(4).map((row) => row.image_url),
        [null, null, null, `${BLOB}projects/pae-ka-yauk.jpg`],
      );
    });

    it('inserts the local certificates first, then the old ones in their old order', async () => {
      await applyPlan(db, put, await buildPlan(db));
      const rows = await db.query(
        'select title, issuer_meta, verify_url, image_url, display_order from portfolio_certificates order by display_order',
      );
      assert.deepEqual(
        rows.map((row) => [row.display_order, row.title, row.issuer_meta, row.verify_url, row.image_url]),
        [
          [1, 'NASA Space Apps Challenge 2026: Galactic Problem Solver', 'NASA · Nov 2026', null, `${BLOB}certificates/nasa-space-apps-challenge-2026-galactic-problem-solver.webp`],
          [
            2,
            'Certified LLM Security Expert (CLLMSE)',
            'Red Team Leaders · Jul 2026',
            'https://courses.redteamleaders.com/exam-completion/353ec986ea299586',
            `${BLOB}certificates/certified-llm-security-expert-cllmse.webp`,
          ],
          [
            3,
            'Certified LLM Security Professional (CLLMSP)',
            'Red Team Leaders · Jun 2026',
            'https://courses.redteamleaders.com/exam-completion/60e9e4410d07bbc5',
            `${BLOB}certificates/certified-llm-security-professional-cllmsp.webp`,
          ],
          [4, 'Old Cert A', '', null, `${BLOB}certificates/old-cert-a.webp`],
          [5, 'Old Cert B', '', null, `${BLOB}certificates/old-cert-b.png`],
          [6, 'Old PDF Cert', '', null, null],
        ],
      );
    });

    it('uploads public, randomly suffixed files with the sniffed content type', async () => {
      await applyPlan(db, put, await buildPlan(db));
      const byPath = Object.fromEntries(put.puts.map((call) => [call.pathname, call]));

      assert.equal(put.puts.length, 4 + 3 + 1 + 2 + 1);
      for (const call of put.puts) {
        assert.equal(call.options.access, 'public');
        assert.equal(call.options.addRandomSuffix, true);
        assert.ok(Buffer.isBuffer(call.data));
      }
      assert.equal(byPath['projects/pae-ka-yauk.jpg'].options.contentType, 'image/jpeg');
      assert.deepEqual(byPath['projects/pae-ka-yauk.jpg'].data, IMAGE_BYTES.jpeg);
      assert.equal(byPath['certificates/old-cert-b.png'].options.contentType, 'image/png');
      assert.equal(byPath['certificates/old-cert-a.webp'].options.contentType, 'image/webp');
      assert.equal(byPath['projects/paradox.webp'].options.contentType, 'image/webp');
      assert.deepEqual(byPath['projects/paradox.webp'].data, readFileSync(new URL('work/paradox.webp', PUBLIC_DIR)));
      assert.equal(byPath['cv/aung-kaung-khant-cv.pdf'].options.contentType, 'application/pdf');
      assert.deepEqual(byPath['cv/aung-kaung-khant-cv.pdf'].data, IMAGE_BYTES.pdf);
      assert.ok(!put.puts.some((call) => call.pathname.includes('pdf-cert')));
    });

    it('migrates the newest CV', async () => {
      await applyPlan(db, put, await buildPlan(db));
      const rows = await db.query('select id, file_url, file_name, uploaded_at from portfolio_cv');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].id, 1);
      assert.equal(rows[0].file_name, 'Aung Kaung Khant CV.pdf');
      assert.equal(rows[0].file_url, `${BLOB}cv/aung-kaung-khant-cv.pdf`);
      assert.equal(new Date(rows[0].uploaded_at).toISOString(), '2026-05-01T00:00:00.000Z');
    });

    it('deletes exactly the seven retired projects and keeps the old tables by default', async () => {
      const summary = await applyPlan(db, put, await buildPlan(db));
      const remaining = await db.query('select title from projects order by display_order');

      assert.deepEqual(remaining.map((row) => row.title), ['Plain Text', 'Placeholder', 'SLOW BAR 2', 'Pae Ka Yauk']);
      assert.equal(await count(db, 'certificates'), 3);
      assert.equal(await count(db, 'cv_files'), 2);
      assert.deepEqual(summary, {
        projects: 8,
        certificates: 6,
        cv: 1,
        uploads: put.puts.length,
        retiredDeleted: 7,
        droppedOld: false,
      });
    });

    it('drops the three old tables only with dropOld', async () => {
      const summary = await applyPlan(db, put, await buildPlan(db), { dropOld: true });
      const names = (await db.query(`select table_name from information_schema.tables where table_schema = 'public'`)).map(
        (row) => row.table_name,
      );
      for (const old of ['projects', 'certificates', 'cv_files']) assert.ok(!names.includes(old), `${old} should be dropped`);
      assert.ok(names.includes('portfolio_projects'));
      assert.equal(summary.droppedOld, true);
      assert.equal(await count(db, 'portfolio_projects'), 8);
    });

    it('refuses when a content table already has rows, before uploading anything', async () => {
      await applyPlan(db, put, await buildPlan(db));
      const uploads = put.puts.length;

      await assert.rejects(buildPlan(db), /already has rows/);
      assert.equal(put.puts.length, uploads);
    });

    it('refuses on a populated CV table alone, and re-checks at write time', async () => {
      const plan = await buildPlan(db);
      await db.query(`insert into portfolio_cv (id, file_url, file_name) values (1, 'https://x.example/cv.pdf', 'cv.pdf')`);

      await assert.rejects(applyPlan(db, put, plan), /portfolio_cv already has rows/);
      assert.equal(put.puts.length, 0);
      assert.equal(await count(db, 'portfolio_projects'), 0);
      assert.equal(await count(db, 'projects'), 11);
    });

    it('leaves the database untouched when an upload fails', async () => {
      const failing = async () => {
        throw new Error('Blob store unavailable');
      };
      await assert.rejects(applyPlan(db, failing, await buildPlan(db), { dropOld: true }), /Blob store unavailable/);
      assert.equal(await count(db, 'portfolio_projects'), 0);
      assert.equal(await count(db, 'projects'), 11);
    });
  });

  describe('without the old tables', () => {
    it('still seeds the featured projects and local certificates', async () => {
      await db.query('drop table projects, certificates, cv_files');
      const plan = await buildPlan(db);
      const summary = await applyPlan(db, put, plan);

      assert.deepEqual(summary, { projects: 4, certificates: 3, cv: 0, uploads: 7, retiredDeleted: 0, droppedOld: false });
      assert.equal(await count(db, 'portfolio_cv'), 0);
    });
  });
});
