import { describe, it, expect } from "vitest";
import { GameEngine187 } from "../engine";

describe("187 dealer rotation and first lead", () => {
  it("first-dealt player (right of dealer) bids first and leads the first trick", () => {
    const e = new GameEngine187({ seed: 7, initialDealer: 2 });
    e.startRound();
    expect(e.state.currentSeat).toBe(3);
    // everyone passes except seat 4 bidding 75
    e.placeBid(3, 0);
    e.placeBid(4, 75);
    e.placeBid(0, 0);
    e.placeBid(1, 0);
    e.placeBid(2, 0);
    expect(e.state.bidderSeat).toBe(4);
    e.giveAwayCards(
      4,
      e.state.hands[4].slice(0, 4).map((c) => c.id),
    );
    e.declareTrump(4, "S");
    expect(e.state.currentSeat).toBe(3);
  });
  it("next round moves the deal to the next player on the right", () => {
    const e = new GameEngine187({ seed: 7, initialDealer: 4 });
    e.startRound();
    e.nextRound();
    expect(e.state.dealer).toBe(0);
    expect(e.state.currentSeat).toBe(1);
    expect(e.state.roundNo).toBe(2);
  });
});
