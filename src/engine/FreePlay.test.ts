/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import { KoutGameEngine } from "./KoutGameEngine";
import type { Card, Suit } from "../types/kout";
import { verifyCheatReport } from "../rules/cheat";

/**
 * اللعب الحر ضد لاعبين بشريين: نزول أي ورقة مسموح، والغش يُحكم به فقط عند البلاغ.
 * هذا يختبر السيناريو: الحاكم (المقعد 1) ينزل آخر واحد في الأكلة الأولى،
 * والذي على يمينه (المقعد 2) يبدأ الأكلة الأولى.
 */
describe("Free play vs humans + cheat report verdict", () => {
  function startGame(seed: number): KoutGameEngine {
    const engine = new KoutGameEngine({ variant: "BO6", initialDealer: 0, seed });
    engine.startRound();
    engine.placeBid(1, 6);
    for (let s = 2; s <= 5; s++) engine.placeBid(s, 0);
    engine.placeBid(0, 0);
    engine.declareTrump(1, "C");
    return engine;
  }

  it("rejects an off-suit card without free play and allows it with allowAnyCard", () => {
    const engine = startGame(1);

    // Seat 2 leads first trick (on the right of bidder seat 1)
    const lead = engine.state.hands[2].find((c) => c.suit !== "C" && c.joker === undefined) as Card;
    if (!lead) throw new Error("no non-trump lead at seed 1");
    engine.playCard(2, lead);

    const ledSuit = lead.suit as Suit;
    const hand3 = engine.state.hands[3];
    const follow = hand3.find((c) => c.suit === ledSuit);
    const offSuit = hand3.find((c) => c.joker === undefined && c.suit !== ledSuit);
    expect(follow).toBeDefined();

    if (offSuit) {
      // بدون اللعب الحر: مرفوضة
      expect(() => engine.playCard(3, offSuit)).toThrowError(/Must follow suit/);
      // مع اللعب الحر: مسموحة
      expect(() => engine.playCard(3, offSuit, { allowAnyCard: true })).not.toThrow();
      const played = engine.state.currentTrick.find((p) => p.seat === 3);
      expect(played?.card.id).toBe(offSuit.id);
    }
  });

  it("confirms a cheat report when the accused held the led suit but played off-suit", () => {
    const engine = startGame(1);
    const lead = engine.state.hands[2].find((c) => c.suit !== "C" && c.joker === undefined) as Card;
    if (!lead) throw new Error("no non-trump lead at seed 1");
    engine.playCard(2, lead);
    const ledSuit = lead.suit;

    const hand3 = engine.state.hands[3];
    const offSuit = hand3.find((c) => c.joker === undefined && c.suit !== ledSuit);
    expect(offSuit).toBeDefined();
    engine.playCard(3, offSuit as never, { allowAnyCard: true });

    // يبلّغ أحدهم أن اللاعب 3 كسر التبعية لورقة من نوع المتبع — النظام يتحقق
    expect(verifyCheatReport(engine.state, 3, ledSuit as Suit)).toBe(true);
  });

  it("does not confirm a cheat report when the accused had no card of the led suit", () => {
    const engine = startGame(1);
    const lead = engine.state.hands[2].find((c) => c.suit !== "C" && c.joker === undefined) as Card;
    if (!lead) throw new Error("no non-trump lead at seed 1");
    engine.playCard(2, lead);
    const ledSuit = lead.suit;

    const hand3 = engine.state.hands[3];
    const otherSuit = (["S", "H", "D", "C"] as const).find(
      (s) => s !== ledSuit && !hand3.some((c) => c.suit === s),
    );
    if (otherSuit) {
      const offSuit = hand3.find((c) => c.joker === undefined && c.suit !== ledSuit);
      if (offSuit) {
        engine.playCard(3, offSuit, { allowAnyCard: true });
        expect(verifyCheatReport(engine.state, 3, otherSuit)).toBe(false);
      }
    }
  });
});
