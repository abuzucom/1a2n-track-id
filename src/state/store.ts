import { EventEmitter } from 'node:events';

export type DeckId = 'A' | 'B' | 'C' | 'D';
export const DECK_IDS: readonly DeckId[] = ['A', 'B', 'C', 'D'];

export interface TrackInfo {
  title: string;
  artist: string;
  album: string;
  genre: string;
  label: string;
  mix: string;
  remixer: string;
  comment: string;
  filePath: string;
  bpm: number | null;
  tempo: number | null;
  resultingKey: string;
  keyText: string;
  trackLength: number | null;
}

export interface DeckState {
  track: TrackInfo | null;
  isPlaying: boolean;
  isSynced: boolean;
  elapsedTime: number;
  onAir: boolean;
  /** Monotonic id incremented on every deckLoaded, distinguishes replays of the same file. */
  loadId: number;
}

export interface HistoryEntry {
  title: string;
  artist: string;
  album: string;
  label: string;
  filePath: string;
  bpm: number | null;
  resultingKey: string;
  playedAt: string;
}

export interface MasterClock {
  deck: DeckId | null;
  bpm: number | null;
}

export interface Snapshot {
  decks: Record<DeckId, DeckState>;
  history: HistoryEntry[];
  masterClock: MasterClock;
}

interface StoreOptions {
  historyDebounceMs?: number;
  maxHistory?: number;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const bool = (v: unknown): boolean => v === true || v === 'true' || v === 1;

function emptyDeck(): DeckState {
  return { track: null, isPlaying: false, isSynced: false, elapsedTime: 0, onAir: false, loadId: 0 };
}

export class TrackerStore extends EventEmitter<{ change: [Snapshot] }> {
  private readonly decks: Record<DeckId, DeckState> = {
    A: emptyDeck(),
    B: emptyDeck(),
    C: emptyDeck(),
    D: emptyDeck(),
  };
  private readonly channelOnAir: Record<DeckId, boolean> = { A: false, B: false, C: false, D: false };
  private history: HistoryEntry[] = [];
  private masterClock: MasterClock = { deck: null, bpm: null };
  private readonly debounceMs: number;
  private readonly maxHistory: number;
  private readonly pendingHistory = new Map<DeckId, NodeJS.Timeout>();
  /** loadIds already committed to history, so a re-air of the same load is not duplicated. */
  private readonly loggedLoadIds = new Set<string>();
  private nextLoadId = 1;

  constructor(opts: StoreOptions = {}) {
    super();
    this.debounceMs = opts.historyDebounceMs ?? 10_000;
    this.maxHistory = opts.maxHistory ?? 100;
  }

  deckLoaded(deck: DeckId, payload: Record<string, unknown>): void {
    const d = this.deck(deck);
    d.track = {
      title: str(payload.title),
      artist: str(payload.artist),
      album: str(payload.album),
      genre: str(payload.genre),
      label: str(payload.label),
      mix: str(payload.mix),
      remixer: str(payload.remixer),
      comment: str(payload.comment),
      filePath: str(payload.filePath),
      bpm: num(payload.bpm),
      tempo: num(payload.tempo),
      resultingKey: str(payload.resultingKey),
      keyText: str(payload.keyText),
      trackLength: num(payload.trackLength),
    };
    d.loadId = this.nextLoadId++;
    d.isPlaying = bool(payload.isPlaying);
    d.isSynced = bool(payload.isSynced);
    d.elapsedTime = num(payload.elapsedTime) ?? 0;
    this.recomputeOnAir(deck);
    this.emitChange();
  }

  updateDeck(deck: DeckId, payload: Record<string, unknown>): void {
    const d = this.deck(deck);
    if ('isPlaying' in payload) d.isPlaying = bool(payload.isPlaying);
    if ('isSynced' in payload) d.isSynced = bool(payload.isSynced);
    if ('elapsedTime' in payload) d.elapsedTime = num(payload.elapsedTime) ?? d.elapsedTime;
    if (d.track) {
      if ('tempo' in payload) d.track.tempo = num(payload.tempo);
      if ('resultingKey' in payload) d.track.resultingKey = str(payload.resultingKey);
    }
    this.recomputeOnAir(deck);
    this.emitChange();
  }

  updateChannel(index: number, payload: Record<string, unknown>): void {
    const deck = DECK_IDS[index - 1];
    if (!deck) throw new RangeError(`invalid channel index: ${index}`);
    if ('isOnAir' in payload) this.channelOnAir[deck] = bool(payload.isOnAir);
    this.recomputeOnAir(deck);
    this.emitChange();
  }

  updateMasterClock(payload: Record<string, unknown>): void {
    const deck = str(payload.deck) as DeckId;
    this.masterClock = {
      deck: DECK_IDS.includes(deck) ? deck : null,
      bpm: num(payload.bpm),
    };
    this.emitChange();
  }

  snapshot(): Snapshot {
    return structuredClone({
      decks: this.decks,
      history: this.history,
      masterClock: this.masterClock,
    });
  }

  loadHistory(entries: HistoryEntry[]): void {
    this.history = entries.slice(-this.maxHistory);
    this.emitChange();
  }

  dispose(): void {
    for (const t of this.pendingHistory.values()) clearTimeout(t);
    this.pendingHistory.clear();
    this.removeAllListeners();
  }

  private deck(deck: DeckId): DeckState {
    const d = this.decks[deck];
    if (!d) throw new RangeError(`invalid deck id: ${String(deck)}`);
    return d;
  }

  private recomputeOnAir(deck: DeckId): void {
    const d = this.deck(deck);
    const onAir = Boolean(d.track) && d.isPlaying && this.channelOnAir[deck];
    if (onAir === d.onAir) return;
    d.onAir = onAir;

    const pending = this.pendingHistory.get(deck);
    if (pending) {
      clearTimeout(pending);
      this.pendingHistory.delete(deck);
    }
    if (onAir && d.track && !this.loggedLoadIds.has(this.loadKey(deck))) {
      const loadKey = this.loadKey(deck);
      const timer = setTimeout(() => {
        this.pendingHistory.delete(deck);
        this.commitHistory(deck, loadKey);
      }, this.debounceMs);
      this.pendingHistory.set(deck, timer);
    }
  }

  private loadKey(deck: DeckId): string {
    return `${deck}:${this.deck(deck).loadId}`;
  }

  private commitHistory(deck: DeckId, loadKey: string): void {
    const d = this.deck(deck);
    // Deck may have been reloaded while the timer was pending.
    if (!d.track || !d.onAir || this.loadKey(deck) !== loadKey) return;
    this.loggedLoadIds.add(loadKey);
    this.history.push({
      title: d.track.title,
      artist: d.track.artist,
      album: d.track.album,
      label: d.track.label,
      filePath: d.track.filePath,
      bpm: d.track.bpm,
      resultingKey: d.track.resultingKey,
      playedAt: new Date().toISOString(),
    });
    if (this.history.length > this.maxHistory) this.history = this.history.slice(-this.maxHistory);
    this.emitChange();
  }

  private emitChange(): void {
    this.emit('change', this.snapshot());
  }
}
