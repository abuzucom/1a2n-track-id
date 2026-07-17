import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp, type App } from './app.js';
import { TrackerStore } from '../state/store.js';
import { CoverArtResolver } from '../covers/resolver.js';

describe('ingest routes', () => {
  let store: TrackerStore;
  let app: App;

  let resolver: CoverArtResolver;

  beforeEach(async () => {
    store = new TrackerStore({ historyDebounceMs: 0 });
    resolver = new CoverArtResolver();
    app = buildApp({ store, resolver });
    await app.ready();
  });
  afterEach(async () => {
    await app.close();
    store.dispose();
  });

  it('accepts deckLoaded and exposes it via /state', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/deckLoaded/A',
      payload: { title: 'Test Track', artist: 'Tester', bpm: 130 },
    });
    expect(res.statusCode).toBe(200);

    const state = await app.inject({ method: 'GET', url: '/state' });
    expect(state.statusCode).toBe(200);
    const body = state.json();
    expect(body.decks.A.track.title).toBe('Test Track');
    expect(body.decks.A.track.bpm).toBe(130);
  });

  it('accepts updateDeck, updateChannel, updateMasterClock', async () => {
    await app.inject({ method: 'POST', url: '/deckLoaded/C', payload: { title: 'X' } });
    expect(
      (await app.inject({ method: 'POST', url: '/updateDeck/C', payload: { isPlaying: true } })).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'POST', url: '/updateChannel/3', payload: { isOnAir: true } })).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'POST', url: '/updateMasterClock', payload: { deck: 'C', bpm: 174 } })).statusCode,
    ).toBe(200);

    const body = (await app.inject({ method: 'GET', url: '/state' })).json();
    expect(body.decks.C.isPlaying).toBe(true);
    expect(body.decks.C.onAir).toBe(true);
    expect(body.masterClock).toEqual({ deck: 'C', bpm: 174 });
  });

  it('rejects bad deck letters and channel indexes', async () => {
    expect((await app.inject({ method: 'POST', url: '/deckLoaded/Z', payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/updateDeck/AB', payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/updateChannel/9', payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/updateChannel/x', payload: {} })).statusCode).toBe(400);
  });

  it('serves the overlay page and bundle', async () => {
    const page = await app.inject({ method: 'GET', url: '/overlay' });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.body).toContain('id="overlay-root"');

    const js = await app.inject({ method: 'GET', url: '/overlay.js' });
    expect(js.statusCode).toBe(200);
    expect(js.headers['content-type']).toContain('javascript');
  });

  it('serves cover art by id and 404s unknown/malformed ids', async () => {
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { mp3WithCover } = await import('../covers/test-fixtures.js');

    const dir = await mkdtemp(join(tmpdir(), 'artroute-'));
    try {
      const file = join(dir, 'track.mp3');
      await writeFile(file, mp3WithCover());
      await resolver.resolve(file);

      const ok = await app.inject({ method: 'GET', url: `/art/${resolver.idFor(file)}` });
      expect(ok.statusCode).toBe(200);
      expect(ok.headers['content-type']).toBe('image/png');

      expect((await app.inject({ method: 'GET', url: '/art/nothex!!' })).statusCode).toBe(404);
      expect((await app.inject({ method: 'GET', url: '/art/deadbeefdeadbeef' })).statusCode).toBe(404);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects non-object bodies', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/deckLoaded/A',
      payload: '[1,2,3]',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(400);
  });
});
