import Fastify, { type FastifyInstance } from 'fastify';
import { DECK_IDS, type DeckId, type TrackerStore } from '../state/store.js';

export type App = FastifyInstance;

export interface AppOptions {
  store: TrackerStore;
}

function isDeckId(v: string): v is DeckId {
  return (DECK_IDS as readonly string[]).includes(v);
}

function asBody(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function buildApp({ store }: AppOptions): App {
  const app = Fastify({ logger: false });

  app.post<{ Params: { deck: string } }>('/deckLoaded/:deck', async (req, reply) => {
    const body = asBody(req.body);
    if (!isDeckId(req.params.deck) || !body) return reply.code(400).send({ error: 'bad request' });
    store.deckLoaded(req.params.deck, body);
    return { ok: true };
  });

  app.post<{ Params: { deck: string } }>('/updateDeck/:deck', async (req, reply) => {
    const body = asBody(req.body);
    if (!isDeckId(req.params.deck) || !body) return reply.code(400).send({ error: 'bad request' });
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

  app.post('/updateMasterClock', async (req, reply) => {
    const body = asBody(req.body);
    if (!body) return reply.code(400).send({ error: 'bad request' });
    store.updateMasterClock(body);
    return { ok: true };
  });

  app.get('/state', async () => store.snapshot());

  return app;
}
