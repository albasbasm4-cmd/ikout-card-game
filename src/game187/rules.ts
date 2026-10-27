/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Card187, Rank187, Suit187, TrickPlay187 } from './types';

export const SUITS_187: Suit187[] = ['S', 'H', 'D', 'C'];
export const RANKS_187: Rank187[] = [2, 14, 13, 12, 11, 10, 9, 8, 7, 6];

export const TOTAL_GAME_POINTS = 187;
export const MIN_BID = 75;
export const MAX_BID = 185;

/** نقاط كل ورقة في لعبة 187 */
export function getCardPoints(card: Card187): number {
  if (card.suit === 'C' && card.rank === 2) {
    return 25; // 2 كلفس (السباتي) يحمل 25 نقطة
  }
  switch (card.rank) {
    case 2:
      return 10;
    case 14: // A
      return 11;
    case 13: // K
      return 4;
    case 12: // Q
      return 4;
    case 11: // J
      return 4;
    case 10:
      return 10;
    default: // 9, 8, 7, 6
      return 0;
  }
}

/** قوة الورقة عند فض الأكلة (2 الأقوى ثم الآكة ثم الشايب ثم البنت ثم الولد ثم 10 .. إلى 6) */
export function getRankStrength(rank: Rank187): number {
  switch (rank) {
    case 2:
      return 10;
    case 14:
      return 9;
    case 13:
      return 8;
    case 12:
      return 7;
    case 11:
      return 6;
    case 10:
      return 5;
    case 9:
      return 4;
    case 8:
      return 3;
    case 7:
      return 2;
    case 6:
      return 1;
  }
}

/** توليد حزمة أوراق لعبة 187 المكونة من 40 ورقة (حذف 3 و 4 و 5 والجوكر) */
export function createDeck187(): Card187[] {
  const deck: Card187[] = [];
  for (const suit of SUITS_187) {
    for (const rank of RANKS_187) {
      deck.push({
        id: `${suit}-${rank}`,
        suit,
        rank,
      });
    }
  }
  return deck;
}

/** فحص الأوراق القانونية المسموح إنزالها */
export function getLegalCards187(
  hand: Card187[],
  currentTrick: TrickPlay187[],
  trump: Suit187 | null,
  seat: number,
  hakemSeat: number,
  trickIndex: number
): Card187[] {
  if (hand.length === 0) return [];

  // إذا كان اللاعب هو الذي يبدأ الأكلة
  if (currentTrick.length === 0) {
    return [...hand];
  }

  const ledSuit = currentTrick[0].card.suit;
  const sameSuitCards = hand.filter((c) => c.suit === ledSuit);

  // إذا كان يملك ورقة من نوع الأكلة، يلزمه إنزالها
  if (sameSuitCards.length > 0) {
    return sameSuitCards;
  }

  // لا يملك نوع الأكلة -> يحق له إنزال أي ورقة
  // استثناء قيد الأكلة الأولى: اللاعب على يمين الحاكم يمنع عليه الحكم في الأكلة الأولى
  // إلا إذا كانت كل أوراقه حكماً
  const isRightOfHakem = seat === (hakemSeat + 1) % 5;
  if (trickIndex === 0 && isRightOfHakem && trump) {
    const nonTrumpCards = hand.filter((c) => c.suit !== trump);
    if (nonTrumpCards.length > 0) {
      return nonTrumpCards;
    }
  }

  return [...hand];
}

/** تحديد الفائز بالأكلة */
export function resolveTrickWinner187(
  trick: TrickPlay187[],
  trump: Suit187 | null
): TrickPlay187 {
  if (trick.length === 0) {
    throw new Error('Trick is empty');
  }

  // البحث عن أوراق الحكم المنزلة
  if (trump) {
    const trumpPlays = trick.filter((p) => p.card.suit === trump);
    if (trumpPlays.length > 0) {
      let best = trumpPlays[0];
      for (let i = 1; i < trumpPlays.length; i++) {
        if (getRankStrength(trumpPlays[i].card.rank) > getRankStrength(best.card.rank)) {
          best = trumpPlays[i];
        }
      }
      return best;
    }
  }

  // إذا لم يُنزل حكم، تفوز أقوى ورقة من نوع الأكلة التي بدأت بها
  const ledSuit = trick[0].card.suit;
  const ledSuitPlays = trick.filter((p) => p.card.suit === ledSuit);
  let best = ledSuitPlays[0];
  for (let i = 1; i < ledSuitPlays.length; i++) {
    if (getRankStrength(ledSuitPlays[i].card.rank) > getRankStrength(best.card.rank)) {
      best = ledSuitPlays[i];
    }
  }
  return best;
}

/** حساب مجموع نقاط الأوراق في أكلة واحدة */
export function calculateTrickPoints(trick: TrickPlay187[]): number {
  return trick.reduce((sum, p) => sum + getCardPoints(p.card), 0);
}

/**
 * فحص الحسم المبكر:
 * - فوز الخصوم المبكر إذا خ >= 187 - ق
 * - فوز الحاكم المبكر إذا (خ + النقاط المتبقية) < 187 - ق
 */
export function checkEarlySettlement187(
  hakemPoints: number,
  opponentsPoints: number,
  qayd: number,
  remainingPointsInGame: number
): 'HAKEM' | 'OPPONENTS' | null {
  const opponentsThreshold = TOTAL_GAME_POINTS - qayd; // 187 - ق

  // فوز الخصوم
  if (opponentsPoints >= opponentsThreshold) {
    return 'OPPONENTS';
  }

  // فوز الحاكم المبكر
  if (opponentsPoints + remainingPointsInGame < opponentsThreshold) {
    return 'HAKEM';
  }

  return null;
}

/** الفائز النهائي في الجولة */
export function checkFinalWinner187(
  hakemPoints: number,
  opponentsPoints: number,
  qayd: number
): 'HAKEM' | 'OPPONENTS' {
  const opponentsThreshold = TOTAL_GAME_POINTS - qayd;
  if (opponentsPoints >= opponentsThreshold) {
    return 'OPPONENTS';
  }
  return 'HAKEM';
}
