import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { bool } from '../state/coerce.js';
import { isDeckId, toClientSnapshot, type TrackerStore } from '../state/store.js';
import { isLoopbackHost } from './host-guard.js';
import type { CoverArtResolver } from '../covers/resolver.js';

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');

/**
 * The overlay is entirely self-contained: no external requests, one bundled
 * script, one inline <style> block, art fetched from this origin. 'unsafe-inline'
 * covers only that style block; scripts stay locked to same-origin files.
 * ws: is listed explicitly because CSP3's 'self' does not extend to the
 * WebSocket scheme in older engines, and OBS embeds an older CEF.
 */
const OVERLAY_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' ws://127.0.0.1:* ws://localhost:*",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const FONT_FILES = [
  'libre-franklin-400.woff2',
  'libre-franklin-500.woff2',
  'libre-franklin-900.woff2',
  'cousine-400.woff2',
  'cousine-700.woff2',
];

// Fixed allowlist of static files; nothing user-supplied ever touches a path.
const STATIC_FILES: Record<string, { file: string; type: string; csp?: string }> = {
  '/overlay': { file: 'index.html', type: 'text/html; charset=utf-8', csp: OVERLAY_CSP },
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

/** Cast an unknown HTTP request body to a dictionary, returning null for arrays or primitives. */
function asBody(payload: unknown): Record<string, unknown> | null {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload) ? (payload as Record<string, unknown>) : null;
}

export function buildApp({ store, resolver }: AppOptions): App {
  const app = Fastify({ logger: false });

  // Rejected on onRequest, before the body is parsed, so a foreign host
  // cannot even make us read its payload.
  app.addHook('onRequest', (req, reply, done) => {
    reply.header('x-content-type-options', 'nosniff');
    if (!isLoopbackHost(req.headers.host)) {
      void reply.code(403).send({ error: 'forbidden host' });
      return;
    }
    done();
  });

  // The simulator tags its payloads. Real (untagged) Traktor data purges any
  // simulated state first, so demo tracks can never linger into a live set.
  // Intentional shared cache: tracks if any recent request was simulated.
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
    // Coerced, not stringified: the raw value is unvalidated JSON and a
    // string with newlines in it would otherwise forge log lines.
    if ('isPlaying' in body) console.log(`traktor: deck ${req.params.deck} isPlaying=${bool(body.isPlaying)}`);
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

  for (const [route, { file, type, csp }] of Object.entries(STATIC_FILES)) {
    app.get(route, async (_req, reply) => {
      try {
        const content = await readFile(join(PUBLIC_DIR, file));
        if (csp) reply.header('content-security-policy', csp);
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
