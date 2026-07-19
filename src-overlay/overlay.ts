// OBS browser-source overlay client. Renders deck/track state pushed over WebSocket.
// All track metadata is untrusted: only ever assigned via textContent, never innerHTML.
import { camelotCompatible, eqOffsetPercent, formatTitle, isEnding } from './format.js';
import {
  DECKS,
  EQ_BANDS,
  THEMES,
  masterOnAirDeckId,
  resolveTheme,
  statsText,
  type Deck,
  type Mixer,
  type Snapshot,
} from './overlay-logic.js';

const THEME_KEY = 'trackid-theme';
const WS_RECONNECT_DELAY_MS = 2000;
const HISTORY_DISPLAY_LIMIT = 10;

function readStoredTheme(): string | null {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch (err) {
    console.warn('theme storage unavailable, using default theme:', err);
    return null;
  }
}

function storeTheme(theme: string): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (err) {
    console.warn('theme storage unavailable, theme choice will not persist:', err);
  }
}

const rootEl = document.getElementById('overlay-root');
if (!(rootEl instanceof HTMLDivElement)) {
  throw new Error('overlay-root element missing; overlay cannot render');
}
const root = rootEl;

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

/**
 * Compact H/M/L EQ meter, floated left so it sits beside the title/artist
 * text at the same height rather than its own banner row.
 */
function renderEqMeter(parent: HTMLElement, channel: Mixer['channels'][number] | undefined): void {
  const eq = el('div', 'eq', parent);
  for (const band of EQ_BANDS) {
    const col = el('div', 'eq-col', eq);
    const track = el('span', 'eq-track', col);
    const fill = document.createElement('i');
    track.appendChild(fill);
    el('span', 'eq-label', col).textContent = band.charAt(0).toUpperCase();
    const offset = eqOffsetPercent(channel ? channel.eq[band] : 0.5);
    fill.style.height = `${Math.abs(offset) / 2}%`;
    fill.style.bottom = offset >= 0 ? '50%' : `${50 - Math.abs(offset) / 2}%`;
  }
}

/** Show or hide an <img> based on whether a track has cover art. */
function setArtVisibility(img: HTMLImageElement, artUrl: string | undefined): void {
  if (artUrl) {
    img.src = artUrl;
    img.style.display = '';
  } else {
    img.removeAttribute('src');
    img.style.display = 'none';
  }
}

/**
 * Set text on a title/artist box, marquee-scrolling it via CSS animation if
 * it overflows the box. No <marquee> and no rAF (OBS suspends rAF in
 * backgrounded browser sources): the animation runs on the compositor and
 * the overflow check is a one-time synchronous layout read.
 */
function setMarqueeText(container: HTMLElement, text: string): void {
  container.textContent = '';
  const span = document.createElement('span');
  span.className = 'marquee-text';
  span.textContent = text;
  container.appendChild(span);
  const overflow = span.scrollWidth - container.clientWidth;
  if (overflow > 0) {
    container.style.setProperty('--marquee-shift', `${-overflow}px`);
    container.classList.add('marquee');
  } else {
    container.style.removeProperty('--marquee-shift');
    container.classList.remove('marquee');
  }
}

// --- view + theme ------------------------------------------------------------
const params = new URLSearchParams(location.search);
const view = params.get('view') ?? 'all';
document.body.dataset.view = ['now', 'decks', 'history', 'all'].includes(view) ? view : 'all';

function initTheme(): void {
  const theme = resolveTheme(params.get('theme'), readStoredTheme());
  document.body.dataset.theme = theme;

  const toggle = document.createElement('button');
  toggle.id = 'theme-toggle';
  toggle.textContent = document.body.dataset.theme ?? 'dark';
  toggle.addEventListener('click', () => {
    const current = document.body.dataset.theme ?? 'dark';
    const idx = (THEMES as readonly string[]).indexOf(current);
    const next = THEMES[(idx + 1) % THEMES.length] ?? 'dark';
    document.body.dataset.theme = next;
    storeTheme(next);
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
  const body = el('div', 'body', card);
  return { card, stats, body, loopTag, keyLockTag };
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
  const badge = el('div', 'badge onair', row);
  badge.textContent = 'ON AIR';
  return { row, art, title, artist, stats, key: '' };
}
const heroSlots = DECKS.map(buildHeroSlot);

function fillHeroSlot(ui: HeroSlot, deck: Deck): void {
  if (!deck.track) return;
  const key = `${deck.track.artist} ${deck.track.title}`;
  if (key !== ui.key) {
    ui.key = key;
    setMarqueeText(ui.title, formatTitle(deck.track.title, deck.track.mix));
    setMarqueeText(ui.artist, deck.track.artist || 'Unknown artist');
    setArtVisibility(ui.art, deck.track.artUrl);
    // Restart the enter transition without rAF (rAF is throttled/suspended
    // in backgrounded OBS browser sources).
    ui.row.classList.remove('visible');
    void ui.row.offsetWidth;
  }
  ui.stats.textContent = statsText(deck.track);
  ui.row.classList.add('visible');
}

function renderHeroes(snap: Snapshot): void {
  DECKS.forEach((id, i) => {
    const ui = heroSlots[i];
    if (!ui) return;
    const deck = snap.decks[id];
    if (deck.onAir && deck.isPlaying && deck.track) fillHeroSlot(ui, deck);
    else ui.row.classList.remove('visible');
  });
}

// --- deck cards ------------------------------------------------------------------
type DeckCardUi = (typeof deckEls)[number];

function renderDeckCard(
  ui: DeckCardUi,
  deck: Deck,
  masterKey: string,
  onAirMaster: boolean,
  channel: Mixer['channels'][number] | undefined,
): void {
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
    renderEqMeter(ui.body, channel);
    if (deck.track.artUrl) {
      const art = el('img', 'art', ui.body);
      art.alt = '';
      art.src = deck.track.artUrl;
    }
    setMarqueeText(el('div', 'title', ui.body), formatTitle(deck.track.title, deck.track.mix));
    setMarqueeText(el('div', 'artist', ui.body), deck.track.artist || 'Unknown artist');
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
    renderDeckCard(ui, deck, masterKey, letter === masterId, snap.mixer.channels[i]);
  });
}

// --- history ----------------------------------------------------------------------
let lastHistoryLen = -1;

function renderHistory(snap: Snapshot): void {
  if (snap.history.length === lastHistoryLen) return;
  lastHistoryLen = snap.history.length;
  historyList.replaceChildren();
  for (const entry of snap.history.slice(-HISTORY_DISPLAY_LIMIT)) {
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
  ws.onclose = () => setTimeout(connect, WS_RECONNECT_DELAY_MS);
  ws.onerror = () => ws.close();
}
connect();
