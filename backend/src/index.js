import { createApp } from './app.js';
import { createVercelBlob } from './blob.js';
import { createNeonDb } from './db.js';

const app = createApp({
  db: createNeonDb(process.env.DATABASE_URL),
  blob: createVercelBlob(process.env.BLOB_READ_WRITE_TOKEN),
  env: process.env,
});

export default app;
