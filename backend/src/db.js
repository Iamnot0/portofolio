import { Pool, neon } from '@neondatabase/serverless';

// Single statements go over Neon's HTTP endpoint. A transaction needs a held connection, so it
// opens a WebSocket Pool for its own duration and ends it afterwards: nothing outlives the request
// that could fail on its own and take the function down. The HTTP client is created on first use
// so the app can boot without DATABASE_URL.
export function createNeonDb(url, { Pool: PoolImpl = Pool, neon: neonImpl = neon } = {}) {
  let sql;
  const toRows = (client) => async (text, params = []) => (await client.query(text, params)).rows;

  return {
    query(text, params = []) {
      sql ??= neonImpl(url);
      return sql.query(text, params);
    },
    async transaction(fn) {
      const pool = new PoolImpl({ connectionString: url });
      pool.on('error', (err) => console.error('Neon pool error', err));
      let client;
      let discard;
      try {
        client = await pool.connect();
        await client.query('BEGIN');
        const result = await fn(toRows(client));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client?.query('ROLLBACK').catch((rollbackErr) => { discard = rollbackErr; });
        throw err;
      } finally {
        client?.release(discard);
        await pool.end();
      }
    },
  };
}
