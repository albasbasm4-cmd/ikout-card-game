/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import { KoutGameEngine } from "../engine/KoutGameEngine";
import type { Card, GameState, PlayerSlot, Suit } from "../types/kout";
import { applyCheatVerdict, verifyCheatReport, type ReportedCardType } from "./cheat";

/**
 * دلالات البلاغ عن الغش في الكوت:
 * - النوع المُبلَّغ عنه يُقبل بمعنيين: نوع ورقة بداية الأكلة، أو نوع الورقة التي نزلها
 *   المتهم فعلاً (كما ترشد نافذة البلاغ) — وأي منهما يكفي لإثبات كسر التبعية.
 * - البلاغ عن لاعب في فريق المُبلِّغ نفسه (أو عن النفس) مرفوض.
 * - إنزال الجوكر لا يُعد كسر تبعية أبداً.
 */

const humanPlayers = (seats: number): PlayerSlot[] =>
  Array.from({ length: seats }, (_, seat) => ({
    seatIndex: seat,
    kind: "HUMAN_LOCAL" as const,
    name: `لاعب ${seat + 1}`,
    team: (seat % 2) as 0 | 1,
    connected: true,
  }));

function midTrickState(
  seed: number,
  opts: { leadSeat: number; cheatSeat: number },
): { state: GameState; ledSuit: Suit; cheatSeat: number } {
  const engine = new KoutGameEngine({ variant: "BO4", initialDealer: 0, seed });
  engine.startRound();
  engine.placeBid(1, 6);
  for (const s of [2, 3, 0]) engine.placeBid(s, 0);
  engine.declareTrump(1, "C");

  // المقعد على يمين الحاكم يبدأ الأول
  const leadSeat = opts.leadSeat;
  const cheatSeat = opts.cheatSeat;
  const order: number[] = [];
  for (let s = leadSeat; order.length < 4; s = (s + 1) % 4) order.push(s);

  const leadCard = engine.state.hands[leadSeat].find(
    (c) => c.suit !== "C" && c.joker === undefined,
  ) as Card;
  if (!leadCard) throw new Error("no non-trump lead");
  engine.playCard(leadSeat, leadCard);
  const ledSuit = leadCard.suit as Suit;

  for (const seat of order.slice(1)) {
    if (seat === cheatSeat) {
      // المتهم يكسر التبعية وهو يحتفظ بورقة من نوع الأكلة
      const broke = engine.state.hands[seat].find(
        (c) => c.joker === undefined && c.suit !== ledSuit && c.suit !== "C",
      );
      if (!broke) throw new Error("no off-suit card to break with");
      engine.playCard(seat, broke, { allowAnyCard: true });
    } else {
      const follow = engine.state.hands[seat].find((c) => c.suit === ledSuit);
      const any = engine.state.hands[seat].find((c) => c.joker === undefined);
      engine.playCard(seat, follow ?? (any as Card), { allowAnyCard: true });
    }
  }

  return { state: engine.state, ledSuit, cheatSeat };
}

describe("verifyCheatReport — معنى النوع المُبلَّغ عنه", () => {
  it("يقبل نوع الورقة التي نزلها المتهم فعلاً (كما ترشد نافذة البلاغ)", () => {
    const { state, cheatSeat, ledSuit } = midTrickState(1, { leadSeat: 2, cheatSeat: 0 });
    const played = state.trickHistory.length
      ? state.trickHistory[0].find((p) => p.seat === cheatSeat)!.card
      : state.currentTrick.find((p) => p.seat === cheatSeat)!.card;
    expect(played.suit).not.toBe(ledSuit);
    expect(verifyCheatReport(state, cheatSeat, played.suit as Suit)).toBe(true);
  });

  it("يقبل نوع ورقة بداية الأكلة أيضاً (المعنى القديم)", () => {
    const { state, cheatSeat, ledSuit } = midTrickState(1, { leadSeat: 2, cheatSeat: 0 });
    expect(verifyCheatReport(state, cheatSeat, ledSuit)).toBe(true);
  });

  it("لا يؤكد بلاغاً بنوع لم ينزله المتهم ولم يكن نوع الأكلة", () => {
    const { state, cheatSeat, ledSuit } = midTrickState(1, { leadSeat: 2, cheatSeat: 0 });
    const wrong = (["S", "H", "D", "C"] as const).find(
      (s) =>
        s !== ledSuit &&
        s !== state.currentTrick.find((p) => p.seat === cheatSeat)?.card.suit &&
        s !== state.trickHistory[0]?.find((p) => p.seat === cheatSeat)?.card.suit,
    );
    if (wrong) expect(verifyCheatReport(state, cheatSeat, wrong)).toBe(false);
  });
});

describe("applyCheatVerdict — حماية الفريق الواحد", () => {
  it("يرفض البلاغ عن زميل في الفريق نفسه", () => {
    const { state } = midTrickState(1, { leadSeat: 2, cheatSeat: 0 });
    // المُبلِّغ من فريق المتهم (كلاهما فريق 0 أو كلاهما فريق 1)
    const accusedTeam = state.players?.[0]?.team ?? 0;
    const teammate =
      state.players?.findIndex((p) => p.team === accusedTeam && p.seatIndex !== 0) ?? -1;
    expect(teammate).toBeGreaterThan(-1);
    const result = applyCheatVerdict(state, teammate, 0, "H");
    expect(result).toBeNull();
  });

  it("يرفض البلاغ عن النفس", () => {
    const { state } = midTrickState(1, { leadSeat: 2, cheatSeat: 0 });
    expect(applyCheatVerdict(state, 0, 0, "H")).toBeNull();
  });

  it("يقبل بلاغاً صحيحاً على الفريق المقابل ويضاعف نقاط المُبلِّغ", () => {
    const { state, ledSuit } = midTrickState(1, { leadSeat: 2, cheatSeat: 0 });
    // المتهم فريق 0، المُبلِّغ فريق 1
    const reporter = state.players?.findIndex((p) => p.team === 1) ?? 1;
    const result = applyCheatVerdict(state, reporter, 0, ledSuit as ReportedCardType);
    expect(result).not.toBeNull();
    expect(result!.confirmed).toBe(true);
    expect(result!.winningTeam).toBe(1);
    expect(result!.nextState.scores[1]).toBe(state.scores[1] + result!.pointsAdded);
    expect(result!.nextState.scores[0]).toBe(state.scores[0]);
  });
});
