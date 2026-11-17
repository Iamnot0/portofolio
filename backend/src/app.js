import express from 'express';
import { authRouter } from './auth/routes.js';
import { errorHandler, notFound, originGuard } from './http.js';

export function createApp({ db, blob, mailer, env = {}, clock = () => new Date() }) {
  const ctx = { db, blob, mailer, env, clock };
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', originGuard);
  // Vercel Functions cap request bodies at 4.5 MB.
  app.use(express.json({ limit: '4.5mb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter(ctx));
  // Feature routers mount here as `app.use('/api/<area>', areaRouter(ctx))`.

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
