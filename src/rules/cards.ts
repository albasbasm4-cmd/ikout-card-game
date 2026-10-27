/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Card, Suit, Bid, TrickPlay } from '../types/kout';
import { RULES } from './config';

/**
 * Calculates card strength in the context of the current trick and trump suit.
 * 
 * القوانين المعتمدة:
 * - الجوكر الأحمر إذا نزل كأول ورقة في الأكلة (lead card): يتحول إلى 6 سبيت (6 of Spades).
 *   قوته تكون 106 (أو 706 إذا كان الحكم سبيت). أي سبيت أعلى أو أي حكم أو ماكر يتفوق عليه،
 *   وإذا لم يوجد سبيت أعلى أو حكم أو ماكر، يفوز الجوكر بالأكلة.
 * - الماكر الأسود (Black Joker) إذا نزل كأول ورقة: يتحول إلى نوع الحكم وقوته 800.
 * - الجوكر الأحمر إذا نزل أثناء الأكلة (ليس أول ورقة): قوته 1000.
 * - آكة الحكم: 900 (تتفوق على الماكر وبقية أوراق الحكم).
 * - الماكر الأسود: 800 (أقوى من باشا الحكم 713 وأضعف من آكة الحكم 900).
 * - ورق الحكم K..2: من 713 إلى 702.
 * - ورق النوع المتبع (Led suit) A..2: من 114 إلى 102.
 * - باقي الأوراق: 0.
 */
export function cardStrength(
  card: Card,
  trump: Suit | null,
  ledSuit?: Suit | null,
  isLeadPlay?: boolean
): number {
  // الجوكر الأحمر عند نزوله أول ورقة في الأكلة يتحول إلى 6 سبيت
  if (card.joker === 'RED' && isLeadPlay) {
    return trump === 'S' ? 706 : 106;
  }

  // الجوكر الأحمر النازل على الطاولة أثناء الأكلة
  if (card.joker === 'RED') {
    return 1000;
  }

  // آكة الحكم: أقوى من الماكر وبقية الحكم
  if (trump && card.suit === trump && card.rank === 14) {
    return 900;
  }

  // الماكر (الجوكر الأسود): أقوى من باشا الحكم وأضعف من الآكة والجوكر الأحمر
  if (card.joker === 'BLACK') {
    return 800;
  }

  // ورق الحكم من الشايب إلى 2
  if (trump && card.suit === trump && typeof card.rank === 'number') {
    return 700 + card.rank;
  }

  // ورق النوع المتبع في الأكلة
  if (ledSuit && card.suit === ledSuit && typeof card.rank === 'number') {
    return 100 + card.rank;
  }

  // باقي الأوراق التي لا تتبع ولا تحكم
  return 0;
}

/**
 * Determines the winning TrickPlay of a completed or in-progress trick.
 * - الجوكر الأحمر كأول ورقة: يحدد نوع الأكلة سبيت (S) ويتحول إلى 6 سبيت.
 * - الماكر الأسود كأول ورقة: يحدد نوع الأكلة حكم (Trump) ويتحول إلى حكم.
 */
export function trickWinner(plays: TrickPlay[], trump: Suit | null): TrickPlay {
  if (plays.length === 0) {
    throw new Error('Cannot determine trick winner of empty trick');
  }

  const leadPlay = plays[0];
  let ledSuit: Suit | null = null;

  if (leadPlay.card.joker === 'RED') {
    ledSuit = 'S'; // يتحول إلى 6 سبيت
  } else if (leadPlay.card.joker === 'BLACK') {
    ledSuit = trump; // يتحول إلى حكم
  } else {
    ledSuit = leadPlay.card.suit ?? null;
  }

  let bestPlay = leadPlay;
  let maxStrength = cardStrength(leadPlay.card, trump, ledSuit, true);

  for (let i = 1; i < plays.length; i++) {
    const play = plays[i];
    const strength = cardStrength(play.card, trump, ledSuit, false);
    if (strength > maxStrength) {
      maxStrength = strength;
      bestPlay = play;
    }
  }

  return bestPlay;
}

export interface LegalCardContext {
  playedCards?: Card[];
  highBid?: Bid | null;
}

/**
 * Checks if Trump A, K, Q, J have all been played previously
 */
export function areTrumpHonorsPlayed(
  trump: Suit | null,
  playedCards: Card[] = []
): boolean {
  if (!trump) return false;
  const honorRanks = new Set([14, 13, 12, 11]);
  for (const card of playedCards) {
    if (
      card.suit === trump &&
      typeof card.rank === 'number' &&
      honorRanks.has(card.rank)
    ) {
      honorRanks.delete(card.rank);
    }
  }
  return honorRanks.size === 0;
}

