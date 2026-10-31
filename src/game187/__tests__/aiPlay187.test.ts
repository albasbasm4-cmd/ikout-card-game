/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import { Card187, GameState187, TrickPlay187 } from "../types";
import { chooseBotCardToPlay } from "../ai";

const c = (suit: string, rank: number): Card187 => ({
  id: `${suit}-${rank}`,
  suit: suit as Card187["suit"],
  rank: rank as Card187["rank"],
});
const play = (seat: number, card: Card187): TrickPlay187 => ({ seat, card });

function mockState(overrides: Partial<GameState187> = {}): GameState187 {
  return {
    roundNo: 1,
    dealer: 0,
    currentSeat: 0,
    hands: [[], [], [], [], []],
    tableCards: [],
    bids: [],
    passedSeats: [false, false, false, false, false],
    highBid: 75,
    bidderSeat: 0,
    trump: "S",
    currentTrick: [],
    trickHistory: [],
    tricksWon: [0, 0, 0, 0, 0],
    capturedCards: [[], [], [], [], []],
    hakemPoints: 0,
    opponentsPoints: 0,
    earlySettled: false,
    earlySettledWinner: null,
    continueAfterEarlySettle: false,
    phase: "PLAY",
    players: [0, 1, 2, 3, 4].map((i) => ({
      seatIndex: i,
      kind: i === 0 ? "HUMAN_LOCAL" : "AI_BOT",
      name: `p${i}`,
    })),
    winner: null,
    version: 1,
    ...overrides,
  } as GameState187;
}

describe("187: 2 كلفس والنقاط المضمونة", () => {
  it("يصرف 2 كلفس في أكلة مضمونة له (آخر لاعب وفريقه فائز)", () => {
    const state = mockState({
      bidderSeat: 0,
      hands: [[], [c("C", 2), c("C", 6), c("D", 7)], [], [], []],
      trump: "H",
      currentTrick: [
        play(0, c("H", 9)),
        play(2, c("H", 6)),
        play(3, c("H", 13)),
        play(4, c("H", 7)),
      ],
      currentSeat: 1,
    });
    // الفائز الحالي H-13 (seat 3) ليس الحاكم => من فريق البوت => أكلة مضمونة
    expect(chooseBotCardToPlay(state, 1).id).toBe("C-2");
  });

  it("لا ينزل 2 كلفس في أكلة غير مضمونة ويرمي ضعيفة", () => {
    const state = mockState({
      bidderSeat: 0,
      hands: [[], [c("C", 2), c("C", 6), c("D", 7)], [], [], []],
      trump: "H",
      currentTrick: [play(0, c("H", 14)), play(2, c("H", 9))],
      currentSeat: 1,
    });
    expect(chooseBotCardToPlay(state, 1).id).toBe("C-6");
  });

  it("لا يحرق 10 أو آكة في أكلة خاسرة غير مضمونة", () => {
    const state = mockState({
      bidderSeat: 0,
      hands: [[], [c("D", 10), c("S", 14), c("C", 6)], [], [], []],
      trump: "H",
      currentTrick: [play(0, c("H", 14)), play(2, c("H", 9))],
      currentSeat: 1,
    });
    expect(chooseBotCardToPlay(state, 1).id).toBe("C-6");
  });

  it("يرمي الصور قبل أوراق النقاط إذا اضطر", () => {
    const state = mockState({
      bidderSeat: 0,
      hands: [[], [c("D", 10), c("C", 13), c("C", 6)], [], [], []],
      trump: "H",
      currentTrick: [play(0, c("H", 14)), play(2, c("H", 9))],
      currentSeat: 1,
    });
    expect(chooseBotCardToPlay(state, 1).id).toBe("C-6");
  });

  it("يفوز بأعلى ورقة نقاط وهو آخر لاعب ويقدر يفوز", () => {
    const state = mockState({
      bidderSeat: 0,
      hands: [[], [c("C", 2), c("H", 9), c("H", 14)], [], [], []],
      trump: "H",
      currentTrick: [
        play(0, c("H", 10)),
        play(2, c("H", 7)),
        play(3, c("D", 6)),
        play(4, c("C", 8)),
      ],
      currentSeat: 1,
    });
    // يجب أن يتبع النوع H، ويفوز بـ H-14 (11 نقطة) لا H-9
    expect(chooseBotCardToPlay(state, 1).id).toBe("H-14");
  });

  it("لا يقود 2 كلفس قبل استنفاد الحكم ويقود الآكة", () => {
    const state = mockState({
      bidderSeat: 0,
      hands: [[], [c("C", 2), c("H", 14), c("S", 6)], [], [], []],
      currentSeat: 1,
    });
    expect(chooseBotCardToPlay(state, 1).id).toBe("H-14");
  });

  it("يقود 2 كلفس بعد استنفاد كل الحكم", () => {
    // 9 أوراق حكم (S) منزلة والتامة في يد البوت => القيادة بالأقوى مضمونة
    const played = [
      c("S", 14),
      c("S", 13),
      c("S", 12),
      c("S", 11),
      c("S", 10),
      c("S", 9),
      c("S", 8),
      c("S", 7),
      c("S", 6),
      c("S", 2),
    ].map((card, i) => play((i + 1) % 5, card));
    const state = mockState({
      bidderSeat: 0,
      trump: "S",
      hands: [[], [c("C", 2), c("H", 6)], [], [], []],
      trickHistory: [played],
      currentSeat: 1,
    });
    expect(chooseBotCardToPlay(state, 1).id).toBe("C-2");
  });
});
