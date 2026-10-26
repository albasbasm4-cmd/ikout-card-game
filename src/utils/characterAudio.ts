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
import { loadPlayerProfile } from "./playerProfile";

// Global map tracking which character is assigned to each seat
let seatCharacters: Record<number, string> = {};

export function registerSeatCharacters(mapping: Record<number, string> | (string | undefined)[]) {
  if (Array.isArray(mapping)) {
    mapping.forEach((charId, seat) => {
      if (charId) seatCharacters[seat] = charId;
    });
  } else {
    seatCharacters = { ...seatCharacters, ...mapping };
  }
}

export function getSeatCharacterId(seat: number): string {
  if (seatCharacters[seat]) return seatCharacters[seat];
  if (seat === 0) return loadPlayerProfile().characterId || "a1";
  return `a${((seat * 3) % 35) + 1}`;
}

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

  const humanChar = loadPlayerProfile().characterId || "a1";
  const actions = [
    "partner",
    "play",
    "ace",
    "king",
    "surprise",
    "kout",
    "pass",
    "tea",
    "win",
    "lose",
    "taunt",
    "welcome",
  ];
  actions.forEach((act) => {
    void loadBuffer(`/assets/ikout/audio/voices/${humanChar}/${act}.mp3`);
  });
}

export function stopCharacterVoice(token?: string) {
  stopVoiceByToken(token ?? "");
}

export function voiceKey(message: string): string | null {
  const index = CHARACTER_PHRASES.indexOf(message);
  if (index >= 0) return phraseKeys[index];
  for (const [key, line] of Object.entries(SPECIAL_LINES)) if (message === line) return key;
  if (message === RESULT_LINES.win || message.includes("مبروك الفوز")) return "win";
  if (message === RESULT_LINES.lose || message.includes("نعوضها")) return "lose";
  if (message === RESULT_LINES.opponent || message.includes("خلّك من الورق")) return "taunt";
  const bid = /^طلب ([5-9])$/.exec(message);
  if (bid) return bid[1] === "9" ? "kout" : null;
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
  const charId = getSeatCharacterId(seat);

  if (message === "طاف" || message === "طاف يا رجال") {
    return `/assets/ikout/audio/voices/${charId}/pass.mp3`;
  }

  const key = voiceKey(message);
  if (!key) return undefined;

  // Suit calls and general jokers
  if (key === "H") return "/assets/ikout/audio/hearts.mp3";
  if (key === "S") return "/assets/ikout/audio/spades.mp3";
  if (key === "D") return "/assets/ikout/audio/diamonds.mp3";
  if (key === "C") return "/assets/ikout/audio/clubs.mp3";
  if (key === "joker" || key === "maker") return "/assets/ikout/audio/joker.mp3";
  if (key === "trump-ace") return "/assets/ikout/audio/hokum_ace.mp3";

  // Character specific phrase binding
  const actionFile = key === "pass-taunt" ? "pass" : key;
  return `/assets/ikout/audio/voices/${charId}/${actionFile}.mp3`;
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
      return;
    }
    playBuffer(src, {
      channel: "voice",
      volume: 0.95,
      token,
      isStillValid,
      onEnd: () => notify(null),
    });
    notify(seat);
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
  const charId = getSeatCharacterId(seat);
  if (key === "taf") return `/assets/ikout/audio/voices/${charId}/pass.mp3`;
  if (key === "H") return "/assets/ikout/audio/hearts.mp3";
  if (key === "S") return "/assets/ikout/audio/spades.mp3";
  if (key === "D") return "/assets/ikout/audio/diamonds.mp3";
  if (key === "C") return "/assets/ikout/audio/clubs.mp3";
  if (key === "joker" || key === "maker") return "/assets/ikout/audio/joker.mp3";
  if (key === "ace" || key === "king" || key === "kout") {
    return `/assets/ikout/audio/voices/${charId}/${key}.mp3`;
  }
  return undefined;
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
      volume: 0.95,
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
