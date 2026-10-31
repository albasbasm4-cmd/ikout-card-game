/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Card187, GameState187, Suit187 } from "./types";
import {
  RANKS_187,
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

/**
 * خطة الحاكم البوت قبل الطرد: يختار نوع الحكم أولاً بناءً على يده الكاملة (12 ورقة)
 * ثم يطرد الأوراق بناءً على الحكم المختار. هذا يمنع الخطأ القديم حيث كان يُمرر
 * حكم افتراضي ثابت ("S") فيحتفظ البوت بأوراق السبيد الميتة ويطرد أوراقه القوية
 * في الأنواع الأخرى قبل أن يحدد الحكم الحقيقي.
 */
export function planBotDiscardAndTrump(hand: Card187[]): { trump: Suit187; discards: string[] } {
  const trump = chooseBotTrump(hand);
  return { trump, discards: chooseBotDiscards(hand, trump) };
}

/**
 * هل استُنفدت كل أوراق الحكم من اللعب (المنزلة أو في يد هذا البوت)؟
 * في 187 كل نوع فيه 10 أوراق، فإذا اكتمل العشرين من الحكم صارت القيادة بأقوى
 * ورقة (2) مضمونة من الخطف.
 */
function trumpsExhausted187(state: GameState187, hand: Card187[]): boolean {
  if (!state.trump) return false;
  const played = [...state.trickHistory.flat(), ...state.currentTrick].map((p) => p.card);
  const playedTrump = played.filter((c) => c.suit === state.trump).length;
  const mineTrump = hand.filter((c) => c.suit === state.trump).length;
  return playedTrump + mineTrump >= RANKS_187.length;
}

/**
 * اختيار الورقة التي ينزلها البوت في دوره.
 *
 * هدف البوت: جمع أكبر عدد ممكن من النقاط من الأكلات المضمونة فقط.
 * - الأكلة مضمونة: البوت آخر لاعب فيها وفريقه فائز حالياً أو يستطيع الفوز.
 *   حينها ينزل أوراق النقاط (2 كلفس 25 نقطة ثم 10 ثم الآكة) ليصرفها في أكلة
 *   مضمونة له بدل أن تُخطف.
 * - غير مضمونة: ينزل ورقة ضعيفة (6 إلى 9) ثم الصور (شايب/بنت/ولد)، ولا ينزل
 *   2 كلفس أبداً ولا يحرق 10 أو آكة أو 2 إذا كان لديه بديل.
 */
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
  const seatCount = state.players.length || 5;
  const isLast = state.currentTrick.length === seatCount - 1;
  const isClubs2 = (c: Card187) => c.suit === "C" && c.rank === 2;
  const byPointsDesc = (a: Card187, b: Card187) =>
    getCardPoints(b) - getCardPoints(a) || getRankStrength(b.rank) - getRankStrength(a.rank);
  const byWeakest = (a: Card187, b: Card187) => getRankStrength(a.rank) - getRankStrength(b.rank);

  if (isLeading) {
    if (isHakem) {
      // الحاكم يقود بـ 2 حكم أو آكة حكم لسحب أوراق الخصوم، أو آكة قوية
      const strongTrump = legal.find((c) => c.suit === state.trump && c.rank === 2);
      if (strongTrump) return strongTrump;

      const strongAce = legal.find((c) => c.rank === 14);
      if (strongAce) return strongAce;
    }

    // قيادة غير الحاكم: ممنوع 2 كلفس إلا إذا استُنفد الحكم من اللعب
    const allTrumpsGone = trumpsExhausted187(state, hand);
    let pool = legal.filter((c) => !isClubs2(c) || allTrumpsGone);
    if (pool.length === 0) pool = legal;

    const suitCount = (c: Card187) => hand.filter((h) => h.suit === c.suit).length;
    const pickBest = (cards: Card187[], byStrong: boolean) =>
      [...cards].sort((a, b) =>
        byStrong ? getRankStrength(b.rank) - getRankStrength(a.rank) : byWeakest(a, b),
      )[0];

    const aces = pool.filter((c) => c.rank === 14);
    if (aces.length > 0) {
      return [...aces].sort((a, b) => suitCount(b) - suitCount(a))[0];
    }
    const twos = pool.filter((c) => c.rank === 2);
    if (twos.length > 0) return twos[0];
    const kings = pool.filter((c) => c.rank === 13);
    if (kings.length > 0) {
      return [...kings].sort((a, b) => suitCount(b) - suitCount(a))[0];
    }
    const faces = pool.filter((c) => c.rank === 12 || c.rank === 11);
    if (faces.length > 0) return pickBest(faces, true);
    const lows = pool.filter((c) => c.rank >= 6 && c.rank <= 9);
    if (lows.length > 0) return pickBest(lows, false);
    return pickBest(pool, false);
  }

  // متابعة الأكلة
  const currentWinner = resolveTrickWinner187(state.currentTrick, state.trump);
  const currentWinnerIsAlly = isHakem
    ? currentWinner.seat === state.bidderSeat
    : currentWinner.seat !== state.bidderSeat;

  const winningCards: Card187[] = [];
  for (const c of legal) {
    const trialTrick = [...state.currentTrick, { seat, card: c }];
    const trialWinner = resolveTrickWinner187(trialTrick, state.trump);
    if (trialWinner.seat === seat) {
      winningCards.push(c);
    }
  }

  // أكلة مضمونة: البوت آخر لاعب وفريقه فائز (حالياً أو بأي ورقة رابحة عنده)
  const guaranteed = isLast && (currentWinnerIsAlly || winningCards.length > 0);
  if (guaranteed) {
    const pool = currentWinnerIsAlly ? legal : winningCards;
    // تصفير أوراق النقاط في أكلة مضمونة: 2 كلفس ثم الأعلى نقاطاً
    return [...pool].sort(byPointsDesc)[0];
  }

  // غير مضمونة: لا تحرق النقاط، ننزل ضعيفة ولا ننزل 2 كلفس أبداً
  let pool = legal.filter((c) => !isClubs2(c));
  if (pool.length === 0) pool = legal;

  const zeros = pool.filter((c) => getCardPoints(c) === 0);
  if (zeros.length > 0) return [...zeros].sort(byWeakest)[0];

  const faces = pool.filter((c) => c.rank === 13 || c.rank === 12 || c.rank === 11);
  if (faces.length > 0) return [...faces].sort(byWeakest)[0];

  // اضطرار: أقل نقاط أولاً
  return [...pool].sort((a, b) => getCardPoints(a) - getCardPoints(b) || byWeakest(a, b))[0];
}

/** Alias retained for callers using the earlier AI function name. */
export const chooseBotBid = evaluateBotBid;
