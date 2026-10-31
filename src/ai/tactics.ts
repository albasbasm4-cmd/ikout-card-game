/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * طبقة التكتيكات المشتركة للبوتات في كوت.
 *
 * القواعد المنفذة:
 * 1. حفظ الحكم من الحاكم الخصم: إذا كان صاحب المزايدة (الحاكم) على فريق الخصم،
 *    لا ينزل البوت أوراق الحكم (ولا الماكر/الجوكر) على الطاولة أبداً
 *    إلا إذا لم يتبق في يده إلا حكم، أو استُنفد حكم الخصوم من اللعب.
 * 2. الجوكر الأحمر يخطف أكلة الحاكم الخصم إذا بدأها بورقة حكم.
 * 3. تثبيت أكلة الصاحب: إذا كانت الورقة الرابحة حالياً من يد صاحبه (ورقة عادية
 *    هشة يمكن للخصم خطفها)، ينزل البوت ورقة حكم لتأمين الأكلة للفريق
 *    بدل ورقة عادية يخطفها الخصم.
 * 4. مشاركة القيادة مع الحاكم صاحبه: إذا كان الحاكم على فريق البوت والبوت هو
 *    مالك اللعبة الحالية (يقود الأكلة)، يسحب أوراق حكمه أولاً ليصبح الحاكم
 *    وحده من يملك الحكم في الفريق، ثم يقود بأقوى ورقة عادية بعد نفاد حكمه.
 * 5. ملاحقة الحاكم الخصم: يتابع الأنواع العادية التي أظهر الحاكم أنها في يده،
 *    وعند قيادة البوت يفضّل قيادة أعلى ورقة من نوع انكشف عند الحاكم لسحب
 *    بقية أوراقه، ويتجنب الأنواع التي انكشف أنه خالٍ منها.
 */

import { Card, Difficulty, GameState, Suit, TrickPlay } from "../types/kout";
import { RULES } from "../rules/config";
import { buildDeck } from "../rules/deck";
import { cardStrength, trickWinner } from "../rules/cards";
import { getPlayedCards } from "../engine/KoutTricks";

/** أوراق الحكم وماكره وجوكره تعامل معاملة الحكم (عائلة الحكم). */
export function isTrumpClass(card: Card, trump: Suit | null): boolean {
  if (card.joker !== undefined) return true;
  return trump !== null && card.suit === trump;
}

/** هل الحاكم (صاحب المزايدة) على فريق الخصم بالنسبة لهذا البوت؟ */
export function hakamIsOpponent(state: GameState, seat: number): boolean {
  return state.bidderSeat !== null && state.bidderSeat % 2 !== seat % 2;
}

/** هل الحاكم على فريق البوت (والبوت ليس هو الحاكم)؟ */
export function hakamIsTeammate(state: GameState, seat: number): boolean {
  return (
    state.bidderSeat !== null && state.bidderSeat !== seat && state.bidderSeat % 2 === seat % 2
  );
}

/** هل استُنفد حكم الخصوم؟ كل أوراق عائلة الحكم إما منزلة أو في يد هذا البوت. */
export function opponentsTrumpsExhausted(state: GameState, seat: number): boolean {
  if (!state.trump) return false;
  const played = getPlayedCards(state.trickHistory, state.currentTrick);
  const playedIds = new Set(played.map((c) => c.id));
  const myIds = new Set((state.hands[seat] || []).map((c) => c.id));
  const trumpFamily = buildDeck(state.variant).filter((c) => isTrumpClass(c, state.trump));
  return trumpFamily.every((c) => playedIds.has(c.id) || myIds.has(c.id));
}

/** الأنواع العادية التي نزّل منها الحاكم أوراقاً (من المرجح أن يملك المزيد منها). */
export function hakamRevealedSuits(state: GameState): Set<Suit> {
  const revealed = new Set<Suit>();
  if (state.bidderSeat === null) return revealed;
  for (const trick of state.trickHistory) {
    if (trick.length === 0) continue;
    for (const play of trick) {
      if (play.seat !== state.bidderSeat) continue;
      const card = play.card;
      if (card.joker !== undefined) continue;
      if (state.trump && card.suit === state.trump) continue;
      if (card.suit) revealed.add(card.suit);
    }
  }
  return revealed;
}

