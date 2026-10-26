import { loadSettings } from '../store/useSettings';
import { phraseDataKey, type CharacterId, type PhraseKey } from './gamePresentation';

/** Restored per-character voice bundles live under /assets/ikout/audio/voices/<id>/<clip>.mp3. */
const BUNDLE_BASE = '/assets/ikout/audio/voices';
const PRELOAD_KEYS = ['welcome', 'partner', 'play', 'ace', 'king', 'surprise', 'kout', 'pass', 'tea', 'win', 'lose', 'taunt'];
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
function clipUrl(characterId: string, dataKey: string): string {
  return `${BUNDLE_BASE}/${characterId}/${dataKey}.mp3`;
}
/** Decode the character's own bundle ahead of time so lines start the instant their event happens. */
export function preloadCharacterVoices(characterId: CharacterId = 'a1') {
  if (typeof window === 'undefined') return;
  const start = () => { PRELOAD_KEYS.forEach(key => void load(clipUrl(characterId, key))); };
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
export function voiceSource(characterId: CharacterId, key: PhraseKey): string {
  return clipUrl(characterId, phraseDataKey(key));
}
/**
 * Plays a situation line from the character's own restored bundle for a seat.
 * `token` ties the voice to its cause (e.g. a card id); `isStillValid` is
 * re-checked right before sound starts so stale lines are skipped.
 */
export function playCharacterVoice(characterId: CharacterId, key: PhraseKey, seat: number, token: string | null = null, isStillValid: () => boolean = () => true) {
  if (typeof window === 'undefined' || !loadSettings().soundEnabled) return;
  const src = voiceSource(characterId, key);
  const requested = performance.now();
  const startBuffer = (buf: AudioBuffer) => {
    const c = context();
    if (!c || !isStillValid() || performance.now() - requested > MAX_VOICE_DELAY_MS) { if (import.meta.env.DEV) logVoice({ key, token, dropped: true, delay: Math.round(performance.now() - requested) }); return; }
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
    if (import.meta.env.DEV) logVoice({ characterId, key, token, delay: Math.round(performance.now() - requested), cards: document.querySelectorAll('.reference-trick-card').length, phase: document.querySelector('.reference-game') ? 'table' : 'other' });
    notify(seat);
  };
  const ready = buffers.get(src);
  if (ready) { startBuffer(ready); return; }
  void load(src).then(buf => { if (buf) startBuffer(buf); });
}

function logVoice(entry: Record<string, unknown>) {
  const w = window as unknown as { __voiceLog?: unknown[] };
  (w.__voiceLog ??= []).push({ ...entry, t: Math.round(performance.now()) });
}
