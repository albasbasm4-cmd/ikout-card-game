import pass from '../assets/gameplay/pass-two.mp3.asset.json';
import { loadSettings } from '../store/useSettings';
import { CHARACTER_PHRASES, RESULT_LINES, SPECIAL_LINES } from './gamePresentation';

const assets = import.meta.glob<{ url: string }>('../assets/voices/*.asset.json', { eager: true, import: 'default' });
const phraseKeys = ['partner', 'play', 'ace', 'king', 'surprise', 'kout', 'pass-taunt', 'tea'];
/** A voice that cannot start within this window is dropped instead of playing late. */
export const MAX_VOICE_DELAY_MS = 250;

let ctx: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer | null>>();
let current: { stop: () => void; token: string | null } | null = null;
let activeSeat: number | null = null;
const listeners = new Set<(seat: number | null) => void>();

function notify(seat: number | null) { activeSeat = seat; listeners.forEach(listener => listener(seat)); }
export function subscribeCharacterVoice(listener: (seat: number | null) => void) {
  listeners.add(listener);
  listener(activeSeat);
  return () => { listeners.delete(listener); };
}
function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}
function load(src: string): Promise<AudioBuffer | null> {
  const cached = buffers.get(src);
  if (cached) return Promise.resolve(cached);
  let pending = loading.get(src);
  if (!pending) {
    const c = context();
    pending = !c ? Promise.resolve(null) : fetch(src).then(r => r.arrayBuffer()).then(b => c.decodeAudioData(b)).then(buf => { buffers.set(src, buf); return buf; }).catch(() => null);
    loading.set(src, pending);
  }
  return pending;
}
function allSources(): string[] {
  return [pass.url, ...Object.values(assets).map(a => a.url)];
}
/** Decode every voice ahead of time so lines start the instant their event happens. */
export function preloadCharacterVoices() {
  if (typeof window === 'undefined') return;
  const start = () => { allSources().forEach(src => void load(src)); };
  start();
  const unlock = () => { context(); start(); };
  window.addEventListener('pointerdown', unlock, { once: true });
}
export function stopCharacterVoice(token?: string) {
  if (!current) return;
  if (token !== undefined && current.token !== token) return;
  current.stop();
  current = null;
  notify(null);
}
export function voiceKey(message: string): string | null {
  const index = CHARACTER_PHRASES.indexOf(message);
  if (index >= 0) return phraseKeys[index];
  for (const [key, line] of Object.entries(SPECIAL_LINES)) if (message === line) return key;
  if (message === RESULT_LINES.win) return 'win';
  if (message === RESULT_LINES.lose) return 'lose';
  if (message === RESULT_LINES.opponent) return 'opponent-win';
  const bid = /^طلب ([5-9])$/.exec(message);
  if (bid) return `bid${bid[1]}`;
  if (message.startsWith('الأمر:')) {
    if (message.includes('هاص')) return 'H';
    if (message.includes('سبيت')) return 'S';
    if (message.includes('ديمن')) return 'D';
    if (message.includes('كلفس')) return 'C';
  }
  return null;
}
export function voiceSource(message: string): string | undefined {
  if (message === 'طاف') return pass.url;
  const key = voiceKey(message);
  return key ? assets[`../assets/voices/${key}.mp3.asset.json`]?.url : undefined;
}
/**
 * Plays a line for a seat. `token` ties the voice to its cause (e.g. a card id);
 * `isStillValid` is re-checked right before sound starts so stale lines are skipped.
 */
export function playCharacterVoice(message: string, seat: number, token: string | null = null, isStillValid: () => boolean = () => true) {
  if (typeof window === 'undefined' || !loadSettings().soundEnabled) return;
  const src = voiceSource(message);
  if (!src) return;
  const requested = performance.now();
  const startBuffer = (buf: AudioBuffer) => {
    const c = context();
    if (!c || !isStillValid() || performance.now() - requested > MAX_VOICE_DELAY_MS) return;
    stopCharacterVoice();
    const node = c.createBufferSource();
    const gain = c.createGain();
    gain.gain.value = 0.9;
    node.buffer = buf;
    node.connect(gain).connect(c.destination);
    const entry = { token, stop: () => { node.onended = null; try { node.stop(); } catch { /* already stopped */ } } };
    node.onended = () => { if (current === entry) { current = null; notify(null); } };
    current = entry;
    node.start();
    notify(seat);
  };
  const ready = buffers.get(src);
  if (ready) { startBuffer(ready); return; }
  void load(src).then(buf => { if (buf) startBuffer(buf); });
}
