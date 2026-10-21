import { runSync } from '../services/sync';

// Standalone sync entry point. The daily GMT cron (Phase 3) will invoke this.
runSync()
  .then((r) => {
    console.log('[sync] done:', JSON.stringify(r));
    process.exit(0);
  })
  .catch((err) => {
    console.error('[sync] failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
