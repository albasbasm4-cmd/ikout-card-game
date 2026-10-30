/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GameState, Suit, TrickPlay, Card } from "../types/kout";
import { RULES } from "./config";

export type ReportedCardType = Suit | "JOKER" | "MAKER";

export const isType = (c: Card, t: ReportedCardType): boolean =>
  t === "JOKER" ? c.joker === "RED" : t === "MAKER" ? c.joker === "BLACK" : c.suit === t;

/**
 * تحديد نوع الورقة التي طلبتها الأكلة (Led Suit)
 * - الجوكر الأحمر إذا نزل أول ورقة يتحول إلى سبيت (S)
 * - الماكر الأسود إذا نزل أول ورقة يتحول إلى حكم (trump)
 * - أي ورقة عادية يعتمد نوعها
 */
export function getLedSuitOfTrick(plays: TrickPlay[], trump: Suit | null): Suit | null {
  const lead = plays[0];
  if (!lead) return null;
  if (lead.card.joker === "RED") return "S";
  if (lead.card.joker === "BLACK") return trump;
  return lead.card.suit ?? null;
}

/**
 * الغش = اللاعب كسر التبعية (off-suit) رغم أن الورقة المطلوبة (أو نوع البلاغ) كانت في يده وقتها.
 * الفحص يجري عند المضيف/المحرك لأن اليد الكاملة عنده فقط.
 */
export function verifyCheatReport(
  state: GameState,
  accusedSeat: number,
  t: ReportedCardType,
): boolean {
  const trump = state.trump;

  // كل الأكلات التي لُعبت حتى الآن
  const allTricks: TrickPlay[][] = [...state.trickHistory];
  if (state.currentTrick && state.currentTrick.length > 0) {
    allTricks.push(state.currentTrick);
  }

  // الأوراق التي كانت في يد اللاعب وقت الأكلة trickIdx
  const handAtTrick = (trickIdx: number): Card[] => [
    ...(state.hands[accusedSeat] ?? []),
    ...allTricks
      .slice(trickIdx + 1)
      .flatMap((plays) => plays.filter((p) => p.seat === accusedSeat).map((p) => p.card)),
  ];

  for (let idx = 0; idx < allTricks.length; idx++) {
    const plays = allTricks[idx];
    if (!plays || plays.length === 0) continue;

    const ledSuit = getLedSuitOfTrick(plays, trump);
    if (!ledSuit) continue;

    const accusedPlay = plays.find((p) => p.seat === accusedSeat);
    if (!accusedPlay) continue;

    // هل النوع المبلغ عنه يطابق الورقة المطلوبة في الأكلة؟
    const matchesTarget = t === ledSuit || (ledSuit === trump && (t === "MAKER" || t === trump));
    if (!matchesTarget) continue;

    // هل نزل ورقة تتبع المطلوب أو جوكر مسموح؟
    const playedCard = accusedPlay.card;
    const followedSuit =
      playedCard.suit === ledSuit ||
      (ledSuit === trump && playedCard.joker !== undefined) ||
      playedCard.joker !== undefined; // الجوكر مسموح إنزاله بأي وقت

    // إذا اتبع الأكلة، فإنه لم يكسر التبعية في هذه اللعبة
    if (followedSuit) continue;

    // اللاعب نزل ورقة مخالفة (off-suit) في أكلة طلبت ledSuit / t
    // هل كانت لديه في يده وقتها أي ورقة من النوع المُبلّغ عنه؟
    const heldHand = handAtTrick(idx);
    const heldCheatedType = heldHand.some((c) => isType(c, t) || c.suit === ledSuit);

    if (heldCheatedType) {
      return true; // غش مؤكد!
    }
  }

  return false;
}

export interface CheatResolutionResult {
  confirmed: boolean;
  reporterSeat: number;
  accusedSeat: number;
  cardType: ReportedCardType;
  winningTeam: 0 | 1;
  losingTeam: 0 | 1;
  pointsAdded: number;
  nextState: GameState;
  announcement: string;
}

/**
 * تطبيق حكم البلاغ عن الغش:
 * - إذا طلع كلام المُبلِّغ صحيح: يخسر الفريق الذي غش وتتدبل النقاط لفريق المُبلِّغ.
 * - إذا كان جواب المُبلِّغ خاطئ: تُحتسب النقاط المضاعفة للفريق الذي تم الإبلاغ عنه.
 */
export function applyCheatVerdict(
  state: GameState,
  reporterSeat: number,
  accusedSeat: number,
  cardType: ReportedCardType,
): CheatResolutionResult {
  const confirmed = verifyCheatReport(state, accusedSeat, cardType);
  const highBid = state.highBid ?? 5;
  const pointsAdded = highBid * 2; // تدبيل النقاط: 5->10, 6->12, 7->14, 8->16, 9->18

  const reporterTeam: 0 | 1 =
    state.players && state.players[reporterSeat]
      ? state.players[reporterSeat].team
      : ((reporterSeat % 2) as 0 | 1);

  const accusedTeam: 0 | 1 =
    state.players && state.players[accusedSeat]
      ? state.players[accusedSeat].team
      : ((accusedSeat % 2) as 0 | 1);

  const winningTeam: 0 | 1 = confirmed ? reporterTeam : accusedTeam;
  const losingTeam: 0 | 1 = (1 - winningTeam) as 0 | 1;

  const currentScores: [number, number] = [state.scores[0], state.scores[1]];
  const newScores: [number, number] = [
    currentScores[0] + (winningTeam === 0 ? pointsAdded : 0),
    currentScores[1] + (winningTeam === 1 ? pointsAdded : 0),
  ];

  const targetScore = state.targetScore ?? 51;
  const isGameOver = newScores[0] >= targetScore || newScores[1] >= targetScore;
  const numSeats = RULES[state.variant].seats;
  const nextDealer = (state.dealer + 1) % numSeats;

  const nextState: GameState = {
    ...state,
    scores: newScores,
    dealer: nextDealer,
    phase: isGameOver ? "GAME_END" : "ROUND_END",
    version: state.version + 1,
  };

  const accusedName = state.players?.[accusedSeat]?.name || `لاعب ${accusedSeat + 1}`;
  const reporterName = state.players?.[reporterSeat]?.name || `لاعب ${reporterSeat + 1}`;
  const suitNames: Record<ReportedCardType, string> = {
    S: "سبيت",
    H: "هاص",
    D: "ديمن",
    C: "كلفس",
    JOKER: "جوكر أحمر",
    MAKER: "ماكر أسود",
  };

  const announcement = confirmed
    ? `⚖️ غش مؤكد: ثبت أن ${accusedName} كسر التبعية في ورقة ${suitNames[cardType]}! تم احتساب ${pointsAdded} نقطة مضاعفة لفريق ${reporterName}.`
    : `⚖️ بلاغ خاطئ: لم يثبت غش ${accusedName} في ورقة ${suitNames[cardType]}! تم احتساب ${pointsAdded} نقطة مضاعفة لفريق ${accusedName}.`;

  return {
    confirmed,
    reporterSeat,
    accusedSeat,
    cardType,
    winningTeam,
    losingTeam,
    pointsAdded,
    nextState,
    announcement,
  };
}
