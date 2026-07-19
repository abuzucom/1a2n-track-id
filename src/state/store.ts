import { EventEmitter } from 'node:events';
import { bool, clamp01, num, str } from './coerce.js';

export type DeckId = 'A' | 'B' | 'C' | 'D';
export const DECK_IDS: readonly DeckId[] = ['A', 'B', 'C', 'D'];

export function isDeckId(v: string): v is DeckId {
  return (DECK_IDS as readonly string[]).includes(v);
}

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
  artUrl?: string;
}

export interface DeckState {
  track: TrackInfo | null;
  isPlaying: boolean;
  isSynced: boolean;
  isLooping: boolean;
  isKeyLockOn: boolean;
  elapsedTime: number;
  onAir: boolean;
  /** Monotonic id incremented on every deckLoaded, distinguishes replays of the same file. */
  loadId: number;
}

export interface EqState {
  high: number;
  mid: number;
  low: number;
}

export interface MixerChannel {
  level: number;
  eq: EqState;
}

export interface MixerState {
  channels: MixerChannel[];
  xfader: number;
  master: { left: number; right: number; sum: number; clip: boolean };
}

export interface HistoryEntry {
  title: string;
  artist: string;
  album: string;
  label: string;
  mix: string;
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
  mixer: MixerState;
}

export type ClientTrackInfo = Omit<TrackInfo, 'filePath'>;
export type ClientHistoryEntry = Omit<HistoryEntry, 'filePath'>;
export interface ClientSnapshot {
  decks: Record<DeckId, Omit<DeckState, 'track'> & { track: ClientTrackInfo | null }>;
  history: ClientHistoryEntry[];
  masterClock: MasterClock;
  mixer: MixerState;
}

function withoutFilePath<T extends { filePath: string }>(obj: T): Omit<T, 'filePath'> {
  const clone: Partial<T> = { ...obj };
  delete clone.filePath;
  return clone as Omit<T, 'filePath'>;
}

/** Strip local file paths before a snapshot leaves the server (username leak). */
export function toClientSnapshot(snap: Snapshot): ClientSnapshot {
  const decks = {} as ClientSnapshot['decks'];
  for (const id of DECK_IDS) {
    const { track, ...rest } = snap.decks[id];
    decks[id] = { ...rest, track: track ? withoutFilePath(track) : null };
  }
  return {
    decks,
    history: snap.history.map(withoutFilePath),
    masterClock: snap.masterClock,
    mixer: snap.mixer,
  };
}

interface StoreOptions {
  historyDebounceMs?: number;
  maxHistory?: number;
}

function emptyDeck(): DeckState {
  return {
    track: null,
    isPlaying: false,
    isSynced: false,
    isLooping: false,
    isKeyLockOn: false,
    elapsedTime: 0,
    onAir: false,
    loadId: 0,
  };
}

function emptyMixer(): MixerState {
  return {
    channels: [0, 1, 2, 3].map(() => ({ level: 0, eq: { high: 0.5, mid: 0.5, low: 0.5 } })),
    xfader: 0.5,
    master: { left: 0, right: 0, sum: 0, clip: false },
  };
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
  private mixer: MixerState = emptyMixer();
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
    // The QML mod re-sends loaded decks periodically so a server started
    // after the track was loaded still converges. An identical track is a
    // refresh: keep loadId (history dedupe), playing state, and art.
    const isRefresh =
      d.track !== null &&
      d.track.title === str(payload.title) &&
      d.track.filePath === str(payload.filePath);
    if (isRefresh) {
      this.emitChange();
      return;
    }
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
    if ('isLooping' in payload) d.isLooping = bool(payload.isLooping);
    if ('isKeyLockOn' in payload) d.isKeyLockOn = bool(payload.isKeyLockOn);
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
    const eq = payload.eq;
    const channel = this.mixer.channels[index - 1];
    if (typeof eq === 'object' && eq !== null && channel) {
      const raw = eq as Record<string, unknown>;
      channel.eq = { high: clamp01(raw.high), mid: clamp01(raw.mid), low: clamp01(raw.low) };
    }
    this.recomputeOnAir(deck);
    this.emitChange();
  }

  updateMixer(payload: Record<string, unknown>): void {
    const channels = Array.isArray(payload.channels) ? payload.channels : [];
    channels.slice(0, 4).forEach((ch, i) => {
      const target = this.mixer.channels[i];
      if (typeof ch === 'object' && ch !== null && target) {
        target.level = clamp01((ch as Record<string, unknown>).level);
      }
    });
    if ('xfader' in payload) this.mixer.xfader = clamp01(payload.xfader);
    const master = payload.master;
    if (typeof master === 'object' && master !== null) {
      const raw = master as Record<string, unknown>;
      this.mixer.master = {
        left: clamp01(raw.left),
        right: clamp01(raw.right),
        sum: clamp01(raw.sum),
        clip: bool(raw.clip),
      };
    }
    this.emitChange();
  }

  setDeckArt(deck: DeckId, artUrl: string): void {
    const d = this.deck(deck);
    if (!d.track || d.track.artUrl === artUrl) return;
    d.track.artUrl = artUrl;
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
      mixer: this.mixer,
    });
  }

  /** Clear all decks, history, and master clock (e.g. purge simulated data). */
  reset(): void {
    for (const t of this.pendingHistory.values()) clearTimeout(t);
    this.pendingHistory.clear();
    this.loggedLoadIds.clear();
    for (const id of DECK_IDS) {
      this.decks[id] = emptyDeck();
      this.channelOnAir[id] = false;
    }
    this.history = [];
    this.masterClock = { deck: null, bpm: null };
    this.mixer = emptyMixer();
    this.emitChange();
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
      mix: d.track.mix,
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
