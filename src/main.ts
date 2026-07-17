import { join } from 'node:path';
import { buildApp } from './server/app.js';
import { attachWebSocket } from './server/ws.js';
import { AutoShutdown } from './server/auto-shutdown.js';
import { TrackerStore } from './state/store.js';
import { HistoryFile } from './state/history-file.js';

const PORT = Number(process.env.TRACK_ID_PORT ?? 8080);
const HOST = '127.0.0.1';
const args = process.argv.slice(2);
const autoExit = !args.includes('--no-auto-exit');
const graceMs = Number(process.env.TRACK_ID_EXIT_GRACE_MS ?? 60_000);

const store = new TrackerStore();
const sessionStamp = new Date().toISOString().slice(0, 10);
const historyFile = new HistoryFile(join(process.cwd(), 'history', `session-${sessionStamp}.json`));

store.loadHistory(await historyFile.load());

let lastHistoryLen = store.snapshot().history.length;
store.on('change', (snap) => {
  if (snap.history.length !== lastHistoryLen) {
    lastHistoryLen = snap.history.length;
    void historyFile.save(snap.history).catch((err) => console.error('history save failed:', err));
  }
});

const app = buildApp({ store });
const hub = attachWebSocket(app.server, store);

const auto = new AutoShutdown({
  graceMs,
  enabled: autoExit,
  onShutdown: () => {
    console.log('last overlay client disconnected — shutting down.');
    void shutdown(0);
  },
});
hub.on('clients', (n) => {
  console.log(`overlay clients connected: ${n}`);
  auto.clientsChanged(n);
});

async function shutdown(code: number): Promise<void> {
  auto.dispose();
  hub.close();
  await app.close().catch(() => undefined);
  store.dispose();
  process.exit(code);
}

process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));

await app.listen({ port: PORT, host: HOST });
console.log(`1a2n-track-id running:`);
console.log(`  overlay:  http://${HOST}:${PORT}/overlay  (add as OBS browser source)`);
console.log(`  views:    /overlay?view=now | decks | history | all`);
console.log(`  ingest:   POST http://${HOST}:${PORT}/deckLoaded/<A-D> (Traktor QML mod)`);
console.log(autoExit ? `  auto-exit ${graceMs / 1000}s after last client disconnects` : '  auto-exit disabled');
