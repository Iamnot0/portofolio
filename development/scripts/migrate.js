// Applies pending backend/db/migrations/*.sql files. Usage: DATABASE_URL=... node development/scripts/migrate.js
import { createNeonDb } from '../../backend/src/db.js';
import { requireEnv, runCli } from './lib/cli.js';
import { migrate } from './lib/migrate.js';

await runCli(async () => {
  const applied = await migrate(createNeonDb(requireEnv('DATABASE_URL')), {
    onApplied: (file) => console.log(`applied ${file}`),
  });
  if (!applied.length) console.log('up to date');
});
