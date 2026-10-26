import type { Card, Suit } from '../types/kout';

export type SpecialPlay = 'joker' | 'maker' | 'trump-ace';
export function specialPlay(card: Card, trump?: Suit | null): SpecialPlay | null {
  if (card.joker === 'RED') return 'joker';
  if (card.joker === 'BLACK') return 'maker';
  return trump && card.suit === trump && card.rank === 14 ? 'trump-ace' : null;
}

export const CHARACTER_PHRASES = [
  'كفو عليك يا شريكي!', 'العب يا معوّد!', 'وين الأكة؟!', 'الشايب نزل!',
  'يا ساتر!', 'كوت بوستة!', 'طاف يا رجال', 'استكانة شاي',
];
export const SPECIAL_LINES: Record<SpecialPlay, string> = {
  joker: 'الجيكر وصل! وسّعوا له!', maker: 'الميكر! لا تقول ما حذّرتك!', 'trump-ace': 'هذي أكة الحكم! كفو!',
};
export const RESULT_LINES = {
  win: 'كفو يا ذيب! مبروك الفوز!',
  lose: 'مو مشكلة يا شريكي، نعوضها بالجولة الجاية!',
  opponent: 'ها يا معوّد، خلّك من الورق واشرب شاي!',
};

export function commitsCardDrag(offsetY: number, legal: boolean, myTurn: boolean): boolean {
  return myTurn && legal && offsetY <= -90;
}