import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from '../scripts/lib/migrate.js';
import { createTestDb } from './helpers.js';

const tables = async (db) =>
  (await db.query(`select table_name from information_schema.tables where table_schema = 'public' order by table_name`)).map(
    (row) => row.table_name,
  );

describe('migrate', () => {
  let db;
  beforeEach(() => {
    db = createTestDb();
  });
  afterEach(() => db.close());

  it('applies the backend migrations once and reports up to date on the second run', async () => {
    assert.deepEqual(await migrate(db), ['001_portfolio.sql']);
    assert.ok((await tables(db)).includes('portfolio_projects'));

    assert.deepEqual(await migrate(db), []);
    const recorded = await db.query('select name from schema_migrations');
    assert.deepEqual(recorded, [{ name: '001_portfolio.sql' }]);
  });

  describe('with a custom directory', () => {
    const directory = () => mkdtempSync(join(tmpdir(), 'migrations-'));

    it('applies pending files in filename order and skips recorded ones', async () => {
      const dir = directory();
      writeFileSync(join(dir, '002_second.sql'), 'insert into log values (2);');
      writeFileSync(join(dir, '001_first.sql'), 'create table log (n int); insert into log values (1);');
      writeFileSync(join(dir, 'notes.txt'), 'ignored');

      assert.deepEqual(await migrate(db, { dir }), ['001_first.sql', '002_second.sql']);
      assert.deepEqual(await db.query('select n from log order by n'), [{ n: 1 }, { n: 2 }]);

      writeFileSync(join(dir, '003_third.sql'), 'insert into log values (3);');
      assert.deepEqual(await migrate(db, { dir }), ['003_third.sql']);
    });

    it('rolls a failing file back, does not record it and stops', async () => {
      const dir = directory();
      writeFileSync(join(dir, '001_ok.sql'), 'create table kept (n int);');
      writeFileSync(join(dir, '002_bad.sql'), 'create table half (n int); select * from missing_table;');
      writeFileSync(join(dir, '003_later.sql'), 'create table later (n int);');

      await assert.rejects(migrate(db, { dir }), /missing_table/);
      const names = await tables(db);
      assert.ok(names.includes('kept'));
      assert.ok(!names.includes('half'));
      assert.ok(!names.includes('later'));
      assert.deepEqual(await db.query('select name from schema_migrations'), [{ name: '001_ok.sql' }]);
    });
  });
});
