import { createServer } from './server';
import { getDb } from './db/db';
import { config } from './config';

function main() {
  getDb(); // initialise schema up front
  const app = createServer();
  app.listen(config.port, () => {
    console.log(`[backend] listening on http://localhost:${config.port}`);
    console.log(`[backend] Ghost: ${config.ghost.url}  milestone: ${config.milestoneMonths}mo`);
    console.log(`[backend] db: ${config.dbPath}`);
    console.log('[backend] POST /api/sync to pull members from Ghost');
  });
}

main();
