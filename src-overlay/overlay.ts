// OBS browser-source overlay client. Renders deck/track state pushed over WebSocket.
// All track metadata is untrusted: only ever assigned via textContent, never innerHTML.
import { camelotCompatible, eqOffsetPercent, formatDeckBpm, formatTitle, isEnding } from './format.js';

interface Track {
  title: string;
  artist: string;
  mix: string;
  bpm: number | null;
  tempo: number | null;
  resultingKey: string;
  trackLength: number | null;
  artUrl?: string;
}

interface Deck {
  track: Track | null;
  isPlaying: boolean;
  isLooping: boolean;
  isKeyLockOn: boolean;
  onAir: boolean;
  elapsedTime: number;
}

interface Mixer {
  channels: { eq: { high: number; mid: number; low: number } }[];
}

interface HistoryEntry {
  title: string;
  artist: string;
}

type DeckId = 'A' | 'B' | 'C' | 'D';

interface Snapshot {
  decks: Record<DeckId, Deck>;
  history: HistoryEntry[];
  masterClock: { deck: DeckId | null; bpm: number | null };
  mixer: Mixer;
}

const DECKS: readonly DeckId[] = ['A', 'B', 'C', 'D'];
const THEMES = ['dark', 'paper', 'grey'] as const;
const THEME_KEY = 'trackid-theme';

const root = document.getElementById('overlay-root') as HTMLDivElement;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent: HTMLElement,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  parent.appendChild(node);
  return node;
}

// --- view + theme ------------------------------------------------------------
const params = new URLSearchParams(location.search);
const view = params.get('view') ?? 'all';
document.body.dataset.view = ['now', 'decks', 'history', 'all'].includes(view) ? view : 'all';

function initTheme(): void {
  const urlTheme = params.get('theme');
  const saved = localStorage.getItem(THEME_KEY);
  const isValid = (t: string | null): t is string =>
    t !== null && [...THEMES, 'transparent'].includes(t);
  document.body.dataset.theme = isValid(urlTheme) ? urlTheme : isValid(saved) ? saved : 'dark';

  const toggle = document.createElement('button');
  toggle.id = 'theme-toggle';
  toggle.textContent = document.body.dataset.theme;
  toggle.addEventListener('click', () => {
    const current = document.body.dataset.theme ?? 'dark';
    const idx = (THEMES as readonly string[]).indexOf(current);
    const next = THEMES[(idx + 1) % THEMES.length] ?? 'dark';
    document.body.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
    toggle.textContent = next;
  });
  document.body.appendChild(toggle);
}
initTheme();

// --- static skeleton ----------------------------------------------------------
const heroesBox = el('div', '', root);
heroesBox.id = 'heroes';

const deckGrid = el('div', 'decks', root);
const deckEls = DECKS.map((letter) => {
  const card = el('div', 'deck card', deckGrid);
  const head = el('div', 'head', card);
  el('div', 'letter', head).textContent = letter;
  const compat = el('div', 'compat', head);
  compat.title = 'key compatible with the on-air track';
  const loopTag = el('div', 'tag', head);
  loopTag.textContent = 'LOOP';
  loopTag.style.display = 'none';
  const keyLockTag = el('div', 'tag', head);
  keyLockTag.textContent = 'KEY LOCK';
  keyLockTag.style.display = 'none';
  const stats = el('div', 'stats', head);
  const eq = el('div', 'eq', head);
  const eqBars = (['high', 'mid', 'low'] as const).map(() => {
    const track = document.createElement('span');
    const fill = document.createElement('i');
    track.appendChild(fill);
    eq.appendChild(track);
    return fill;
  });
  const body = el('div', 'body', card);
  return { card, stats, body, loopTag, keyLockTag, eqBars };
});

const historyBox = el('div', 'history card', root);
el('h2', '', historyBox).textContent = 'Track History';
const historyList = el('ol', '', historyBox);
historyBox.style.display = 'none';

// --- hero slots -------------------------------------------------------------------
// Fixed 2x2 grid mirroring the deck layout (A B over C D). Slots always hold
// their space; content fades in place when the deck comes on or off air.
interface HeroSlot {
  row: HTMLDivElement;
  art: HTMLImageElement;
  title: HTMLDivElement;
  artist: HTMLDivElement;
  stats: HTMLDivElement;
  badge: HTMLDivElement;
  key: string;
}

function buildHeroSlot(): HeroSlot {
  const row = el('div', 'hero card', heroesBox);
  const art = el('img', 'art', row);
  art.alt = '';
  const meta = el('div', 'meta', row);
  const title = el('div', 'title', meta);
  const artist = el('div', 'artist', meta);
  const stats = el('div', 'stats', row);
  const badge = el('div', 'badge', row);
  return { row, art, title, artist, stats, badge, key: '' };
}
const heroSlots = DECKS.map(buildHeroSlot);

function fillHeroSlot(ui: HeroSlot, deck: Deck, isMaster: boolean): void {
  if (!deck.track) return;
  const key = `${deck.track.artist} ${deck.track.title}`;
  if (key !== ui.key) {
    ui.key = key;
    ui.title.textContent = formatTitle(deck.track.title, deck.track.mix);
    ui.artist.textContent = deck.track.artist || 'Unknown artist';
    if (deck.track.artUrl) {
      ui.art.src = deck.track.artUrl;
      ui.art.style.display = '';
    } else {
      ui.art.removeAttribute('src');
      ui.art.style.display = 'none';
    }
    // Restart the enter transition without rAF (rAF is throttled/suspended
    // in backgrounded OBS browser sources).
    ui.row.classList.remove('visible');
    void ui.row.offsetWidth;
  }
  ui.stats.textContent = statsText(deck.track);
  ui.badge.textContent = isMaster ? 'ON AIR' : 'MIXING';
  ui.badge.classList.toggle('onair', isMaster);
  ui.badge.classList.toggle('mixing', !isMaster);
  ui.row.classList.add('visible');
}

