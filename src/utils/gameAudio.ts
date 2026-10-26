import { loadSettings } from "../store/useSettings";

/**
 * Unified WebAudio engine for iKout:
 * - ONE AudioContext, created lazily and unlocked on the first user gesture.
 * - ALL sounds pre-decoded into AudioBuffers: starting one is ~0ms (ctx.currentTime).
 * - Two channels: 'sfx' (card snaps, chimes — stackable, ducked under voice)
 *   and 'voice' (character lines — exclusive, newest wins, stale tokens dropped).
 */

export type SfxName = "card" | "trump" | "pass";

type PlayHandle = { stop: () => void };

let ctx: AudioContext | null = null;
let masterSfx: GainNode | null = null;
const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer | null>>();
let unlocked = false;
let voiceActive = 0;

// Voice channel: only one line at a time
let currentVoice: { handle: PlayHandle; token: string | null } | null = null;
// SFX throttle: identical sound never twice within the window
const lastSfxAt = new Map<string, number>();

export function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const C =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    masterSfx = ctx.createGain();
    masterSfx.gain.value = 1;
    masterSfx.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Call once at app start; completes unlock on the first user gesture (iOS/WebView). */
export function installAudioUnlock() {
  if (typeof window === "undefined" || unlocked) return;
  unlocked = true;
  const unlock = () => {
    const c = ensureContext();
    if (c && c.state === "suspended") void c.resume();
  };
  window.addEventListener("pointerdown", unlock, { once: true, capture: true });
  window.addEventListener("keydown", unlock, { once: true, capture: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) unlock();
  });
}

export function preloadBuffers(urls: string[]) {
  ensureContext();
  urls.forEach((url) => void load(url));
}

function load(src: string): Promise<AudioBuffer | null> {
  const cached = buffers.get(src);
  if (cached) return Promise.resolve(cached);
  let pending = loading.get(src);
  if (!pending) {
    const c = ensureContext();
    pending = !c
      ? Promise.resolve(null)
      : fetch(src)
          .then((r) => r.arrayBuffer())
          .then((b) => c.decodeAudioData(b))
          .then((buf) => {
            buffers.set(src, buf);
            return buf;
          })
          .catch(() => null);
    loading.set(src, pending);
  }
  return pending;
}

export function bufferReady(src: string): boolean {
  return buffers.has(src);
}

export function isBufferReady(src: string): boolean {
  return buffers.has(src);
}

export function getBuffer(src: string): AudioBuffer | null {
  return buffers.get(src) ?? null;
}

export function loadBuffer(src: string): Promise<AudioBuffer | null> {
  return load(src);
}

/** Plays a decoded buffer with ~zero latency (scheduling is native WebAudio). */
export function playBuffer(
  src: string,
  opts: {
    channel?: "sfx" | "voice";
    volume?: number;
    rate?: number;
    throttleMs?: number;
    token?: string | null;
    isStillValid?: () => boolean;
    onEnd?: () => void;
  } = {},
): PlayHandle | null {
  if (typeof window === "undefined" || !loadSettings().soundEnabled) return null;
  const c = ensureContext();
  if (!c) return null;

  const channel = opts.channel ?? "sfx";
  const throttleMs = opts.throttleMs ?? 0;
  if (throttleMs > 0) {
    const now = performance.now();
    const last = lastSfxAt.get(src) ?? -Infinity;
    if (now - last < throttleMs) return null;
    lastSfxAt.set(src, now);
  }

  const buf = buffers.get(src);
  if (!buf) return null; // never fetch synchronously — preload instead
  if (opts.isStillValid && !opts.isStillValid()) return null;

  const node = c.createBufferSource();
  const gain = c.createGain();
  node.buffer = buf;
  node.playbackRate.value = opts.rate ?? 1;
  gain.gain.value = opts.volume ?? 0.9;

  if (channel === "voice") {
    stopVoice();
    voiceActive = 1;
    // Duck SFX while a character speaks so the two never fight.
    if (masterSfx) {
      masterSfx.gain.cancelScheduledValues(c.currentTime);
      masterSfx.gain.setTargetAtTime(0.4, c.currentTime, 0.05);
    }
    node.onended = () => {
      voiceActive = 0;
      if (masterSfx) masterSfx.gain.setTargetAtTime(1, c.currentTime, 0.15);
      opts.onEnd?.();
    };
  } else {
    node.connect(gain).connect(masterSfx ?? c.destination);
  }

  const handle: PlayHandle = {
    stop: () => {
      node.onended = null;
      try {
        node.stop();
      } catch {
        /* already stopped */
      }
    },
  };
  node.connect(gain);
  if (channel === "voice") {
    gain.connect(c.destination);
    currentVoice = { handle, token: opts.token ?? null };
  }
  node.start();
  return handle;
}

function stopVoice() {
  if (currentVoice) {
    currentVoice.handle.stop();
    currentVoice = null;
  }
}

export function stopVoiceByToken(token?: string) {
  if (currentVoice) {
    if (!token || currentVoice.token === token) {
      currentVoice.handle.stop();
      currentVoice = null;
    }
  }
}

export function stopAllAudio() {
  stopVoice();
  // SFX nodes are fire-and-forget; stopping the context ramp is enough.
}

/** Short synthesized chime/fanfare routed through the SAME context & ducking. */
export function playTone(
  notes: { freq: number; at: number; dur: number; vol: number; type?: OscillatorType }[],
) {
  const c = ensureContext();
  if (!c || !loadSettings().soundEnabled) return;
  const now = c.currentTime;
  for (const n of notes) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    const t = now + n.at;
    osc.type = n.type ?? "sine";
    osc.frequency.setValueAtTime(n.freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(n.vol, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + n.dur);
    osc.connect(gain).connect(masterSfx ?? c.destination);
    osc.start(t);
    osc.stop(t + n.dur + 0.05);
  }
}
