import type { Card, Suit } from '../types/kout';

export type SpecialPlay = 'joker' | 'maker' | 'trump-ace';
export function specialPlay(card: Card, trump?: Suit | null): SpecialPlay | null {
  if (card.joker === 'RED') return 'joker';
  if (card.joker === 'BLACK') return 'maker';
  return trump && card.suit === trump && card.rank === 14 ? 'trump-ace' : null;
}

/**
 * The four table characters, matching PORTRAITS order:
 * elder (الشايب), shemagh (الشماغ), green (الأخضرار), glasses (النظارة).
 */
export type CharacterId = 'elder' | 'shemagh' | 'green' | 'glasses';
export const CHARACTERS: CharacterId[] = ['elder', 'shemagh', 'green', 'glasses'];
export const CHARACTER_NAMES: Record<CharacterId, string> = {
  elder: 'الشايب',
  shemagh: 'الشماغ',
  green: 'الأخضرار',
  glasses: 'النظارة',
};

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
  | 'partner' | 'play' | 'ace' | 'king' | 'surprise' | 'kout' | 'pass-taunt' | 'tea'
  | SpecialPlay | 'win' | 'lose' | 'opponent';

/**
 * Per-character wording for each situation. Each character says the same event
 * with its own words (and its own dialect flavor), so the bubble text matches
 * the spoken audio context while the wording differs between characters.
 */
export const CHARACTER_VARIANTS: Record<PhraseKey, Record<CharacterId, string>> = {
  'partner': {
    elder: 'كفو والله يا شريكي، زين قلت!',
    shemagh: 'يا هلا يا معي، كفوك!',
    green: 'شريكي الحلو، عاد انت!',
    glasses: 'معك شريك يفهم، كفو!',
  },
  'play': {
    elder: 'هات يا وليد، العب!',
    shemagh: 'العب الله يعطيك!',
    green: 'طلع الورقة يا راجل!',
    glasses: 'دورك، العب براحتك!',
  },
  'ace': {
    elder: 'وين الأكلة؟ جيبها!',
    shemagh: 'الأكة وين يا جماعة؟!',
    green: 'الديدة وين؟ طلعوها!',
    glasses: 'الأكلة عند مين؟ هاتوها!',
  },
  'king': {
    elder: 'الشايب نزل، خذو بالكم!',
    shemagh: 'الحاكمة نزلت على الديوانية!',
    green: 'الوالي جا، ودّوه لمعي!',
    glasses: 'الحاكم في الوسط، راقبوا!',
  },
  'surprise': {
    elder: 'يا ساتر يا ربي!',
    shemagh: 'استغفر الله العظيم!',
    green: 'لا حول ولا قوة إلا بالله!',
    glasses: 'هذا مستحيل يا جماعة!',
  },
  'kout': {
    elder: 'كوت بوستة، انتصرنا!',
    shemagh: 'كوت بوستة يا رجال!',
    green: 'بوستة كوت، خذوها!',
    glasses: 'كوت بوستة، قدرناها!',
  },
  'pass-taunt': {
    elder: 'طاف يا رجال، ما كو ندى',
    shemagh: 'طاف، الورقة مو زينة',
    green: 'طاف ما عندي شيء',
    glasses: 'طاف، خيرها بغيرها',
  },
  'tea': {
    elder: 'استكانة شاي ونيّة زينة',
    shemagh: 'جيبوا شاي، الجولة طويلة',
    green: 'شاي هيل يا جمعة!',
    glasses: 'أنا على شاي، الورق برأسك',
  },
  'joker': {
    elder: 'الجيكر نزل! وسّعوا له!',
    shemagh: 'الجوكر هاج! تحسبوه!',
    green: 'الجوكر على الطاولة، خلاص!',
    glasses: 'الجوكر دخل، لا أحد يتحرك!',
  },
  'maker': {
    elder: 'الميكر بيدك لا تقول ما حذّرتك!',
    shemagh: 'هذا الميكر، قوموا له!',
    green: 'الميكر نزل، عادكم تعرفون!',
    glasses: 'الميكر! حذّرتكم قبل!',
  },
  'trump-ace': {
    elder: 'أكة الحكم نزلت! كفو!',
    shemagh: 'الأكة بالحكم! كفيتكم!',
    green: 'الديدة على الحكم، تكفون!',
    glasses: 'أكة الحكم! ما عليه كلام!',
  },
  'win': {
    elder: 'كفو يا ذيب، فزنا!',
    shemagh: 'فزنا يا جماعة، مبروك!',
    green: 'خذناها، الحمد لله!',
    glasses: 'فوز مستحق يا شباب!',
  },
  'lose': {
    elder: 'ما شاء الله عليهم، نعوضها',
    shemagh: 'خسرنا هاي، بالجولة الجاية',
    green: 'الأول مرة والآخرة جاية',
    glasses: 'نقصنا هاي الجولة، نعيد الكرة',
  },
  'opponent': {
    elder: 'ها يا معوّد، خلّك من الورق واشرب شاي!',
    shemagh: 'يا وين يا شاطر، هذا زمنك؟',
    green: 'ورقك شين اليوم يا صاحبي!',
    glasses: 'خذها مني، الورق ما يرحم!',
  },
};

/** Base-key wording fallbacks keyed the same way. */
const BASE_PHRASES: Record<PhraseKey, string> = {
  partner: CHARACTER_PHRASES[0], play: CHARACTER_PHRASES[1], ace: CHARACTER_PHRASES[2],
  king: CHARACTER_PHRASES[3], surprise: CHARACTER_PHRASES[4], kout: CHARACTER_PHRASES[5],
  'pass-taunt': CHARACTER_PHRASES[6], tea: CHARACTER_PHRASES[7],
  joker: SPECIAL_LINES.joker, maker: SPECIAL_LINES.maker, 'trump-ace': SPECIAL_LINES['trump-ace'],
  win: RESULT_LINES.win, lose: RESULT_LINES.lose, opponent: RESULT_LINES.opponent,
};

/** Returns the character's own wording for a situation. */
export function characterPhrase(character: CharacterId | null | undefined, key: PhraseKey): string {
  if (!character) return BASE_PHRASES[key];
  return CHARACTER_VARIANTS[key]?.[character] ?? BASE_PHRASES[key];
}

/** Maps any wording (base or character variant) back to its audio key. */
const WORDING_TO_KEY = new Map<string, PhraseKey>();
for (const key of Object.keys(BASE_PHRASES) as PhraseKey[]) {
  WORDING_TO_KEY.set(BASE_PHRASES[key], key);
  for (const line of Object.values(CHARACTER_VARIANTS[key])) WORDING_TO_KEY.set(line, key);
}
export function phraseKeyForWording(phrase: string): PhraseKey | null {
  return WORDING_TO_KEY.get(phrase) ?? null;
}

export function commitsCardDrag(offsetY: number, legal: boolean, myTurn: boolean): boolean {
  return myTurn && legal && offsetY <= -90;
}