/**
 * Determines legal cards a player can play from hand.
 *
 * القوانين المعتمدة:
 * 1. الجوكر والميكر ليس لهما أي قيود عند الإنزال: يمكن للاعب إنزالهما في أي وقت ضد البوتات.
 * 2. عند اتباع الأكلة (Following):
 *    - إذا كان لدى اللاعب أوراق من نفس نوع الأكلة المتبع، يحق له إنزالها أو إنزال أي جوكر/ماكر في يده.
 *    - إذا كان خالياً من نوع الأكلة، يحق له إنزال أي ورقة من يده.
 * 3. عند بدء الأكلة الأولى في الجولة (First Trick Lead):
 *    - الحاكم الذي حكم ينزل آخر واحد في الأكلة الأولى، والذي على يمينه يبدأ اللعب.
 *    - ممنوع على من يبدأ الأكلة الأولى إنزال نوع بطاقة الحكم (أو الماكر لأنه يتحول لحكم، أو الجوكر إذا كان الحكم سبيت)،
 *      إلا إذا كانت يده بالكامل لا تحتوي إلا على أوراق حكم.
 * 4. في باقي الأكلات (الأكلة الثانية وما بعدها):
 *    - يرفع أي قيد عن البداية ويحق للاعب النزول بأي ورقة بما في ذلك الجوكر والماكر والحكم.
 */
export function getLegalCards(
  hand: Card[],
  trick: TrickPlay[],
  trump: Suit | null,
  ctx: LegalCardContext = {}
): Card[] {
  if (hand.length === 0) {
    return [];
  }

  // 1. Following a trick (الأكلة فيها ورقة نازلة أو أكثر)
  if (trick.length > 0) {
    const leadCard = trick[0].card;
    let ledSuit: Suit | null = null;
    if (leadCard.joker === 'RED') {
      ledSuit = 'S'; // الجوكر الأحمر أول ورقة يحدد سبيت
    } else if (leadCard.joker === 'BLACK') {
      ledSuit = trump; // الماكر أول ورقة يحدد حكم
    } else {
      ledSuit = leadCard.suit ?? null;
    }

    const jokersInHand = hand.filter((c) => c.joker !== undefined);

    if (ledSuit) {
      if (ledSuit === trump) {
        // إذا كانت الأكلة حكم: أوراق الحكم والجوكر والماكر كلها تتبع الحكم
        const matchingCards = hand.filter(
          (c) => c.suit === trump || c.joker !== undefined
        );
        if (matchingCards.length > 0) {
          return matchingCards;
        }
      } else {
        // أكلة من نوع عادي: اللاعب ينزل من نفس النوع، أو ينزل الجوكر/الماكر بدون قيود في أي وقت
        const matchingSuitCards = hand.filter((c) => c.suit === ledSuit);
        if (matchingSuitCards.length > 0) {
          return [...matchingSuitCards, ...jokersInHand];
        }
      }
    }

    // خالي من نوع الأكلة: يحق له إنزال أي ورقة
    return [...hand];
  }

  // 2. Leading a trick (بدء أكلة جديدة)
  const isFirstTrick = (ctx.playedCards?.length ?? 0) === 0;

  // في الأكلة الأولى فقط: ممنوع نزول الحكم أول اللعبة
  if (isFirstTrick && trump) {
    const isTrumpLike = (c: Card): boolean => {
      if (c.suit === trump) return true;
      if (c.joker === 'BLACK') return true; // الماكر يتحول لحكم
      if (c.joker === 'RED' && trump === 'S') return true; // الجوكر يتحول لـ 6 سبيت (حكم)
      return false;
    };

    const nonTrumpCards = hand.filter((c) => !isTrumpLike(c));
    if (nonTrumpCards.length > 0) {
      return nonTrumpCards;
    }
    // إذا لم يكن لديه سوى ورق حكم وماكر، يُسمح له بإنزال ما في يده
    return [...hand];
  }

  // في الأكلات التالية (2 وما بعدها): الجوكر والماكر والحكم وجميع الأوراق متاحة للبدء
  return [...hand];
}

/**
 * Sorts cards for player hand presentation:
 * 1. Jokers first: Red Joker, then Black Joker
 * 2. Trump suit first (if trump is active), then Spades, Hearts, Clubs, Diamonds
 * 3. Inside each suit: sorted descending by rank (Ace down to 2)
 */
export function sortHandCards(cards: Card[], trump?: Suit | null): Card[] {
  const defaultSuits: Suit[] = ['S', 'H', 'C', 'D'];
  const orderedSuits: Suit[] = trump
    ? [trump, ...defaultSuits.filter((s) => s !== trump)]
    : defaultSuits;

  const suitOrderMap: Partial<Record<Suit, number>> = {
    [orderedSuits[0]]: 4000,
    [orderedSuits[1]]: 3000,
    [orderedSuits[2]]: 2000,
    [orderedSuits[3]]: 1000,
  };

  return [...cards].sort((a, b) => {
    // 1. Jokers precedence
    if (a.joker && !b.joker) return -1;
    if (!a.joker && b.joker) return 1;
    if (a.joker && b.joker) {
      if (a.joker === 'RED' && b.joker === 'BLACK') return -1;
      if (a.joker === 'BLACK' && b.joker === 'RED') return 1;
      return 0;
    }

    // 2. Suit grouping
    const weightA = a.suit ? suitOrderMap[a.suit] ?? 0 : 0;
    const weightB = b.suit ? suitOrderMap[b.suit] ?? 0 : 0;

    if (weightA !== weightB) {
      return weightB - weightA;
    }

    // 3. Rank descending (14 down to 2)
    const rankA = a.rank ?? 0;
    const rankB = b.rank ?? 0;
    return rankB - rankA;
  });
}
