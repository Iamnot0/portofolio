import { createApp } from './app.js';
import { createVercelBlob } from './blob.js';
import { createNeonDb } from './db.js';
import { createResendMailer } from './email/resend.js';

const app = createApp({
  db: createNeonDb(process.env.DATABASE_URL),
  blob: createVercelBlob(process.env.BLOB_READ_WRITE_TOKEN),
  mailer: createResendMailer(process.env.RESEND_API_KEY),
  env: process.env,
});

export default app;