function renderHeroes(snap: Snapshot): void {
  const live = DECKS.filter((id) => {
    const deck = snap.decks[id];
    return deck.onAir && deck.isPlaying && deck.track;
  });
  const master = snap.masterClock.deck;
  const masterId = master !== null && live.includes(master) ? master : live[0] ?? null;
  DECKS.forEach((id, i) => {
    const ui = heroSlots[i];
    if (!ui) return;
    if (live.includes(id)) fillHeroSlot(ui, snap.decks[id], id === masterId);
    else ui.row.classList.remove('visible');
  });
}

// --- deck cards ------------------------------------------------------------------
function statsText(track: Track): string {
  const parts: string[] = [];
  const bpm = formatDeckBpm(track.bpm, track.tempo);
  if (bpm) parts.push(bpm);
  if (track.resultingKey) parts.push(track.resultingKey);
  return parts.join(' | ');
}

type DeckCardUi = (typeof deckEls)[number];

/** Id of the master on-air deck, falling back to the first live deck. */
function masterOnAirDeckId(snap: Snapshot): DeckId | null {
  const isLive = (id: DeckId) => {
    const deck = snap.decks[id];
    return deck.onAir && deck.isPlaying && deck.track !== null;
  };
  const master = snap.masterClock.deck;
  if (master !== null && isLive(master)) return master;
  return DECKS.find(isLive) ?? null;
}

function renderDeckCard(ui: DeckCardUi, deck: Deck, masterKey: string, onAirMaster: boolean): void {
  ui.card.classList.toggle('onair', deck.onAir);
  ui.card.classList.toggle('playing', deck.isPlaying);
  ui.card.classList.toggle('ending', isEnding(deck));
  ui.loopTag.style.display = deck.isLooping ? '' : 'none';
  ui.keyLockTag.style.display = deck.isKeyLockOn ? '' : 'none';
  const compatible =
    !onAirMaster && deck.track !== null && camelotCompatible(deck.track.resultingKey, masterKey);
  ui.card.classList.toggle('compatible', compatible);
  ui.body.replaceChildren();
  if (deck.track) {
    ui.stats.textContent = statsText(deck.track);
    if (deck.track.artUrl) {
      const art = el('img', 'art', ui.body);
      art.alt = '';
      art.src = deck.track.artUrl;
    }
    el('div', 'title', ui.body).textContent = formatTitle(deck.track.title, deck.track.mix);
    el('div', 'artist', ui.body).textContent = deck.track.artist || 'Unknown artist';
  } else {
    ui.stats.textContent = '';
    el('div', 'empty', ui.body).textContent = 'no track loaded';
  }
}

function renderDecks(snap: Snapshot): void {
  const masterId = masterOnAirDeckId(snap);
  const masterKey = masterId ? snap.decks[masterId].track?.resultingKey ?? '' : '';
  DECKS.forEach((letter, i) => {
    const deck = snap.decks[letter];
    const ui = deckEls[i];
    if (!ui) return;
    renderDeckCard(ui, deck, masterKey, letter === masterId);
    const channel = snap.mixer.channels[i];
    if (channel) {
      const values = [channel.eq.high, channel.eq.mid, channel.eq.low];
      ui.eqBars.forEach((fill, j) => {
        const offset = eqOffsetPercent(values[j] ?? 0.5);
        fill.style.height = `${Math.abs(offset) / 2}%`;
        fill.style.bottom = offset >= 0 ? '50%' : `${50 - Math.abs(offset) / 2}%`;
      });
    }
  });
}

// --- history ----------------------------------------------------------------------
let lastHistoryLen = -1;

function renderHistory(snap: Snapshot): void {
  if (snap.history.length === lastHistoryLen) return;
  lastHistoryLen = snap.history.length;
  historyList.replaceChildren();
  for (const entry of snap.history.slice(-10)) {
    const li = document.createElement('li');
    const artist = document.createElement('span');
    artist.className = 'h-artist';
    artist.textContent = entry.artist ? `${entry.artist} - ` : '';
    li.appendChild(artist);
    li.appendChild(document.createTextNode(entry.title || 'Unknown title'));
    historyList.appendChild(li);
  }
  historyBox.style.display = snap.history.length ? '' : 'none';
}

function render(snap: Snapshot): void {
  renderHeroes(snap);
  renderDecks(snap);
  renderHistory(snap);
}

// --- websocket with reconnect --------------------------------------------------------
function connect(): void {
  const ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onmessage = (ev) => {
    let msg: { type: string; state: Snapshot };
    try {
      msg = JSON.parse(String(ev.data)) as { type: string; state: Snapshot };
    } catch (err) {
      console.warn('Failed to parse websocket message; dropping frame and waiting for next update:', err);
      return;
    }
    if (msg.type === 'state') render(msg.state);
  };
  ws.onclose = () => setTimeout(connect, 2000);
  ws.onerror = () => ws.close();
}
connect();
