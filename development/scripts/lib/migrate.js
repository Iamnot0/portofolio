import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../../backend/db/migrations/', import.meta.url));

// Applies every pending .sql file in filename order, each in its own transaction together with
// its schema_migrations row, so a failed file leaves no trace. `onApplied` fires after each commit;
// the files applied are also returned.
export async function migrate(db, { dir = MIGRATIONS_DIR, onApplied = () => {} } = {}) {
  await db.query(
    `create table if not exists schema_migrations (
       name text primary key,
       applied_at timestamptz default now()
     )`,
  );
  const applied = new Set((await db.query('select name from schema_migrations')).map((row) => row.name));
  const pending = readdirSync(dir)
    .filter((file) => file.endsWith('.sql') && !applied.has(file))
    .sort();

  const done = [];
  for (const file of pending) {
    const sql = readFileSync(join(dir, file), 'utf8');
    await db.transaction(async (query) => {
      await query(sql);
      await query('insert into schema_migrations (name) values ($1)', [file]);
    });
    done.push(file);
    onApplied(file);
  }
  return done;
}
