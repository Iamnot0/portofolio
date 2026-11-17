import express from 'express';
import { authRouter } from './auth/routes.js';
import { contactRouter } from './contact/routes.js';
import { adminContentRouter, publicContentRouter } from './content/routes.js';
import { errorHandler, notFound, originGuard } from './http.js';
import { uploadsRouter } from './uploads/routes.js';

export function createApi({ db, blob, mailer, env = {}, clock = () => new Date() }) {
  const ctx = { db, blob, mailer, env, clock };
  const api = express.Router();
  api.use('/api', originGuard);
  // Vercel Functions cap request bodies at 4.5 MB.
  api.use(express.json({ limit: '4.5mb' }));

  api.get('/api/health', (req, res) => res.json({ ok: true }));
  api.use('/api/auth', authRouter(ctx));
  api.use('/api', publicContentRouter(ctx));
  api.use('/api/admin', adminContentRouter(ctx));
  api.use('/api/uploads', uploadsRouter(ctx));
  api.use('/api/contact', contactRouter(ctx));

  api.use(notFound);
  api.use(errorHandler);
  return api;
}
