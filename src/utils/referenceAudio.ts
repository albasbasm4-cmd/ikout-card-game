import { loadSettings } from '../store/useSettings';
import { stopCharacterVoice } from './characterAudio';

/**
 * Small synthesized table effects (card snap, slam fanfare, pass whoosh).
 * The old sampled effect files were removed with the pre-restoration assets;
 * these WebAudio stand-ins keep the same triggers without audio downloads.
 */
let voice: HTMLAudioElement | null = null;
const effects = new Set<HTMLAudioElement>();
export function stopReferenceAudio() {
  stopCharacterVoice();
  voice?.pause();
  voice = null;
  effects.forEach(audio => audio.pause());
  effects.clear();
}

let ctx: AudioContext | null = null;
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
function noise(duration: number, filterFreq: number, gainValue: number, sweepTo?: number) {
  const c = context();
  if (!c) return;
  const frames = Math.max(1, Math.floor(c.sampleRate * duration));
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = filterFreq;
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, c.currentTime + duration);
  const gain = c.createGain();
  gain.gain.value = gainValue;
  src.connect(filter).connect(gain).connect(c.destination);
  src.start();
}
function blip(freq: number, duration: number, gainValue: number, when = 0) {
  const c = context();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(gainValue, c.currentTime + when);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + when + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(c.currentTime + when);
  osc.stop(c.currentTime + when + duration + 0.05);
}
export function playReferenceAudio(kind: 'pass' | 'card' | 'slam') {
  if (typeof window === 'undefined' || !loadSettings().soundEnabled) return;
  if (kind !== 'pass' && !loadSettings().cardPlacementSoundEnabled) return;
  if (!context()) return;
  if (kind === 'card') noise(0.05, 2600, 0.5);
  else if (kind === 'pass') noise(0.35, 900, 0.35, 250);
  else { blip(392, 0.14, 0.22); blip(523, 0.14, 0.22, 0.12); blip(659, 0.3, 0.25, 0.24); }
}
