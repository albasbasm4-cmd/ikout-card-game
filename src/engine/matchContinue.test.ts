import { describe, it, expect } from "vitest";
import { canDecideContinue, koutLoserTeam } from "./matchContinue";
import type { GameState } from "../types/kout";

const base = (scores: [number, number], extra: Partial<GameState> = {}): GameState =>
  ({
    variant: "BO4", hands: [], dealer: 0, currentSeat: 0, bids: [], highBid: null, bidderSeat: null,
    trump: null, currentTrick: [], trickHistory: [], tricksWon: [0, 0], scores, phase: "GAME_END",
    roundNo: 5, targetScore: 51, version: 1, ...extra,
  }) as GameState;

describe("Kout continue decision", () => {
  it("losing team is the team below target", () => {
    expect(koutLoserTeam(base([20, 52]))).toBe(0);
    expect(koutLoserTeam(base([51, 30]))).toBe(1);
  });
  it("only a losing-team human may decide", () => {
    const s = base([20, 52]); // team 0 (seats 0,2) lost
    expect(canDecideContinue(s, 0, [0, 1])).toBe(true);
    expect(canDecideContinue(s, 1, [0, 1])).toBe(false);
  });
  it("if no human lost, the human winner decides", () => {
    expect(canDecideContinue(base([60, 10]), 0, [0])).toBe(true);
  });
  it("no decision once the match is stopped", () => {
    expect(canDecideContinue(base([20, 52], { matchStopped: true }), 0, [0])).toBe(false);
  });
});
