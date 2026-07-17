import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildApp, type App } from './app.js';
import { attachWebSocket, type WsHub } from './ws.js';
import { TrackerStore } from '../state/store.js';

describe('WebSocket hub', () => {
  let store: TrackerStore;
  let app: App;
  let hub: WsHub;
  let url: string;

  beforeEach(async () => {
    store = new TrackerStore({ historyDebounceMs: 0 });
    app = buildApp({ store });
    hub = attachWebSocket(app.server, store);
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    if (typeof addr === 'string' || addr === null) throw new Error('no address');
    url = `ws://127.0.0.1:${addr.port}/ws`;
  });
  afterEach(async () => {
    hub.close();
    await app.close();
    store.dispose();
  });

  async function nextMessage(ws: WebSocket): Promise<unknown> {
    const [data] = await once(ws, 'message');
    return JSON.parse(String(data));
  }

  it('sends the current snapshot on connect', async () => {
    store.deckLoaded('A', { title: 'Preloaded' });
    const ws = new WebSocket(url);
    const msg = (await nextMessage(ws)) as { type: string; state: { decks: { A: { track: { title: string } } } } };
    expect(msg.type).toBe('state');
    expect(msg.state.decks.A.track.title).toBe('Preloaded');
    ws.close();
  });

  it('broadcasts store changes to connected clients', async () => {
    const ws = new WebSocket(url);
    await nextMessage(ws); // initial snapshot
    store.deckLoaded('B', { title: 'Live Update' });
    const msg = (await nextMessage(ws)) as { state: { decks: { B: { track: { title: string } } } } };
    expect(msg.state.decks.B.track.title).toBe('Live Update');
    ws.close();
  });

  it('reports client connect/disconnect counts', async () => {
    const counts: number[] = [];
    hub.on('clients', (n) => counts.push(n));
    const ws = new WebSocket(url);
    await nextMessage(ws);
    expect(hub.clientCount).toBe(1);
    ws.close();
    await once(ws, 'close');
    await new Promise((r) => setTimeout(r, 50));
    expect(hub.clientCount).toBe(0);
    expect(counts).toEqual([1, 0]);
  });
});
