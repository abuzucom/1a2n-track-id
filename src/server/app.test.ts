import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ReadFile = typeof import('node:fs/promises').readFile;
let readFileOverride: ReadFile | null = null;

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readFile: ((...args: Parameters<ReadFile>) =>
      readFileOverride ? readFileOverride(...args) : actual.readFile(...args)) as ReadFile,
  };
});

const { buildApp } = await import('./app.js');
type App = ReturnType<typeof buildApp>;
const { TrackerStore } = await import('../state/store.js');
const { CoverArtResolver } = await import('../covers/resolver.js');

describe('ingest routes', () => {
  let store: TrackerStore;
  let app: App;

  let resolver: CoverArtResolver;
  const INGEST_TOKEN = 'test-ingest-token';
  const CLIENT_MARKER = 'TraktorClient';
  const allowedOrigin = 'http://127.0.0.1:8080';

  const post = (url: string, payload: unknown, headers: Record<string, string> = {}) =>
    app.inject({
      method: 'POST',
      url,
      payload,
      headers: {
        authorization: `Bearer ${INGEST_TOKEN}`,
        'x-track-id-client': CLIENT_MARKER,
        ...headers,
      },
    });

  beforeEach(async () => {
    store = new TrackerStore({ historyDebounceMs: 0 });
    resolver = new CoverArtResolver();
    app = buildApp({
      store,
      resolver,
      ingestToken: INGEST_TOKEN,
      allowedOrigins: [allowedOrigin],
      requireIngestAuth: true,
    });
    await app.ready();
  });
  afterEach(async () => {
    await app.close();
    store.dispose();
  });

  it('accepts deckLoaded and exposes it via /state', async () => {
    const res = await post('/deckLoaded/A', { title: 'Test Track', artist: 'Tester', bpm: 130 });
    expect(res.statusCode).toBe(200);

    const state = await app.inject({ method: 'GET', url: '/state' });
    expect(state.statusCode).toBe(200);
    const body = state.json();
    expect(body.decks.A.track.title).toBe('Test Track');
    expect(body.decks.A.track.bpm).toBe(130);
  });

  it('requires the bearer token on ingest routes', async () => {
    const token = await app.inject({
      method: 'GET',
      url: '/ingest-token',
      headers: { 'x-track-id-client': CLIENT_MARKER },
    });
    expect(token.statusCode).toBe(200);
    expect(token.json()).toEqual({ token: INGEST_TOKEN });
    expect(token.headers['cache-control']).toBe('no-store');

    const missing = await app.inject({ method: 'POST', url: '/deckLoaded/A', payload: { title: 'Blocked' } });
    expect(missing.statusCode).toBe(401);
    const wrong = await app.inject({
      method: 'POST',
      url: '/deckLoaded/A',
      payload: { title: 'Blocked' },
      headers: { authorization: 'Bearer wrong-token', 'x-track-id-client': CLIENT_MARKER },
    });
    expect(wrong.statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/state' })).json().decks.A.track).toBeNull();
  });

  it('rejects foreign origins and allows the configured local origin', async () => {
    const foreign = await app.inject({
      method: 'POST',
      url: '/deckLoaded/A',
      payload: { title: 'Blocked' },
      headers: {
        authorization: `Bearer ${INGEST_TOKEN}`,
        origin: 'https://attacker.example',
        'x-track-id-client': CLIENT_MARKER,
      },
    });
    expect(foreign.statusCode).toBe(403);

    const local = await post('/deckLoaded/A', { title: 'Allowed' }, { origin: allowedOrigin });
    expect(local.statusCode).toBe(200);
    expect(local.headers['access-control-allow-origin']).toBe(allowedOrigin);
  });

  it('handles only allowed CORS preflights', async () => {
    const allowed = await app.inject({
      method: 'OPTIONS',
      url: '/updateDeck/A',
      headers: {
        origin: allowedOrigin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization, content-type, x-track-id-client',
      },
    });
    expect(allowed.statusCode).toBe(204);
    expect(allowed.headers['access-control-allow-methods']).toBe('GET, POST, OPTIONS');

    const foreign = await app.inject({
      method: 'OPTIONS',
      url: '/updateDeck/A',
      headers: {
        origin: 'https://attacker.example',
        'access-control-request-method': 'POST',
      },
    });
    expect(foreign.statusCode).toBe(403);
  });

  it('keeps legacy ingest clients working when auth is not required', async () => {
    const legacyStore = new TrackerStore({ historyDebounceMs: 0 });
    const legacyApp = buildApp({ store: legacyStore, resolver, allowedOrigins: [allowedOrigin] });
    await legacyApp.ready();
    try {
      const response = await legacyApp.inject({
        method: 'POST',
        url: '/deckLoaded/A',
        payload: { title: 'Legacy Track' },
      });
      expect(response.statusCode).toBe(200);
      expect(legacyStore.snapshot().decks.A.track?.title).toBe('Legacy Track');
    } finally {
      await legacyApp.close();
      legacyStore.dispose();
    }
  });

  it('accepts updateDeck, updateChannel, updateMasterClock', async () => {
    await post('/deckLoaded/C', { title: 'X' });
    expect((await post('/updateDeck/C', { isPlaying: true })).statusCode).toBe(200);
    expect((await post('/updateChannel/3', { isOnAir: true })).statusCode).toBe(200);
    expect((await post('/updateMasterClock', { deck: 'C', bpm: 174 })).statusCode).toBe(200);

    const body = (await app.inject({ method: 'GET', url: '/state' })).json();
    expect(body.decks.C.isPlaying).toBe(true);
    expect(body.decks.C.onAir).toBe(true);
    expect(body.masterClock).toEqual({ deck: 'C', bpm: 174 });
  });

  it('rejects bad deck letters and channel indexes', async () => {
    expect((await post('/deckLoaded/Z', {})).statusCode).toBe(400);
    expect((await post('/updateDeck/AB', {})).statusCode).toBe(400);
    expect((await post('/updateChannel/9', {})).statusCode).toBe(400);
    expect((await post('/updateChannel/x', {})).statusCode).toBe(400);
  });

  it('never exposes filePath via /state', async () => {
    await post('/deckLoaded/A', { title: 'Secret', filePath: 'C:\\Users\\jonathan\\Music\\secret.mp3' });
    const body = (await app.inject({ method: 'GET', url: '/state' })).body;
    expect(body).toContain('Secret');
    expect(body).not.toContain('filePath');
  });

  it('serves the self-hosted brand fonts', async () => {
    const res = await app.inject({ method: 'GET', url: '/fonts/libre-franklin-900.woff2' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('font/woff2');
    expect((await app.inject({ method: 'GET', url: '/fonts/cousine-700.woff2' })).statusCode).toBe(200);
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

  it('wipes simulated data as soon as real payloads arrive', async () => {
    const sim = { 'x-simulated': '1' };
    await post('/deckLoaded/A', { title: 'FakeA' }, sim);
    await post('/updateChannel/1', { isOnAir: true }, sim);
    await post('/updateDeck/A', { isPlaying: true }, sim);
    await post('/updateMasterClock', { deck: 'A', bpm: 120 }, sim);
    expect((await app.inject({ method: 'GET', url: '/state' })).json().decks.A.track.title).toBe('FakeA');

    // First real (untagged) payload resets decks, history, and master clock.
    await post('/deckLoaded/B', { title: 'RealB' });
    const state = (await app.inject({ method: 'GET', url: '/state' })).json();
    expect(state.decks.A.track).toBeNull();
    expect(state.decks.B.track.title).toBe('RealB');
    expect(state.history).toEqual([]);
    expect(state.masterClock).toEqual({ deck: null, bpm: null });
  });

  it('keeps real data intact when more real payloads arrive', async () => {
    await post('/deckLoaded/A', { title: 'RealA' });
    await post('/deckLoaded/B', { title: 'RealB' });
    const state = (await app.inject({ method: 'GET', url: '/state' })).json();
    expect(state.decks.A.track.title).toBe('RealA');
    expect(state.decks.B.track.title).toBe('RealB');
  });

  it('accepts mixer frames and exposes them via /state', async () => {
    const res = await post('/updateMixer', {
      channels: [{ level: 0.3 }],
      xfader: 0.8,
      master: { sum: 0.4 },
    });
    expect(res.statusCode).toBe(200);
    const body = (await app.inject({ method: 'GET', url: '/state' })).json();
    expect(body.mixer.channels[0].level).toBe(0.3);
    expect(body.mixer.xfader).toBe(0.8);
  });

  it('rejects bad mixer bodies', async () => {
    expect((await post('/updateMixer', '[1]', { 'content-type': 'application/json' })).statusCode).toBe(400);
  });

  it('logs unexpected static file read errors but still returns 404', async () => {
    const err = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    readFileOverride = async () => {
      throw err;
    };
    try {
      const res = await app.inject({ method: 'GET', url: '/overlay' });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'not built' });
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('static file read failed'), err);
    } finally {
      readFileOverride = null;
      errorSpy.mockRestore();
    }
  });

  it('does not log a missing-file (ENOENT) static read as an error', async () => {
    const err = Object.assign(new Error('no such file'), { code: 'ENOENT' });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    readFileOverride = async () => {
      throw err;
    };
    try {
      const res = await app.inject({ method: 'GET', url: '/overlay' });
      expect(res.statusCode).toBe(404);
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      readFileOverride = null;
      errorSpy.mockRestore();
    }
  });

  it('rejects non-object bodies', async () => {
    const res = await post('/deckLoaded/A', '[1,2,3]', { 'content-type': 'application/json' });
    expect(res.statusCode).toBe(400);
  });
});
