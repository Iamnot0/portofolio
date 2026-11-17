import express from 'express';
import { createApi } from './api.js';
import { createVercelBlob } from './blob.js';
import { createNeonDb } from './db.js';
import { createResendMailer } from './email/resend.js';

const app = express();
app.disable('x-powered-by');
app.use(createApi({
  db: createNeonDb(process.env.DATABASE_URL),
  blob: createVercelBlob(process.env.BLOB_READ_WRITE_TOKEN),
  mailer: createResendMailer(process.env.RESEND_API_KEY),
  env: process.env,
}));

export default app;
