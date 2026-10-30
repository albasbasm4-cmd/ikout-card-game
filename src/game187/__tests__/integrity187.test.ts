import { describe, expect, it } from "vitest";
import { GameEngine187 } from "../engine";
import type { GameState187 } from "../types";
function playing(): GameState187 {
  const e = new GameEngine187({ seed: 2 });
  e.startRound();
  return {
    ...e.state,
    phase: "PLAY",
    bidderSeat: 0,
    trump: "H",
    currentSeat: 0,
    hands: [[{ id: "real", suit: "S", rank: 14 }], [], [], [], []],
  };
}
describe("187 card integrity", () => {
  it("uses held card attributes rather than forged submitted attributes", () => {
    const e = new GameEngine187({}, playing());
    e.playCard(0, { id: "real", suit: "C", rank: 2 });
    expect(e.state.currentTrick[0].card).toEqual({ id: "real", suit: "S", rank: 14 });
  });
  it("does not confirm cheating when the player legally lacks the led suit", () => {
    const s = playing();
    s.trickHistory = [
      [
        { seat: 0, card: { id: "lead", suit: "S", rank: 14 } },
        { seat: 1, card: { id: "off", suit: "D", rank: 6 } },
      ],
    ];
    s.hands[1] = [{ id: "remaining", suit: "D", rank: 7 }];
    const e = new GameEngine187({}, s);
    e.reportCheat(0, 1, "S");
    expect(e.state.lastCheatVerdict?.confirmed).toBe(false);
  });
  it("confirms failure to follow suit when a following card was held", () => {
    const s = playing();
    s.trickHistory = [
      [
        { seat: 0, card: { id: "lead", suit: "S", rank: 14 } },
        { seat: 1, card: { id: "off", suit: "D", rank: 6 } },
      ],
    ];
    s.hands[1] = [{ id: "remaining", suit: "S", rank: 7 }];
    const e = new GameEngine187({}, s);
    e.reportCheat(0, 1, "S");
    expect(e.state.lastCheatVerdict?.confirmed).toBe(true);
  });
});
