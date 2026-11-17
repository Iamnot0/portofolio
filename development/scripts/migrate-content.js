// One-time move of the old projects, certificates and CV into the portfolio_* tables and Vercel Blob.
// Usage: DATABASE_URL=... BLOB_READ_WRITE_TOKEN=... node development/scripts/migrate-content.js --dry-run
//        ... --apply [--drop-old]
import { put } from '@vercel/blob';
import { createNeonDb } from '../../backend/src/db.js';
import { requireEnv, runCli } from './lib/cli.js';
import { applyPlan, buildPlan, describePlan, parseArgs } from './lib/migrate-content.js';

await runCli(async () => {
  const { apply, dropOld } = parseArgs(process.argv.slice(2));
  const db = createNeonDb(requireEnv('DATABASE_URL'));
  const token = apply ? requireEnv('BLOB_READ_WRITE_TOKEN') : null;

  const plan = await buildPlan(db);
  console.log(describePlan(plan, { dropOld }));
  if (!apply) {
    console.log('\nDry run: nothing was uploaded or changed.');
    return;
  }

  const summary = await applyPlan(db, (pathname, data, options) => put(pathname, data, { ...options, token }), plan, {
    dropOld,
  });
  console.log(
    [
      '\nDone.',
      `projects inserted: ${summary.projects}`,
      `certificates inserted: ${summary.certificates}`,
      `cv inserted: ${summary.cv}`,
      `files uploaded: ${summary.uploads}`,
      `retired projects deleted: ${summary.retiredDeleted}`,
      `old tables dropped: ${summary.droppedOld ? 'yes' : 'no'}`,
    ].join('\n'),
  );
});
