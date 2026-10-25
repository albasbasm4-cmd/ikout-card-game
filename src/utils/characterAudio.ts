import { loadSettings } from "../store/useSettings";
import {
  ensureContext,
  installAudioUnlock,
  isBufferReady,
  playBuffer,
  getBuffer,
  loadBuffer,
  stopVoiceByToken,
} from "./gameAudio";
import { gameAudioPreloaded } from "./gameAudioBindings";
import { CHARACTER_PHRASES, RESULT_LINES, SPECIAL_LINES } from "./gamePresentation";

// Official extracted voice assets from iKout mapped to phrases and contexts
const OFFICIAL_VOICES: Record<string, string> = {
  partner: "/assets/ikout/audio/taunt1.mp3",
  play: "/assets/ikout/audio/taunt2.mp3",
  ace: "/assets/ikout/audio/ace.mp3",
  king: "/assets/ikout/audio/hokum_ace.mp3",
  surprise: "/assets/ikout/audio/taunt3.mp3",
  kout: "/assets/ikout/audio/malzoom.mp3",
  "pass-taunt": "/assets/ikout/audio/pass.mp3",
  tea: "/assets/ikout/audio/taunt4.mp3",
  joker: "/assets/ikout/audio/joker.mp3",
  maker: "/assets/ikout/audio/joker.mp3",
  "trump-ace": "/assets/ikout/audio/hokum_ace.mp3",
  win: "/assets/ikout/audio/win.mp3",
  lose: "/assets/ikout/audio/loss.mp3",
  "opponent-win": "/assets/ikout/audio/taunt5.mp3",
  H: "/assets/ikout/audio/hearts.mp3",
  S: "/assets/ikout/audio/spades.mp3",
  D: "/assets/ikout/audio/diamonds.mp3",
  C: "/assets/ikout/audio/clubs.mp3",
  pass: "/assets/ikout/audio/pass.mp3",
};

const phraseKeys = ["partner", "play", "ace", "king", "surprise", "kout", "pass-taunt", "tea"];
export const MAX_VOICE_DELAY_MS = 250;
const COLD_LOAD_GRACE_MS = 400;

let activeSeat: number | null = null;
const listeners = new Set<(seat: number | null) => void>();
const notify = (seat: number | null) => {
  activeSeat = seat;
  listeners.forEach((l) => l(seat));
};

export function subscribeCharacterVoice(listener: (seat: number | null) => void) {
  listeners.add(listener);
  listener(activeSeat);
  return () => {
    listeners.delete(listener);
  };
}

export function preloadCharacterVoices() {
  if (typeof window === "undefined") return;
  gameAudioPreloaded();
  installAudioUnlock();
  ensureContext();
  Object.values(OFFICIAL_VOICES).forEach((src) => {
    void loadBuffer(src);
  });
}

export function stopCharacterVoice(token?: string) {
  stopVoiceByToken(token ?? "");
}

export function voiceKey(message: string): string | null {
  const index = CHARACTER_PHRASES.indexOf(message);
  if (index >= 0) return phraseKeys[index];
  for (const [key, line] of Object.entries(SPECIAL_LINES)) if (message === line) return key;
  if (message === RESULT_LINES.win) return "win";
  if (message === RESULT_LINES.lose) return "lose";
  if (message === RESULT_LINES.opponent) return "opponent-win";
  const bid = /^طلب ([5-9])$/.exec(message);
  if (bid) return bid[1] === "9" ? "kout" : ;
  if (message === "كوت" || message === "كوت بوستة!" || message === "طلب 9") return "kout";
  if (message.startsWith("الأمر:")) {
    if (message.includes("هاص")) return "H";
    if (message.includes("سبيت")) return "S";
    if (message.includes("ديمن")) return "D";
    if (message.includes("كلفس")) return "C";
  }
  return null;
}

export function voiceSource(message: string, seat: number = 0): string | undefined {
  if (message === "طاف") return OFFICIAL_VOICES.pass;
  const key = voiceKey(message);
  return key ? OFFICIAL_VOICES[key] : undefined;
}

export function playCharacterVoice(
  message: string,
  seat: number,
  token: string | null = null,
  isStillValid: () => boolean = () => true,
) {
  if (typeof window === "undefined" || !loadSettings().soundEnabled) return;
  gameAudioPreloaded();
  const src = voiceSource(message, seat);
  if (!src) return;

  const requested = performance.now();
  const warm = isBufferReady(src);

  const start = (buf: AudioBuffer) => {
    const elapsed = performance.now() - requested;
    if (elapsed > (warm ? MAX_VOICE_DELAY_MS : COLD_LOAD_GRACE_MS) || !isStillValid()) {
      if (import.meta.env.DEV)
        logVoice({ message, token, dropped: true, delay: Math.round(elapsed) });
      return;
    }
    playBuffer(src, {
      channel: "voice",
      volume: 0.9,
      token,
      isStillValid,
      onEnd: () => notify(null),
    });
    notify(seat);
    if (import.meta.env.DEV) logVoice({ message, token, delay: Math.round(elapsed), warm });
  };

  if (warm) {
    const b = getBuffer(src);
    if (b) start(b);
    return;
  }
  void loadBuffer(src).then((buf) => {
    if (buf) start(buf);
  });
}

function logVoice(entry: Record<string, unknown>) {
  const w = window as unknown as { __voiceLog?: unknown[] };
  (w.__voiceLog ??= []).push({ ...entry, t: Math.round(performance.now()) });
}

export type EventVoiceKey =
  | "joker"
  | "maker"
  | "ace"
  | "king"
  | "H"
  | "S"
  | "D"
  | "C"
  | "bid6"
  | "bid7"
  | "bid8"
  | "kout"
  | "taf";

export function eventVoiceSource(key: EventVoiceKey, seat = 0): string | undefined {
  if (key === "taf") return OFFICIAL_VOICES.pass;
  return OFFICIAL_VOICES[key];
}

export function playEventVoice(
  key: EventVoiceKey,
  opts: {
    seat?: number;
    token?: string | null;
    isStillValid?: () => boolean;
    onEnd?: () => void;
  } = {},
) {
  if (typeof window === "undefined" || !loadSettings().soundEnabled) return;
  const src = eventVoiceSource(key, opts.seat ?? 0);
  if (!src) return;
  void loadBuffer(src).then((buf) => {
    if (!buf || (opts.isStillValid && !opts.isStillValid())) return;
    playBuffer(src, {
      channel: "voice",
      volume: 0.9,
      token: opts.token ?? null,
      isStillValid: opts.isStillValid,
      onEnd: () => {
        notify(null);
        opts.onEnd?.();
      },
    });
    if (opts.seat != null) notify(opts.seat);
  });
}
