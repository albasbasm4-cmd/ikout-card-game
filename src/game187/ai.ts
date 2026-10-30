/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Card187, GameState187, Suit187 } from "./types";
import {
  getCardPoints,
  getLegalCards187,
  getRankStrength,
  resolveTrickWinner187,
  SUITS_187,
} from "./rules";

export const BOT_MAX_BID_187 = 140;

/** Ten points in reserve; 140 ends bot participation, not human bidding. */
export function bidFromPointCapacity187(capacity: number, high: number | null): number {
  if ((high ?? 0) >= BOT_MAX_BID_187) return 0;
  const bid = Math.min(BOT_MAX_BID_187, Math.floor((capacity - 10) / 5) * 5);
  return bid >= 75 && bid > (high ?? 0) ? bid : 0;
}

/** تقييم يد البوت لتقديم مزايدة */
export function evaluateBotBid(hand: Card187[], currentHighBid: number | null): number {
  // تجميع الأوراق حسب النوع
  const suitCounts: Record<Suit187, number> = { S: 0, H: 0, D: 0, C: 0 };
  let highCardPoints = 0;

  for (const card of hand) {
    suitCounts[card.suit]++;
    if (card.rank === 2) highCardPoints += card.suit === "C" ? 25 : 15;
    else if (card.rank === 14) highCardPoints += 12;
    else if (card.rank === 13) highCardPoints += 6;
    else if (card.rank === 10) highCardPoints += 8;
  }

  const maxSuitCount = Math.max(...Object.values(suitCounts));
  const estimatedStrength = highCardPoints + maxSuitCount * 8;

  // Preserve the hand estimator, interpreting its bands as capacity,
  // then reserve ten points rather than bidding to its limit.
  let capacity = 0;
  if (estimatedStrength >= 95) capacity = 150;
  else if (estimatedStrength >= 85) capacity = 140;
  else if (estimatedStrength >= 75) capacity = 130;
  else if (estimatedStrength >= 65) capacity = 120;
  else if (estimatedStrength >= 55) capacity = 110;
  else if (estimatedStrength >= 45) capacity = 100;
  else if (estimatedStrength >= 38) capacity = 90;
  else if (estimatedStrength >= 32) capacity = 80;
  else if (estimatedStrength >= 26) capacity = 75;
  return bidFromPointCapacity187(capacity, currentHighBid);
}

/** اختيار أفضل نوع حكم ليد الحاكم */
export function chooseBotTrump(hand: Card187[]): Suit187 {
  const scores: Record<Suit187, number> = { S: 0, H: 0, D: 0, C: 0 };

  for (const card of hand) {
    const strength = getRankStrength(card.rank);
    scores[card.suit] += strength + 5;
  }

  let bestSuit: Suit187 = "S";
  let bestScore = -1;

  for (const suit of SUITS_187) {
    if (scores[suit] > bestScore) {
      bestScore = scores[suit];
      bestSuit = suit;
    }
  }

  return bestSuit;
}

/** اختيار 4 أوراق ليعطيها الحاكم البوت للخصوم */
export function chooseBotDiscards(hand: Card187[], trumpSuit: Suit187): string[] {
  // الحاكم يحتفظ بأوراق الحكم والأوراق القوية، ويعطي الأوراق الأضعف من الأنواع الأخرى
  const scoredCards = hand.map((card) => {
    let priority = 0;
    if (card.suit === trumpSuit) {
      priority += 1000 + getRankStrength(card.rank) * 10;
    } else {
      if (card.suit === "C" && card.rank === 2) priority += 900;
      else if (card.rank === 2) priority += 800;
      else if (card.rank === 14) priority += 700;
      else priority += getRankStrength(card.rank) * 5;
    }
    return { card, priority };
  });

  // ترتيب تصاعدي: الأضعف أولاً ليتم إعطاؤها للخصوم
  scoredCards.sort((a, b) => a.priority - b.priority);

  return scoredCards.slice(0, 4).map((sc) => sc.card.id);
}

/** اختيار الورقة التي ينزلها البوت في دوره */
export function chooseBotCardToPlay(state: GameState187, seat: number): Card187 {
  const hand = state.hands[seat];
  const legal = getLegalCards187(
    hand,
    state.currentTrick,
    state.trump,
    seat,
    state.bidderSeat!,
    state.trickHistory.length,
  );

  if (legal.length === 1) {
    return legal[0];
  }

  const isLeading = state.currentTrick.length === 0;
  const isHakem = seat === state.bidderSeat;

  if (isLeading) {
    if (isHakem) {
      // الحاكم يقود بـ 2 حكم أو آكة حكم لسحب أوراق الخصوم، أو آكة قوية
      const strongTrump = legal.find((c) => c.suit === state.trump && c.rank === 2);
      if (strongTrump) return strongTrump;

      const strongAce = legal.find((c) => c.rank === 14);
      if (strongAce) return strongAce;
    }

    // قيادة عادية: اختيار ورقة آمنة
    return legal[0];
  }

  // متابعة الأكلة
  const currentWinner = resolveTrickWinner187(state.currentTrick, state.trump);
  const currentWinnerIsHakem = currentWinner.seat === state.bidderSeat;
  const currentWinnerIsAlly = isHakem ? currentWinnerIsHakem : !currentWinnerIsHakem;

  if (currentWinnerIsAlly) {
    // الحليف يفوز حالياً بالأكلة -> محاولة رمي ورقة ذات نقاط عالية (10 أو شايب) لدعمه
    const pointCards = legal.filter((c) => getCardPoints(c) >= 10);
    if (pointCards.length > 0) {
      return pointCards[0];
    }
    // أو رمي أضعف ورقة
    return legal[0];
  }

  // الخصم يفوز حالياً بالأكلة -> محاولة الفوز عليها إن أمكن
  const winningCards: Card187[] = [];
  for (const c of legal) {
    const trialTrick = [...state.currentTrick, { seat, card: c }];
    const trialWinner = resolveTrickWinner187(trialTrick, state.trump);
    if (trialWinner.seat === seat) {
      winningCards.push(c);
    }
  }

  if (winningCards.length > 0) {
    // اختيار أقل ورقة رابحة كافية للفوز
    winningCards.sort((a, b) => getRankStrength(a.rank) - getRankStrength(b.rank));
    return winningCards[0];
  }

  // لا يمكن الفوز -> رمي أضعف ورقة لا تمنح نقاطاً للخصم
  const zeroCards = legal.filter((c) => getCardPoints(c) === 0);
  if (zeroCards.length > 0) {
    return zeroCards[0];
  }

  return legal[0];
}

/** Alias retained for callers using the earlier AI function name. */
export const chooseBotBid = evaluateBotBid;
