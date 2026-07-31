import { EventEmitter } from 'node:events';
import type { IncomingMessage, Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { toClientSnapshot, type Snapshot, type TrackerStore } from '../state/store.js';
import { isLoopbackHost } from './host-guard.js';

const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/**
 * WebSockets bypass CORS: any web page could otherwise connect to the local
 * endpoint and read live snapshots. Allow only local origins, plus clients
 * that send no Origin header (non-browser tools; browsers always send one).
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (origin === undefined) return true;
  try {
    return LOCAL_HOSTNAMES.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

export class WsHub extends EventEmitter<{ clients: [number] }> {
  private readonly wss: WebSocketServer;
  private readonly onChange: (snap: Snapshot) => void;

  constructor(server: Server, private readonly store: TrackerStore) {
    super();
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
      // The upgrade is served off the raw http server, so Fastify's own
      // onRequest host guard never sees it; both checks are applied here.
      verifyClient: ({ req }: { req: IncomingMessage }) =>
        isLoopbackHost(req.headers.host) && isAllowedOrigin(req.headers.origin),
    });
    // Without a handler the wss re-emits http server errors (e.g. EADDRINUSE)
    // as unhandled 'error' events and crashes the process with a stack dump.
    this.wss.on('error', (err) => {
      console.error('websocket server error:', err.message);
    });
    this.wss.on('connection', (ws) => {
      ws.send(this.message(store.snapshot()), (err) => {
        if (err) console.error('websocket initial send failed:', err.message);
      });
      this.emit('clients', this.clientCount);
      ws.on('close', () => this.emit('clients', this.clientCount));
      ws.on('error', (err) => {
        console.error('websocket client error:', err.message);
        ws.close();
      });
    });
    this.onChange = (snap) => this.broadcast(snap);
    store.on('change', this.onChange);
  }

  get clientCount(): number {
    return this.wss.clients.size;
  }

  close(): void {
    this.store.off('change', this.onChange);
    for (const client of this.wss.clients) client.terminate();
    this.wss.close();
    this.removeAllListeners();
  }

  private broadcast(snap: Snapshot): void {
    const msg = this.message(snap);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg, (err) => {
          if (err) console.error('websocket broadcast send failed:', err.message);
        });
      }
    }
  }

  private message(snap: Snapshot): string {
    return JSON.stringify({ type: 'state', state: toClientSnapshot(snap) });
  }
}

export function attachWebSocket(server: Server, store: TrackerStore): WsHub {
  return new WsHub(server, store);
}
