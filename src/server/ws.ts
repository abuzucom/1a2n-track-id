import { EventEmitter } from 'node:events';
import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { Snapshot, TrackerStore } from '../state/store.js';

export class WsHub extends EventEmitter<{ clients: [number] }> {
  private readonly wss: WebSocketServer;
  private readonly onChange: (snap: Snapshot) => void;

  constructor(server: Server, private readonly store: TrackerStore) {
    super();
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.wss.on('connection', (ws) => {
      ws.send(this.message(store.snapshot()));
      this.emit('clients', this.clientCount);
      ws.on('close', () => this.emit('clients', this.clientCount));
      ws.on('error', () => ws.close());
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
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    }
  }

  private message(snap: Snapshot): string {
    return JSON.stringify({ type: 'state', state: snap });
  }
}

export function attachWebSocket(server: Server, store: TrackerStore): WsHub {
  return new WsHub(server, store);
}
