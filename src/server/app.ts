import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { DECK_IDS, toClientSnapshot, type DeckId, type TrackerStore } from '../state/store.js';
import type { CoverArtResolver } from '../covers/resolver.js';

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');

const FONT_FILES = [
  'libre-franklin-400.woff2',
  'libre-franklin-500.woff2',
  'libre-franklin-900.woff2',
  'cousine-400.woff2',
  'cousine-700.woff2',
];

// Fixed allowlist of static files; nothing user-supplied ever touches a path.
const STATIC_FILES: Record<string, { file: string; type: string }> = {
  '/overlay': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/overlay.js': { file: 'overlay.js', type: 'text/javascript; charset=utf-8' },
  ...Object.fromEntries(
    FONT_FILES.map((f) => [`/fonts/${f}`, { file: join('fonts', f), type: 'font/woff2' }]),
  ),
};

export type App = FastifyInstance;

export interface AppOptions {
  store: TrackerStore;
  resolver?: CoverArtResolver;
}

function isDeckId(v: string): v is DeckId {
  return (DECK_IDS as readonly string[]).includes(v);
}

function asBody(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function buildApp({ store, resolver }: AppOptions): App {
  const app = Fastify({ logger: false });

  // The simulator tags its payloads. Real (untagged) Traktor data purges any
  // simulated state first, so demo tracks can never linger into a live set.
  let hasSimulatedData = false;
  app.addHook('preHandler', (req, _reply, done) => {
    if (req.method === 'POST') {
      if (req.headers['x-simulated'] === '1') {
        hasSimulatedData = true;
      } else if (hasSimulatedData) {
        hasSimulatedData = false;
        console.log('real deck data arrived; clearing simulated state.');
        store.reset();
      }
    }
    done();
  });

  app.post<{ Params: { deck: string } }>('/deckLoaded/:deck', async (req, reply) => {
    const body = asBody(req.body);
    if (!isDeckId(req.params.deck) || !body) return reply.code(400).send({ error: 'bad request' });
    const title = typeof body.title === 'string' ? body.title.replace(/[\r\n]/g, ' ') : '';
    console.log(`traktor: deck ${req.params.deck} loaded: ${title || '(no title)'}`);
    store.deckLoaded(req.params.deck, body);
    return { ok: true };
  });

  app.post<{ Params: { deck: string } }>('/updateDeck/:deck', async (req, reply) => {
    const body = asBody(req.body);
    if (!isDeckId(req.params.deck) || !body) return reply.code(400).send({ error: 'bad request' });
    if ('isPlaying' in body) console.log(`traktor: deck ${req.params.deck} isPlaying=${String(body.isPlaying)}`);
    store.updateDeck(req.params.deck, body);
    return { ok: true };
  });

  app.post<{ Params: { channel: string } }>('/updateChannel/:channel', async (req, reply) => {
    const body = asBody(req.body);
    const index = Number(req.params.channel);
    if (!Number.isInteger(index) || index < 1 || index > 4 || !body) {
      return reply.code(400).send({ error: 'bad request' });
    }
    store.updateChannel(index, body);
    return { ok: true };
  });

  app.post('/updateMixer', async (req, reply) => {
    const body = asBody(req.body);
    if (!body) return reply.code(400).send({ error: 'bad request' });
    store.updateMixer(body);
    return { ok: true };
  });

  app.post('/updateMasterClock', async (req, reply) => {
    const body = asBody(req.body);
    if (!body) return reply.code(400).send({ error: 'bad request' });
    store.updateMasterClock(body);
    return { ok: true };
  });

  app.get('/state', async () => toClientSnapshot(store.snapshot()));

  app.get<{ Params: { id: string } }>('/art/:id', async (req, reply) => {
    const { id } = req.params;
    const art = resolver && /^[0-9a-f]{16}$/.test(id) ? resolver.get(id) : null;
    if (!art) return reply.code(404).send({ error: 'not found' });
    return reply.type(art.mime).send(art.data);
  });

  for (const [route, { file, type }] of Object.entries(STATIC_FILES)) {
    app.get(route, async (_req, reply) => {
      try {
        const content = await readFile(join(PUBLIC_DIR, file));
        return reply.type(type).send(content);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.error(`static file read failed for ${file}:`, err);
        }
        return reply.code(404).send({ error: 'not built' });
      }
    });
  }

  return app;
}