/** الأنواع العادية التي انكشف أن الحاكم خالٍ منها (لم يتبع نوعاً منزلاً). */
export function hakamVoidSuits(state: GameState): Set<Suit> {
  const voids = new Set<Suit>();
  if (state.bidderSeat === null) return voids;
  for (const trick of state.trickHistory) {
    if (trick.length === 0) continue;
    const lead = trick[0].card;
    const ledSuit: Suit | null =
      lead.joker === "RED" ? "S" : lead.joker === "BLACK" ? state.trump : (lead.suit ?? null);
    if (!ledSuit || ledSuit === state.trump) continue;
    for (let i = 1; i < trick.length; i++) {
      const play = trick[i];
      if (play.seat !== state.bidderSeat) continue;
      if (play.card.joker !== undefined) continue;
      if (play.card.suit !== ledSuit) voids.add(ledSuit);
    }
  }
  return voids;
}

/** نوع الأكلة المتبع حسب قوانين الجوكر والماكر. */
function ledSuitOf(trick: TrickPlay[], trump: Suit | null): Suit | null {
  if (trick.length === 0) return null;
  const lead = trick[0].card;
  if (lead.joker === "RED") return "S";
  if (lead.joker === "BLACK") return trump;
  return lead.suit ?? null;
}

export interface KoutTacticResult {
  /** قرار قسري تفرضه التكتيكات إن وُجد. */
  forced?: Card;
  /** المرشحات المسموح لبحث القرار الاختيار منها. */
  candidates: Card[];
}

/**
 * يطبق قواعد التكتيك على المرشحات القانونية قبل بحث القرار.
 * القواعد الصارمة (حفظ الحكم ومنع إحراقه) تنطبق على كل المستويات،
 * أما القرارات الذكية القسرية (خطف الجوكر ومشاركة القيادة والملاحقة)
 * فتفعّل في المتوسط والخبير.
 */
