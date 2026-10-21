import express from 'express';
import { router as membersRouter } from './routes/members';
import { getDb } from './db/db';

export function createServer() {
  const app = express();
  app.use(express.json());

  // Permissive CORS for local dev (frontend on a different port).
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });
  app.options('*', (_req, res) => res.sendStatus(204));

  app.get('/api/health', (_req, res) => {
    getDb();
    res.json({ ok: true, time: new Date().toISOString() });
  });

  app.use('/api', membersRouter);

  return app;
}
