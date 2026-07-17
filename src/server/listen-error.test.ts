import { createServer } from 'node:net';
import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp, type App } from './app.js';
import { attachWebSocket, type WsHub } from './ws.js';
import { formatListenError } from './listen-error.js';
import { TrackerStore } from '../state/store.js';

describe('formatListenError', () => {
  it('explains EADDRINUSE with the port and a recovery hint', () => {
    const msg = formatListenError({ code: 'EADDRINUSE' }, 8080);
    expect(msg).toContain('8080');
    expect(msg).toContain('already');
  });

  it('returns null for other errors so they propagate', () => {
    expect(formatListenError({ code: 'EACCES' }, 8080)).toBeNull();
    expect(formatListenError(new Error('boom'), 8080)).toBeNull();
  });
});

describe('occupied port handling', () => {
  let blocker: ReturnType<typeof createServer>;
  let port: number;
  let store: TrackerStore;
  let app: App;
  let hub: WsHub;

  beforeEach(async () => {
    blocker = createServer();
    blocker.listen(0, '127.0.0.1');
    await once(blocker, 'listening');
    const addr = blocker.address();
    if (typeof addr === 'string' || addr === null) throw new Error('no address');
    port = addr.port;
    store = new TrackerStore();
    app = buildApp({ store });
    hub = attachWebSocket(app.server, store);
  });
  afterEach(async () => {
    hub.close();
    await app.close().catch(() => undefined);
    store.dispose();
    blocker.close();
  });

  it('rejects listen without crashing the process via the ws server', async () => {
    await expect(app.listen({ port, host: '127.0.0.1' })).rejects.toMatchObject({
      code: 'EADDRINUSE',
    });
    // Reaching this line means the WebSocketServer error did not crash us.
  });
});