export function koutTacticDecision(
  state: GameState,
  seat: number,
  legal: Card[],
  difficulty?: Difficulty,
): KoutTacticResult {
  const trump = state.trump;
  const hand = state.hands[seat] || [];
  const trick = state.currentTrick;
  if (legal.length <= 1 || !trump || state.bidderSeat === null) {
    return { candidates: legal };
  }

  const smart = difficulty === undefined || difficulty !== "EASY";

  // 2) الجوكر الأحمر يخطف أكلة الحاكم الخصم إذا بدأها بحكم
  if (smart && hakamIsOpponent(state, seat) && trick.length > 0) {
    const lead = trick[0];
    if (lead.seat === state.bidderSeat && isTrumpClass(lead.card, trump)) {
      const redJoker = legal.find((c) => c.joker === "RED");
      const winnerNow = trickWinner(trick, trump);
      const allyWinning = winnerNow.seat !== seat && winnerNow.seat % 2 === seat % 2;
      if (redJoker && !allyWinning) return { forced: redJoker, candidates: legal };
    }
  }

  // 4) الحاكم صاحبه والبوت مالك اللعبة: يسحب حكمه ليصبح الحاكم وحده معه
  if (smart && hakamIsTeammate(state, seat) && trick.length === 0) {
    const trumpCards = legal.filter((c) => c.suit === trump);
    if (trumpCards.length > 0) {
      const highest = [...trumpCards].sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))[0];
      return { forced: highest, candidates: legal };
    }
    // نفد حكم البوت: الحكم صار مع صاحبه وحده، فيقود بأقوى ورقة عادية
    const plains = legal.filter((c) => c.joker === undefined);
    if (plains.length > 0) {
      const strongest = [...plains].sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))[0];
      return { forced: strongest, candidates: legal };
    }
  }

  const protectTrumps = hakamIsOpponent(state, seat) && !opponentsTrumpsExhausted(state, seat);

  // 1) حفظ الحكم من الحاكم الخصم
  let candidates = legal;
  if (protectTrumps) {
    const handAllTrump = hand.every((c) => isTrumpClass(c, trump));
    if (!handAllTrump) {
      const plains = legal.filter((c) => c.joker === undefined && c.suit !== trump);
      if (plains.length > 0) {
        // يسمح بالجوكر فقط إذا كانت الأكلة قادتها يد الحاكم الخصم بحكم (خطفها)
        const allowJokers =
          trick.length > 0 &&
          trick[0].seat === state.bidderSeat &&
          isTrumpClass(trick[0].card, trump);
        candidates = allowJokers
          ? [...plains, ...legal.filter((c) => c.joker !== undefined)]
          : plains;
      }
    }
  }

  // 3) تثبيت أكلة الصاحب الهشة بورقة حكم (لا يطبق أثناء حفظ الحكم)
  if (!protectTrumps && trick.length > 0 && trick.length < RULES[state.variant].seats - 1) {
    const winner = trickWinner(trick, trump);
    const partnerWinning = winner.seat !== seat && winner.seat % 2 === seat % 2;
    const partnerVulnerable = !isTrumpClass(winner.card, trump);
    if (partnerWinning && partnerVulnerable) {
      const led = ledSuitOf(trick, trump);
      const secures = candidates.filter((c) => isTrumpClass(c, trump));
      if (secures.length > 0) {
        const cheapest = [...secures].sort(
          (a, b) => cardStrength(a, trump, led) - cardStrength(b, trump, led),
        )[0];
        return { forced: cheapest, candidates };
      }
    }
  }

  // لا تُحرَق الجوكر ولا آكة الحكم إذا كان الصاحب رابحاً بأكلة حكم قوية
  if (trick.length > 0) {
    const winner = trickWinner(trick, trump);
    if (winner.seat !== seat && winner.seat % 2 === seat % 2 && isTrumpClass(winner.card, trump)) {
      const ordinary = candidates.filter(
        (c) => !c.joker && !(trump && c.suit === trump && c.rank === 14),
      );
      if (ordinary.length > 0) candidates = ordinary;
    }
  }

  // 5) ملاحقة الحاكم الخصم عند القيادة: أعلى ورقة من نوع انكشف عنده
  if (smart && trick.length === 0) {
    const revealed = hakamRevealedSuits(state);
    const voids = hakamVoidSuits(state);
    const huntCards = candidates.filter(
      (c) =>
        c.joker === undefined &&
        c.suit !== trump &&
        c.suit !== undefined &&
        revealed.has(c.suit) &&
        !voids.has(c.suit),
    );
    if (huntCards.length > 0) {
      const best = [...huntCards].sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))[0];
      return { forced: best, candidates };
    }
  }

  return { candidates };
}

/**
 * سياسة مختصرة للمحاكاة (rollout) والبديل الاحتياطي:
 * حماية الصاحب + حفظ الحكم من الحاكم الخصم.
 */
export function rolloutPolicy(
  legal: Card[],
  hand: Card[],
  trick: TrickPlay[],
  trump: Suit | null,
  seat: number,
  bidderSeat: number | null,
  played: Card[],
): Card[] {
  let cards = partnerSafeCards(legal, trick, trump, seat);
  if (bidderSeat !== null && trump && bidderSeat % 2 !== seat % 2) {
    const handAllTrump = hand.every((c) => isTrumpClass(c, trump));
    if (!handAllTrump) {
      const plains = cards.filter((c) => c.joker === undefined && c.suit !== trump);
      if (plains.length > 0) cards = plains;
    }
  }
  return cards;
}

/** سياسة البوت فقط: لا يُحرق الجوكر ولا آكة الحكم على أكلة رابحة للحليف. */
export function partnerSafeCards(
  legal: Card[],
  trick: TrickPlay[],
  trump: Suit | null,
  seat: number,
): Card[] {
  if (!trick.length || trickWinner(trick, trump).seat % 2 !== seat % 2) return legal;
  const ordinary = legal.filter((c) => !c.joker && !(trump && c.suit === trump && c.rank === 14));
  return ordinary.length ? ordinary : legal;
}
