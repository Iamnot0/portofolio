import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createNeonDb } from '../src/db.js';

const URL = 'postgres://user:pass@host/db';

describe('Neon database adapter', () => {
  let pools;
  let failOn;
  let errors;

  class FakePool {
    constructor(options) {
      this.options = options;
      this.listeners = {};
      this.ended = 0;
      this.events = [];
      this.released = [];
      pools.push(this);
    }

    on(event, listener) {
      this.listeners[event] = listener;
      return this;
    }

    async connect() {
      return {
        query: async (text) => {
          this.events.push(text);
          if (failOn === text) throw new Error(`${text} failed`);
          return { rows: [{ text }] };
        },
        release: (err) => this.released.push(err),
      };
    }

    async end() {
      this.ended += 1;
    }
  }

  const db = () => createNeonDb(URL, { Pool: FakePool, neon: () => ({ query: async () => [] }) });

  beforeEach(() => {
    pools = [];
    failOn = null;
    errors = mock.method(console, 'error', () => {});
  });

  afterEach(() => errors.mock.restore());

  it('commits, releases the client cleanly and ends the pool', async () => {
    const result = await db().transaction(async (query) => (await query('select 1'))[0]);
    const [pool] = pools;
    assert.deepEqual(result, { text: 'select 1' });
    assert.deepEqual(pool.events, ['BEGIN', 'select 1', 'COMMIT']);
    assert.deepEqual(pool.released, [undefined]);
    assert.equal(pool.ended, 1);
  });

  it('opens a fresh pool for every transaction', async () => {
    const database = db();
    await database.transaction(async () => {});
    await database.transaction(async () => {});
    assert.equal(pools.length, 2);
    assert.ok(pools.every((pool) => pool.ended === 1));
  });

  it('rolls back, rethrows and still ends the pool when the callback fails', async () => {
    const boom = new Error('boom');
    await assert.rejects(db().transaction(async () => { throw boom; }), boom);
    const [pool] = pools;
    assert.deepEqual(pool.events, ['BEGIN', 'ROLLBACK']);
    assert.deepEqual(pool.released, [undefined]);
    assert.equal(pool.ended, 1);
  });

  it('destroys the connection when the rollback itself fails', async () => {
    failOn = 'ROLLBACK';
    const boom = new Error('boom');
    await assert.rejects(db().transaction(async () => { throw boom; }), boom);
    const [pool] = pools;
    assert.equal(pool.released.length, 1);
    assert.equal(pool.released[0].message, 'ROLLBACK failed');
    assert.equal(pool.ended, 1);
  });

  it('ends the pool when the connection cannot be opened', async () => {
    const refused = new Error('refused');
    class RefusingPool extends FakePool {
      async connect() { throw refused; }
    }
    await assert.rejects(createNeonDb(URL, { Pool: RefusingPool }).transaction(async () => {}), refused);
    assert.equal(pools[0].ended, 1);
  });

  it('listens for pool errors and logs them without throwing', async () => {
    await db().transaction(async () => {});
    const [pool] = pools;
    assert.equal(typeof pool.listeners.error, 'function');
    assert.doesNotThrow(() => pool.listeners.error(new Error('idle connection lost')));
    assert.equal(errors.mock.callCount(), 1);
  });

  it('creates the pool with the connection string', async () => {
    await db().transaction(async () => {});
    assert.deepEqual(pools[0].options, { connectionString: URL });
  });

  it('keeps single statements on the HTTP client', async () => {
    const seen = [];
    const database = createNeonDb(URL, {
      Pool: FakePool,
      neon: (url) => ({ query: async (text, params) => { seen.push({ url, text, params }); return [1]; } }),
    });
    assert.deepEqual(await database.query('select $1', [1]), [1]);
    assert.deepEqual(seen, [{ url: URL, text: 'select $1', params: [1] }]);
    assert.equal(pools.length, 0);
  });
});
