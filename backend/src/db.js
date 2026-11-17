import { Pool, neon } from '@neondatabase/serverless';

// Single statements go over Neon's HTTP endpoint. Transactions need a held connection, so they
// use a WebSocket Pool client with a real BEGIN/COMMIT. Both are created on first use so the app
// can boot (and serve routes that never touch the database) without DATABASE_URL.
export function createNeonDb(url) {
  let sql;
  let pool;
  const toRows = (client) => async (text, params = []) => (await client.query(text, params)).rows;

  return {
    query(text, params = []) {
      sql ??= neon(url);
      return sql.query(text, params);
    },
    async transaction(fn) {
      pool ??= new Pool({ connectionString: url });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(toRows(client));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
  };
}
