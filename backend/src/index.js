import { createApp } from './app.js';
import { createNeonDb } from './db.js';

const app = createApp({ db: createNeonDb(process.env.DATABASE_URL), env: process.env });

export default app;
