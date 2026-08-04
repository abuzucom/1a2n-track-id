import { EventEmitter } from 'node:events';
import { bool, clamp01, num, str } from './coerce.js';
import { trackKeyFor } from './track-key.js';

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
  /** Opaque id for a streamed track (e.g. "beatport://tracks/N"); '' for local files. */
  streamingId: string;
  /** Opaque id derived from filePath, for joining to an external library; '' when streamed. */
  trackKey: string;
  bpm: number | null;
  tempo: number | null;
  resultingKey: string;
  keyText: string;
  /** Traktor's analyzed key as 0-23 (0-11 major C..B, 12-23 minor); matches collection.nml. */
  musicalKey: number | null;
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
  /** Pre-fader meter: how loud the track is, not how loud it is in the mix. */
  level: number;
  eq: EqState;
  /** Post-fader contribution to the mix: channel fader attenuated by the crossfader. */
  onAirLevel: number;
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
  genre: string;
  keyText: string;
  musicalKey: number | null;
  trackLength: number | null;
  tempo: number | null;
  streamingId: string;
  trackKey: string;
  /** Which deck aired it. Null only for entries loaded from a pre-0.10.0 file. */
  deck: DeckId | null;
  /** The deck's load id at commit time. Null only for pre-0.10.0 entries. */
  loadId: number | null;
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

/**
 * Version of the GET /state and WebSocket state-message shape, for external
 * consumers (see docs/state-api.md). Bump only on a breaking change; new
 * optional fields do not require a bump.
 */
export const STATE_SCHEMA_VERSION = 1;

