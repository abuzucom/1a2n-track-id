import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp, type App } from './app.js';
import { TrackerStore } from '../state/store.js';

describe('ingest routes', () => {
  let store: TrackerStore;
  let app: App;

  beforeEach(async () => {
    store = new TrackerStore({ historyDebounceMs: 0 });
    app = buildApp({ store });
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
