import type { Card, Suit } from "../types/kout";
import { CHARACTERS_DATA } from "../data/charactersData";
import {
  CHARACTER_VOICES,
  type CharacterVoiceSet,
  type VoiceClip,
} from "../data/characterVoiceManifest";
export type { CharacterVoiceSet, VoiceClip };

export type SpecialPlay = "joker" | "maker" | "trump-ace";
export function specialPlay(card: Card, trump?: Suit | null): SpecialPlay | null {
  if (card.joker === "RED") return "joker";
  if (card.joker === "BLACK") return "maker";
  return trump && card.suit === trump && card.rank === 14 ? "trump-ace" : null;
}

/**
 * Every table character is one of the 36 restored authentic characters
 * (a1..a36); the human picks theirs in the profile, bots get the rest.
 */
export type CharacterId = string;

/** Base wording kept for characters without a verified clip for a situation. */
export const SPECIAL_LINES: Record<SpecialPlay, string> = {
  joker: "الجيكر وصل! وسّعوا له!",
  maker: "الميكر! لا تقول ما حذّرتك!",
  "trump-ace": "هذي أكة الحكم! كفو!",
};
export const RESULT_LINES = {
  win: "كفو يا ذيب! مبروك الفوز!",
  lose: "مو مشكلة يا شريكي، نعوضها بالجولة الجاية!",
  opponent: "ها يا معوّد، خلّك من الورق واشرب شاي!",
};

/** Every situation that can trigger a spoken line. */
export type PhraseKey =
  | "welcome"
  | "pass"
  | "malzoom"
  | "bid5"
  | "bid6"
  | "bid7"
  | "bid8"
  | "bid9"
  | "suitC"
  | "suitD"
  | "suitS"
  | "suitH"
  | SpecialPlay
  | "win"
  | "lose"
  | "opponent";

const MANIFEST_KEY: Partial<Record<PhraseKey, Exclude<keyof CharacterVoiceSet, "chat">>> = {
  welcome: "welcome",
  pass: "pass",
  malzoom: "malzoom",
  bid5: "bid5",
  bid6: "bid6",
  bid7: "bid7",
  bid8: "bid8",
  bid9: "bid9",
  suitC: "suitC",
  suitD: "suitD",
  suitS: "suitS",
  suitH: "suitH",
  joker: "joker",
  maker: "maker",
  "trump-ace": "ace",
  win: "win",
  lose: "lose",
};

const SUIT_AR: Record<Suit, string> = { S: "سبيت", H: "حس", D: "ديمان", C: "كلبس" };

/** Neutral wording used when the character has no verified clip for the situation. */
const BASE_PHRASES: Record<PhraseKey, string> = {
  welcome: "هلا بالربع، اليوم اللعب على أصوله!",
  pass: "طاف",
  malzoom: "ملزوم",
  bid5: "ملزوم",
  bid6: "ستة",
  bid7: "سبعة",
  bid8: "ثمانية",
  bid9: "تسعة",
  suitC: "الأمر: كلبس",
  suitD: "الأمر: ديمان",
  suitS: "الأمر: سبيت",
  suitH: "الأمر: حس",
  joker: SPECIAL_LINES.joker,
  maker: SPECIAL_LINES.maker,
  "trump-ace": SPECIAL_LINES["trump-ace"],
  win: RESULT_LINES.win,
  lose: RESULT_LINES.lose,
  opponent: RESULT_LINES.opponent,
};

export function voiceSet(character: CharacterId | null | undefined): CharacterVoiceSet {
  return (character && CHARACTER_VOICES[character]) || { chat: [] };
}

/**
 * The character's own verified clip for a situation. Every clip text was
 * confirmed by transcription, so bubble text always equals the spoken audio.
 */
/**
 * Fallback: every character bundle ships its own welcome/pass/win/lose/ace/taunt
 * clip with verified wording in CHARACTERS_DATA. Characters whose transcribed
 * manifest lacks a situation still speak with their own voice instead of staying
 * silent — without this, many characters only talked in some situations.
 */
const FALLBACK_PHRASE_ID: Partial<Record<PhraseKey, string>> = {
  pass: "pass-taunt",
  win: "win",
  lose: "lose",
  "trump-ace": "ace",
  opponent: "taunt",
};

function fallbackVoice(
  character: CharacterId | null | undefined,
  key: PhraseKey,
): VoiceClip | undefined {
  const data = character ? CHARACTERS_DATA[character] : undefined;
  if (!data) return undefined;
  if (key === "welcome") {
    return data.welcomeAudioUrl && data.welcomeQuote
      ? { file: data.welcomeAudioUrl.split("/").pop()!, text: data.welcomeQuote }
      : undefined;
  }
  const phraseId = FALLBACK_PHRASE_ID[key];
  if (!phraseId) return undefined;
  const phrase = data.phrases?.find((p) => p.id === phraseId);
  if (!phrase) return undefined;
  return { file: phrase.audioUrl.split("/").pop()!, text: phrase.text };
}

export function voiceFor(
  character: CharacterId | null | undefined,
  key: PhraseKey,
): VoiceClip | undefined {
  const mk = MANIFEST_KEY[key];
  const fromManifest = mk
    ? (voiceSet(character)[mk as keyof CharacterVoiceSet] as VoiceClip | undefined)
    : undefined;
  return fromManifest ?? fallbackVoice(character, key);
}

/** Returns the character's own wording for a situation (falls back to the base line). */
export function characterPhrase(character: CharacterId | null | undefined, key: PhraseKey): string {
  return voiceFor(character, key)?.text ?? BASE_PHRASES[key];
}

/** Maps a canonical bubble code (or a legacy wording) back to its situation key. */
export function contextKeyForMessage(message: string): PhraseKey | null {
  if (!message) return null;
  if (message === "pass") return "pass";
  let m = /^bid:([5-9])$/.exec(message);
  if (m) return `bid${m[1]}` as PhraseKey;
  m = /^trump:([SHDC])$/.exec(message);
  if (m) return `suit${m[1]}` as PhraseKey;
  if (/^clip:/.test(message)) return null; // clip codes play the exact file, handled separately
  // Legacy wordings (older saved sessions still reference them).
  if (message === "طاف") return "pass";
  if (message === "ملزوم") return "malzoom";
  m = /^طلب ([5-9])$/.exec(message);
  if (m) return `bid${m[1]}` as PhraseKey;
  m = /^الأمر: (.+)$/.exec(message);
  if (m) {
    const entry = Object.entries(SUIT_AR).find(([, arabic]) => arabic === m![1]);
    return entry ? (`suit${entry[0]}` as PhraseKey) : null;
  }
  for (const [key, line] of Object.entries(SPECIAL_LINES))
    if (message === line) return key as PhraseKey;
  if (message === RESULT_LINES.win) return "win";
  if (message === RESULT_LINES.lose) return "lose";
  if (message === RESULT_LINES.opponent) return "opponent";
  return null;
}

/** Backwards-compatible alias for the previous wording lookup. */
export function phraseKeyForWording(phrase: string): PhraseKey | null {
  return contextKeyForMessage(phrase);
}

export function commitsCardDrag(offsetY: number, legal: boolean, myTurn: boolean): boolean {
  return myTurn && legal && offsetY <= -90;
}