export interface ClientSnapshot {
  schemaVersion: number;
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
    schemaVersion: STATE_SCHEMA_VERSION,
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

/** Returns a clean, empty deck state for initialization or resetting. */
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

/** Returns a clean, empty mixer state for initialization or resetting. */
function emptyMixer(): MixerState {
  return {
    channels: [0, 1, 2, 3].map(() => ({
      level: 0,
      eq: { high: 0.5, mid: 0.5, low: 0.5 },
      onAirLevel: 0,
    })),
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
    const deckState = this.deck(deck);
    // The QML mod re-sends loaded decks periodically so a server started
    // after the track was loaded still converges. An identical track is a
    // refresh: keep loadId (history dedupe), playing state, and art.
    // Streamed decks have no filePath, so title plus path alone would treat
    // two different streamed tracks with the same title as a refresh and
    // reuse the load id, which history dedupes on.
    const isRefresh =
      deckState.track !== null &&
      deckState.track.title === str(payload.title) &&
      deckState.track.filePath === str(payload.filePath) &&
      deckState.track.streamingId === str(payload.streamingId);
    if (isRefresh) {
      this.emitChange();
      return;
    }
    deckState.track = {
      title: str(payload.title),
      artist: str(payload.artist),
      album: str(payload.album),
      genre: str(payload.genre),
      label: str(payload.label),
      mix: str(payload.mix),
      remixer: str(payload.remixer),
      comment: str(payload.comment),
      filePath: str(payload.filePath),
      streamingId: str(payload.streamingId),
      trackKey: trackKeyFor(str(payload.filePath)),
      bpm: num(payload.bpm),
      tempo: num(payload.tempo),
      resultingKey: str(payload.resultingKey),
      keyText: str(payload.keyText),
      // Lenient like every other number on this route: Traktor's QML sends
      // some values as strings, and the strict variant silently dropped the
      // key on live decks while passing in tests that posted an integer.
      musicalKey: num(payload.key),
      trackLength: num(payload.trackLength),
    };
    deckState.loadId = this.nextLoadId++;
    deckState.isPlaying = bool(payload.isPlaying);
    deckState.isSynced = bool(payload.isSynced);
    deckState.elapsedTime = num(payload.elapsedTime) ?? 0;
    this.recomputeOnAir(deck);
    this.emitChange();
  }

  updateDeck(deck: DeckId, payload: Record<string, unknown>): void {
    const deckState = this.deck(deck);
    if ('isPlaying' in payload) deckState.isPlaying = bool(payload.isPlaying);
    if ('isSynced' in payload) deckState.isSynced = bool(payload.isSynced);
    if ('isLooping' in payload) deckState.isLooping = bool(payload.isLooping);
    if ('isKeyLockOn' in payload) deckState.isKeyLockOn = bool(payload.isKeyLockOn);
    if ('elapsedTime' in payload) deckState.elapsedTime = num(payload.elapsedTime) ?? deckState.elapsedTime;
    if (deckState.track) {
      if ('tempo' in payload) deckState.track.tempo = num(payload.tempo);
      if ('resultingKey' in payload) deckState.track.resultingKey = str(payload.resultingKey);
    }
    this.recomputeOnAir(deck);
    this.emitChange();
  }

  updateChannel(index: number, payload: Record<string, unknown>): void {
    const deck = DECK_IDS[index - 1];
    if (!deck) throw new RangeError(`invalid channel index: ${index}`);
    if ('isOnAir' in payload) this.channelOnAir[deck] = bool(payload.isOnAir);
    const channel = this.mixer.channels[index - 1];
    if ('onAirLevel' in payload && channel) channel.onAirLevel = clamp01(payload.onAirLevel);
    const eq = payload.eq;
    if (typeof eq === 'object' && eq !== null && channel) {
      const raw = eq as Record<string, unknown>;
      channel.eq = { high: clamp01(raw.high), mid: clamp01(raw.mid), low: clamp01(raw.low) };
    }
    this.recomputeOnAir(deck);
    this.emitChange();
  }

  updateMixer(payload: Record<string, unknown>): void {
    const channels = Array.isArray(payload.channels) ? payload.channels : [];
    channels.slice(0, 4).forEach((channelPayload, i) => {
      const target = this.mixer.channels[i];
      if (typeof channelPayload === 'object' && channelPayload !== null && target) {
        target.level = clamp01((channelPayload as Record<string, unknown>).level);
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
    const deckState = this.deck(deck);
    if (!deckState.track || deckState.track.artUrl === artUrl) return;
    deckState.track.artUrl = artUrl;
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
    for (const timer of this.pendingHistory.values()) clearTimeout(timer);
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
    for (const timer of this.pendingHistory.values()) clearTimeout(timer);
    this.pendingHistory.clear();
    this.removeAllListeners();
  }

  private deck(deck: DeckId): DeckState {
    const deckState = this.decks[deck];
    if (!deckState) throw new RangeError(`invalid deck id: ${String(deck)}`);
    return deckState;
  }

  private recomputeOnAir(deck: DeckId): void {
    const deckState = this.deck(deck);
    const onAir = Boolean(deckState.track) && deckState.isPlaying && this.channelOnAir[deck];
    if (onAir === deckState.onAir) return;
    deckState.onAir = onAir;

    const pending = this.pendingHistory.get(deck);
    if (pending) {
      clearTimeout(pending);
      this.pendingHistory.delete(deck);
    }
    if (onAir && deckState.track && !this.loggedLoadIds.has(this.loadKey(deck))) {
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
    const deckState = this.deck(deck);
    // Deck may have been reloaded while the timer was pending.
    if (!deckState.track || !deckState.onAir || this.loadKey(deck) !== loadKey) return;
    this.loggedLoadIds.add(loadKey);
    this.history.push({
      title: deckState.track.title,
      artist: deckState.track.artist,
      album: deckState.track.album,
      label: deckState.track.label,
      mix: deckState.track.mix,
      filePath: deckState.track.filePath,
      bpm: deckState.track.bpm,
      resultingKey: deckState.track.resultingKey,
      playedAt: new Date().toISOString(),
      genre: deckState.track.genre,
      keyText: deckState.track.keyText,
      musicalKey: deckState.track.musicalKey,
      trackLength: deckState.track.trackLength,
      tempo: deckState.track.tempo,
      streamingId: deckState.track.streamingId,
      trackKey: deckState.track.trackKey,
      deck,
      loadId: deckState.loadId,
    });
    if (this.history.length > this.maxHistory) this.history = this.history.slice(-this.maxHistory);
    this.emitChange();
  }

  private emitChange(): void {
    this.emit('change', this.snapshot());
  }
}
