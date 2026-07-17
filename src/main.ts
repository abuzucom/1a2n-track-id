import { join } from 'node:path';
import { buildApp } from './server/app.js';
import { attachWebSocket } from './server/ws.js';
import { AutoShutdown } from './server/auto-shutdown.js';
import { DECK_IDS, TrackerStore } from './state/store.js';
import { HistoryFile } from './state/history-file.js';
import { CoverArtResolver } from './covers/resolver.js';
import { parseCliFlags } from './cli.js';
import { formatListenError } from './server/listen-error.js';

const { autoExit, resume, dev } = parseCliFlags(process.argv.slice(2));
// Dev/simulator work uses 8090 so a leftover dev server can never collide
// with, or serve stale data to, the production overlay on 8080.
const DEFAULT_PORT = 8080;
const DEV_PORT = 8090;
const PORT = Number(process.env.TRACK_ID_PORT ?? (dev ? DEV_PORT : DEFAULT_PORT));
const HOST = '127.0.0.1';
const graceMs = Number(process.env.TRACK_ID_EXIT_GRACE_MS ?? 60_000);

const store = new TrackerStore();
const sessionStamp = new Date().toISOString().slice(0, 10);
const historyFile = new HistoryFile(join(process.cwd(), 'history', `session-${sessionStamp}.json`));

// History starts empty each launch; --resume reloads today's file (e.g. after a mid-set crash).
if (resume) store.loadHistory(await historyFile.load());

let lastHistoryLen = store.snapshot().history.length;
store.on('change', (snap) => {
  if (snap.history.length !== lastHistoryLen) {
    lastHistoryLen = snap.history.length;
    void historyFile.save(snap.history).catch((err) => console.error('history save failed:', err));
  }
});

const resolver = new CoverArtResolver();
store.on('change', (snap) => {
  for (const deckId of DECK_IDS) {
    const track = snap.decks[deckId].track;
    if (!track || !track.filePath || track.artUrl !== undefined) continue;
    const filePath = track.filePath;
    void resolver.resolve(filePath).then((art) => {
      // Deck may have been reloaded while we parsed the file.
      const current = store.snapshot().decks[deckId].track;
      if (art && current?.filePath === filePath) {
        store.setDeckArt(deckId, `/art/${resolver.idFor(filePath)}`);
      }
    });
  }
});

const app = buildApp({ store, resolver });
const hub = attachWebSocket(app.server, store);

const auto = new AutoShutdown({
  graceMs,
  enabled: autoExit,
  onShutdown: () => {
    console.log('last overlay client disconnected; shutting down.');
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

try {
  await app.listen({ port: PORT, host: HOST });
} catch (err) {
  const friendly = formatListenError(err, PORT);
  if (friendly === null) throw err;
  console.error(friendly);
  await shutdown(1);
}
console.log(`1a2n-track-id running:`);
console.log(`  overlay:  http://${HOST}:${PORT}/overlay  (add as OBS browser source)`);
console.log(`  views:    /overlay?view=now | decks | history | all`);
console.log(`  ingest:   POST http://${HOST}:${PORT}/deckLoaded/<A-D> (Traktor QML mod)`);
console.log(autoExit ? `  auto-exit ${graceMs / 1000}s after last client disconnects` : '  auto-exit disabled');
console.log('waiting for Traktor deck data (each incoming post is logged here) ...');
