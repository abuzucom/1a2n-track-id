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

  it('never exposes filePath via /state', async () => {
    await app.inject({
      method: 'POST',
      url: '/deckLoaded/A',
      payload: { title: 'Secret', filePath: 'C:\\Users\\jonathan\\Music\\secret.mp3' },
    });
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
    const sim = { headers: { 'x-simulated': '1' } };
    await app.inject({ method: 'POST', url: '/deckLoaded/A', payload: { title: 'FakeA' }, ...sim });
    await app.inject({ method: 'POST', url: '/updateChannel/1', payload: { isOnAir: true }, ...sim });
    await app.inject({ method: 'POST', url: '/updateDeck/A', payload: { isPlaying: true }, ...sim });
    await app.inject({ method: 'POST', url: '/updateMasterClock', payload: { deck: 'A', bpm: 120 }, ...sim });
    expect((await app.inject({ method: 'GET', url: '/state' })).json().decks.A.track.title).toBe('FakeA');

    // First real (untagged) payload resets decks, history, and master clock.
    await app.inject({ method: 'POST', url: '/deckLoaded/B', payload: { title: 'RealB' } });
    const state = (await app.inject({ method: 'GET', url: '/state' })).json();
    expect(state.decks.A.track).toBeNull();
    expect(state.decks.B.track.title).toBe('RealB');
    expect(state.history).toEqual([]);
    expect(state.masterClock).toEqual({ deck: null, bpm: null });
  });

  it('keeps real data intact when more real payloads arrive', async () => {
    await app.inject({ method: 'POST', url: '/deckLoaded/A', payload: { title: 'RealA' } });
    await app.inject({ method: 'POST', url: '/deckLoaded/B', payload: { title: 'RealB' } });
    const state = (await app.inject({ method: 'GET', url: '/state' })).json();
    expect(state.decks.A.track.title).toBe('RealA');
    expect(state.decks.B.track.title).toBe('RealB');
  });

  it('accepts mixer frames and exposes them via /state', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/updateMixer',
      payload: { channels: [{ level: 0.3 }], xfader: 0.8, master: { sum: 0.4 } },
    });
    expect(res.statusCode).toBe(200);
    const body = (await app.inject({ method: 'GET', url: '/state' })).json();
    expect(body.mixer.channels[0].level).toBe(0.3);
    expect(body.mixer.xfader).toBe(0.8);
  });

  it('rejects bad mixer bodies', async () => {
    expect(
      (await app.inject({ method: 'POST', url: '/updateMixer', payload: '[1]', headers: { 'content-type': 'application/json' } })).statusCode,
    ).toBe(400);
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
    const res = await app.inject({
      method: 'POST',
      url: '/deckLoaded/A',
      payload: '[1,2,3]',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(400);
  });
});
