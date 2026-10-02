import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp, type App } from './app.js';
import { TrackerStore } from '../state/store.js';
import { CoverArtResolver } from '../covers/resolver.js';

const CORP_HEADER = 'cross-origin-resource-policy';
const ESC = '\u001b';
const BEL = '\u0007';
const CSI = '\u009b';

describe('server hardening', () => {
  let store: TrackerStore;
  let app: App;

  beforeEach(async () => {
    store = new TrackerStore({ historyDebounceMs: 0 });
    app = buildApp({ store, resolver: new CoverArtResolver() });
    await app.ready();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
    store.dispose();
  });

  it('strips terminal control sequences from the logged track title', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    // OSC 52 asks the terminal to overwrite the clipboard; CSI recolors output.
    const title = `Promo${ESC}]52;c;cGF5bG9hZA==${BEL} Mix${CSI}31m`;

    const res = await app.inject({ method: 'POST', url: '/deckLoaded/A', payload: { title } });

    expect(res.statusCode).toBe(200);
    const logged = logSpy.mock.calls.map((args) => args.map(String).join(' ')).join('\n');
    expect(logged).toContain('Promo');
    expect(logged).not.toContain(ESC);
    expect(logged).not.toContain(BEL);
    expect(logged).not.toContain(CSI);
  });

  it('keeps the unsanitized title in state, where the overlay renders it as text', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const title = `Track${ESC}[1m`;
    await app.inject({ method: 'POST', url: '/deckLoaded/A', payload: { title } });

    const state = await app.inject({ method: 'GET', url: '/state' });
    expect(state.json().decks.A.track.title).toBe(title);
  });

  it('marks every response as same-origin only', async () => {
    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/state' }),
      app.inject({ method: 'GET', url: '/art/0123456789abcdef' }),
      app.inject({ method: 'GET', url: '/state', headers: { host: 'evil.example' } }),
    ]);

    expect(responses.map((res) => res.statusCode)).toEqual([200, 404, 403]);
    for (const res of responses) {
      expect(res.headers[CORP_HEADER]).toBe('same-origin');
    }
  });
});
