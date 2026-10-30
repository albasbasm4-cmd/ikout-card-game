/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from "vitest";
import { chooseBotDiscards, chooseBotTrump, planBotDiscardAndTrump } from "../ai";
import { GameEngine187 } from "../engine";
import type { Card187 } from "../types";

const card = (id: string): Card187 => {
  const [suit, rank] = id.split("-");
  return { id, suit: suit as Card187["suit"], rank: Number(rank) as Card187["rank"] };
};

/** يد حاكم قوية في الهاص وضعيفة في السبيد: 12 ورقة كما بعد فوز المزايدة */
const HEARTS_STRONG_HAND = [
  "H-2",
  "H-14",
  "H-13",
  "D-14",
  "C-14",
  "S-6",
  "S-7",
  "S-8",
  "S-9",
  "D-6",
  "C-6",
  "D-7",
].map(card);

describe("187 bot discard planning", () => {
  it("plans the trump from the full 12-card hand", () => {
    const plan = planBotDiscardAndTrump(HEARTS_STRONG_HAND);
    expect(plan.trump).toBe("H");
    expect(plan.trump).toBe(chooseBotTrump(HEARTS_STRONG_HAND));
  });

  it("never discards cards of the planned trump suit", () => {
    const plan = planBotDiscardAndTrump(HEARTS_STRONG_HAND);
    const heartIds = HEARTS_STRONG_HAND.filter((c) => c.suit === "H").map((c) => c.id);
    for (const id of heartIds) {
      expect(plan.discards).not.toContain(id);
    }
  });

  it("discards the weak off-trump cards (dead spades) instead of trump winners", () => {
    const plan = planBotDiscardAndTrump(HEARTS_STRONG_HAND);
    // أضعف أوراق السبيد الميتة تُطرد
    expect(plan.discards).toContain("S-6");
    expect(plan.discards).not.toContain("H-2");
    expect(plan.discards).not.toContain("H-14");
    expect(plan.discards).not.toContain("H-13");
  });

  it("regression: the old hardcoded 'S' plan threw away a real trump winner", () => {
    // بالكود القديم كان يُمرر "S" كحكم ثابت فيُطرد K الهاص (ورقة حكم رابحة)
    const buggyDiscards = chooseBotDiscards(HEARTS_STRONG_HAND, "S");
    expect(buggyDiscards).toContain("H-13");
    // بينما الخطة الصحيحة تحتفظ به
    const plan = planBotDiscardAndTrump(HEARTS_STRONG_HAND);
    expect(plan.discards).not.toContain("H-13");
  });

  it("the planned trump is playable: giveAwayCards then declareTrump succeed", () => {
    const engine = new GameEngine187({ seed: 777, initialDealer: 0 });
    engine.startRound();
    engine.placeBid(1, 85);
    engine.placeBid(2, 0);
    engine.placeBid(3, 0);
    engine.placeBid(4, 0);
    engine.placeBid(0, 0);
    const hakemSeat = engine.state.bidderSeat!;
    const plan = planBotDiscardAndTrump(engine.state.hands[hakemSeat]);
    engine.giveAwayCards(hakemSeat, plan.discards);
    engine.declareTrump(hakemSeat, plan.trump);
    expect(engine.state.phase).toBe("PLAY");
    expect(engine.state.trump).toBe(plan.trump);
    // يده المتبقية 8 أوراق ولم تتضمن أي ورقة من الخطة
    const remaining = engine.state.hands[hakemSeat].map((c) => c.id);
    for (const id of plan.discards) expect(remaining).not.toContain(id);
    expect(remaining.length).toBe(8);
  });
});
