import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  // The upgrade is handled by the ws server on the raw http server, so it
  // never passes through Fastify's hooks. The host check has to be repeated
  // here or /ws is the one route a rebound name can still reach.
  it('rejects connections whose Host is not loopback', async () => {
    const ws = new WebSocket(url, { headers: { host: 'evil.com' } });
    const [err] = (await once(ws, 'error')) as [Error];
    expect(String(err.message)).toMatch(/401|403/);
  });

  it('rejects connections from non-local web origins', async () => {
    const ws = new WebSocket(url, { headers: { origin: 'https://evil.example' } });
    const [err] = await once(ws, 'error');
    expect(String(err)).toContain('401');
  });

  it('accepts local origins and clients without an Origin header', async () => {
    const local = new WebSocket(url, { headers: { origin: 'http://127.0.0.1:8080' } });
    await once(local, 'open');
    local.close();
    const bare = new WebSocket(url);
    await once(bare, 'open');
    bare.close();
  });

  it('never exposes filePath in client snapshots', async () => {
    store.deckLoaded('A', { title: 'Secret', filePath: 'C:\\Users\\jonathan\\Music\\secret.mp3' });
    const ws = new WebSocket(url);
    const raw = JSON.stringify(await nextMessage(ws));
    expect(raw).toContain('Secret');
    expect(raw).not.toContain('filePath');
    expect(raw).not.toContain('jonathan');
    ws.close();
  });

  it('logs client socket errors instead of swallowing them', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ws = new WebSocket(url);
    await nextMessage(ws); // wait for the server-side connection to register
    const [serverSocket] = hub['wss'].clients;
    if (!serverSocket) throw new Error('no connected client');
    serverSocket.emit('error', new Error('boom'));
    await once(ws, 'close');
    expect(errorSpy).toHaveBeenCalledWith('websocket client error:', 'boom');
    errorSpy.mockRestore();
  });

  it('logs a failed broadcast send instead of dropping it silently', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ws = new WebSocket(url);
    await nextMessage(ws); // initial snapshot
    const [client] = hub['wss'].clients;
    if (!client) throw new Error('no connected client');
    const sendErr = new Error('send failed');
    const originalSend = client.send.bind(client);
    client.send = ((data: unknown, cb?: (err?: Error) => void) => {
      if (typeof cb === 'function') cb(sendErr);
      else originalSend(data as string);
    }) as typeof client.send;

    store.deckLoaded('B', { title: 'Live Update' });
    await new Promise((r) => setTimeout(r, 20));
    expect(errorSpy).toHaveBeenCalledWith('websocket broadcast send failed:', 'send failed');
    ws.close();
    errorSpy.mockRestore();
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
