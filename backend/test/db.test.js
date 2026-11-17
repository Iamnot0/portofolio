import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from './helpers.js';

describe('test db', () => {
  let db;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it('applies the portfolio schema', async () => {
    const rows = await db.query(
      `select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );
    assert.deepEqual(
      rows.map((r) => r.table_name),
      ['contact_submissions', 'login_attempts', 'portfolio_certificates', 'portfolio_cv', 'portfolio_projects'],
    );
  });

  it('commits a transaction', async () => {
    await db.transaction(async (q) => {
      await q('insert into portfolio_projects (title, display_order) values ($1, $2)', ['Kept', 1]);
    });
    const rows = await db.query('select title from portfolio_projects');
    assert.deepEqual(rows, [{ title: 'Kept' }]);
  });

  it('rolls a failed transaction back', async () => {
    await assert.rejects(
      db.transaction(async (q) => {
        await q('insert into portfolio_projects (title, display_order) values ($1, $2)', ['Lost', 2]);
        throw new Error('abort');
      }),
      /abort/,
    );
    const rows = await db.query('select title from portfolio_projects order by id');
    assert.deepEqual(rows, [{ title: 'Kept' }]);
  });

  it('allows only one cv row', async () => {
    await assert.rejects(db.query(`insert into portfolio_cv (id, file_url, file_name) values (2, 'u', 'n')`));
  });
});
