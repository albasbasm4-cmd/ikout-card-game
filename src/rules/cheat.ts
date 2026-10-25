/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GameState, Suit, TrickPlay, Card } from "../types/kout";

export type ReportedCardType = Suit | "JOKER" | "MAKER";

export const isType = (c: Card, t: ReportedCardType): boolean =>
  t === "JOKER" ? c.joker === "RED" : t === "MAKER" ? c.joker === "BLACK" : c.suit === t;

/**
 * الغش = اللاعب كسر التبعية رغم أن الورقة المطلوبة موجودة في يده وقتها.
 * الفحص يجري عند المضيف لأن اليد الكاملة عنده فقط.
 */
export function verifyCheatReport(
  state: GameState,
  accusedSeat: number,
  t: ReportedCardType,
): boolean {
  const trump = state.trump;

  // اليد الكاملة وقت الجولة i = اليد الحالية + كل الأوراق النازلة من الجولة i وما بعد
  const fullHandAt = (trickIndex: number): Card[] => [
    ...(state.hands[accusedSeat] ?? []),
    ...state.trickHistory
      .slice(trickIndex + 1)
      .flatMap((plays) => plays.filter((p) => p.seat === accusedSeat).map((p) => p.card)),
    ...state.currentTrick.filter((p) => p.seat === accusedSeat).map((p) => p.card),
  ];

  const consider = (trickIndex: number, plays: TrickPlay[]): boolean => {
    const lead = plays[0];
    if (!lead) return false;
    const ledSuit = lead.card.joker !== undefined ? trump : (lead.card.suit ?? null);
    if (!ledSuit || ledSuit === trump) return false; // تبعية الحكم ما تنكسر
    const play = plays.find((p) => p.seat === accusedSeat);
    if (!play || isType(play.card, t)) return false; // نزل النوع المبلغ عنه → البلاغ غلط
    return fullHandAt(trickIndex).some((c) => isType(c, t)); // كان عنده النوع وما نزله = غش مؤكد
  };

  return (
    state.trickHistory.some((plays, i) => consider(i, plays)) ||
    consider(state.trickHistory.length, state.currentTrick)
  );
}
