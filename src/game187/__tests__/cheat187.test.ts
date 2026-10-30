/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from "vitest";
import { GameEngine187 } from "../engine";
import type { Card187, GameState187, TrickPlay187 } from "../types";

const card = (id: string): Card187 => {
  const [suit, rank] = id.split("-");
  return { id, suit: suit as Card187["suit"], rank: Number(rank) as Card187["rank"] };
};

function playState(): GameState187 {
  const e = new GameEngine187({ seed: 2 });
  e.startRound();
  return {
    ...e.state,
    phase: "PLAY",
    bidderSeat: 0,
    trump: "H",
    currentSeat: 0,
    hands: [[], [], [], [], []],
  };
}

describe("187 cheat report", () => {
  it("confirms a cheat committed in the CURRENT in-progress trick (before it is archived)", () => {
    const s = playState();
    s.currentTrick = [
      { seat: 0, card: card("S-14") },
      { seat: 1, card: card("D-6") },
    ];
    s.hands[1] = [card("S-7")];
    const e = new GameEngine187({}, s);
    e.reportCheat(0, 1, "D");
    expect(e.state.lastCheatVerdict?.confirmed).toBe(true);
    expect(e.state.phase).toBe("ROUND_END");
    expect(e.state.winner).toBe("HAKEM");
  });

  it("still confirms via the lead suit naming (backward compatible wording)", () => {
    const s = playState();
    s.currentTrick = [
      { seat: 0, card: card("S-14") },
      { seat: 1, card: card("D-6") },
    ];
    s.hands[1] = [card("S-7")];
    const e = new GameEngine187({}, s);
    e.reportCheat(0, 1, "S");
    expect(e.state.lastCheatVerdict?.confirmed).toBe(true);
  });

  it("does not confirm a current-trick report when the accused legally lacked the led suit", () => {
    const s = playState();
    s.currentTrick = [
      { seat: 0, card: card("S-14") },
      { seat: 1, card: card("D-6") },
    ];
    s.hands[1] = [card("D-7")];
    const e = new GameEngine187({}, s);
    e.reportCheat(0, 1, "D");
    expect(e.state.lastCheatVerdict?.confirmed).toBe(false);
    // الحاكم هو المبلغ هنا، فالبلاغ الخاطئ يكلفه الجولة
    expect(e.state.winner).toBe("OPPONENTS");
  });

  it("confirms a cheat reported by naming the DUMPED card suit in an archived trick", () => {
    const s = playState();
    s.trickHistory = [
      [
        { seat: 0, card: card("S-14") },
        { seat: 1, card: card("D-6") },
      ],
    ] as TrickPlay187[][];
    s.hands[1] = [card("S-7")];
    const e = new GameEngine187({}, s);
    e.reportCheat(0, 1, "D");
    expect(e.state.lastCheatVerdict?.confirmed).toBe(true);
  });

  it("ignores a report against a TEAMMATE even when the accused really cheated (no free win for the hakem)", () => {
    const s = playState();
    s.trickHistory = [
      [
        { seat: 0, card: card("S-14") },
        { seat: 2, card: card("D-6") },
      ],
    ] as TrickPlay187[][];
    s.hands[2] = [card("S-7")];
    const versionBefore = s.version;
    const e = new GameEngine187({}, s);
    // المبلغ 1 والمتهم 2 كلاهما من فريق الخصوم (الحاكم هو 0)
    e.reportCheat(1, 2, "D");
    expect(e.state.phase).toBe("PLAY");
    expect(e.state.lastCheatVerdict).toBeNull();
    expect(e.state.version).toBe(versionBefore);
  });

  it("ignores a FALSE report against a teammate as well", () => {
    const s = playState();
    s.trickHistory = [
      [
        { seat: 0, card: card("S-14") },
        { seat: 2, card: card("S-6") },
      ],
    ] as TrickPlay187[][];
    const e = new GameEngine187({}, s);
    e.reportCheat(1, 2, "S");
    expect(e.state.phase).toBe("PLAY");
    expect(e.state.lastCheatVerdict).toBeNull();
  });

  it("still allows an opponent to report the HAKEM and wins when the hakem cheated", () => {
    const s = playState();
    s.trickHistory = [
      [
        { seat: 1, card: card("S-14") },
        { seat: 0, card: card("D-6") },
      ],
    ] as TrickPlay187[][];
    s.hands[0] = [card("S-7")];
    const e = new GameEngine187({}, s);
    e.reportCheat(1, 0, "D");
    expect(e.state.lastCheatVerdict?.confirmed).toBe(true);
    expect(e.state.winner).toBe("OPPONENTS");
  });
});
