import type { Card, Suit } from '../types/kout';
import { getCharacterData } from '../data/charactersData';

export type SpecialPlay = 'joker' | 'maker' | 'trump-ace';
export function specialPlay(card: Card, trump?: Suit | null): SpecialPlay | null {
  if (card.joker === 'RED') return 'joker';
  if (card.joker === 'BLACK') return 'maker';
  return trump && card.suit === trump && card.rank === 14 ? 'trump-ace' : null;
}

/**
 * Every table character is one of the 36 restored authentic characters
 * (a1..a36); the human picks theirs in the profile, bots get the rest.
 */
export type CharacterId = string;

/** Base lines kept for the local human player and as defaults. */
export const CHARACTER_PHRASES = [
  'كفو عليك يا شريكي!', 'العب يا معوّد!', 'وين الأكة؟!', 'الشايب نزل!',
  'يا ساتر!', 'كوت بوستة!', 'طاف يا رجال', 'استكانة شاي',
];

/** Base special/result lines (also the default wording). */
export const SPECIAL_LINES: Record<SpecialPlay, string> = {
  joker: 'الجيكر وصل! وسّعوا له!', maker: 'الميكر! لا تقول ما حذّرتك!', 'trump-ace': 'هذي أكة الحكم! كفو!',
};
export const RESULT_LINES = {
  win: 'كفو يا ذيب! مبروك الفوز!',
  lose: 'مو مشكلة يا شريكي، نعوضها بالجولة الجاية!',
  opponent: 'ها يا معوّد، خلّك من الورق واشرب شاي!',
};

/** Every situation that can trigger a spoken line. */
export type PhraseKey =
  | 'welcome'
  | 'partner' | 'play' | 'ace' | 'king' | 'surprise' | 'kout' | 'pass-taunt' | 'tea'
  | SpecialPlay | 'win' | 'lose' | 'opponent';

/**
 * Maps each situation to the character's own clip in the restored voice
 * bundles (/assets/ikout/audio/voices/<id>/<clip>.mp3). Situations without a
 * dedicated restored clip reuse the closest one so bubble text always equals
 * the spoken audio.
 */
const PHRASE_DATA_KEY: Record<PhraseKey, string> = {
  welcome: 'welcome',
  partner: 'partner', play: 'play', ace: 'ace', king: 'king', surprise: 'surprise',
  kout: 'kout', 'pass-taunt': 'pass', tea: 'tea',
  win: 'win', lose: 'lose', opponent: 'taunt',
  joker: 'kout', maker: 'surprise', 'trump-ace': 'ace',
};
export function phraseDataKey(key: PhraseKey): string {
  return PHRASE_DATA_KEY[key];
}

/** Base-key wording fallbacks keyed the same way. */
const BASE_PHRASES: Record<PhraseKey, string> = {
  welcome: 'هلا بالربع، اليوم اللعب على أصوله!',
  partner: CHARACTER_PHRASES[0], play: CHARACTER_PHRASES[1], ace: CHARACTER_PHRASES[2],
  king: CHARACTER_PHRASES[3], surprise: CHARACTER_PHRASES[4], kout: CHARACTER_PHRASES[5],
  'pass-taunt': CHARACTER_PHRASES[6], tea: CHARACTER_PHRASES[7],
  joker: SPECIAL_LINES.joker, maker: SPECIAL_LINES.maker, 'trump-ace': SPECIAL_LINES['trump-ace'],
  win: RESULT_LINES.win, lose: RESULT_LINES.lose, opponent: RESULT_LINES.opponent,
};

/** Returns the character's own wording for a situation (falls back to the base line). */
export function characterPhrase(character: CharacterId | null | undefined, key: PhraseKey): string {
  const dataKey = PHRASE_DATA_KEY[key];
  const found = character ? getCharacterData(character).phrases.find(p => p.id === dataKey) : undefined;
  return found?.text ?? BASE_PHRASES[key];
}

/** Maps a canonical engine/chat message back to its situation key. */
export function contextKeyForMessage(message: string): PhraseKey | null {
  if (!message) return null;
  const baseIndex = CHARACTER_PHRASES.indexOf(message);
  if (baseIndex >= 0) {
    return (['partner', 'play', 'ace', 'king', 'surprise', 'kout', 'pass-taunt', 'tea'] as PhraseKey[])[baseIndex];
  }
  if (message === 'طاف') return 'pass-taunt';
  if (/^طلب [5-9]$/.test(message)) return 'opponent';
  if (message.startsWith('الأمر:')) return 'play';
  for (const [key, line] of Object.entries(SPECIAL_LINES)) if (message === line) return key as PhraseKey;
  if (message === RESULT_LINES.win) return 'win';
  if (message === RESULT_LINES.lose) return 'lose';
  if (message === RESULT_LINES.opponent) return 'opponent';
  return null;
}

/** Backwards-compatible alias for the previous wording lookup. */
export function phraseKeyForWording(phrase: string): PhraseKey | null {
  return contextKeyForMessage(phrase);
}

export function commitsCardDrag(offsetY: number, legal: boolean, myTurn: boolean): boolean {
  return myTurn && legal && offsetY <= -90;
}
