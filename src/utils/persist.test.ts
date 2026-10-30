import { describe, it, expect } from "vitest";
import { KoutGameEngine } from "../engine/KoutGameEngine";
import { saveGameState, loadSavedGameState } from "./persist";

describe("save and resume", () => {
  it("restores the exact saved state into a new engine", () => {
    const e = new KoutGameEngine({ variant: "BO4", seed: 7 });
    e.startRound(99);
    e.placeBid(e.state.currentSeat, 6);
    saveGameState(e.state as any);
    const loaded = loadSavedGameState();
    expect(loaded).toEqual(e.state);
    const resumed = new KoutGameEngine({}, loaded!);
    expect(resumed.state.hands).toEqual(e.state.hands);
    expect(resumed.state.currentSeat).toBe(e.state.currentSeat);
    expect(resumed.state.bids).toEqual(e.state.bids);
  });
});
