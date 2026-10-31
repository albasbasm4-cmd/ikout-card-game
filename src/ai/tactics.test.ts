/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import { GameState, Card, Difficulty } from "../types/kout";
import { chooseCard } from "./ISMCTS";
import {
  koutTacticDecision,
  hakamIsOpponent,
  hakamIsTeammate,
  opponentsTrumpsExhausted,
  hakamRevealedSuits,
} from "./tactics";

function mockState(overrides: Partial<GameState> = {}): GameState {
  return {
    variant: "BO4",
    hands: [[], [], [], []],
    dealer: 0,
    currentSeat: 0,
    bids: [{ seat: 1, bid: 6 }],
    highBid: 6,
    bidderSeat: 1,
    trump: "S",
    currentTrick: [],
    trickHistory: [],
    tricksWon: [0, 0],
    scores: [0, 0],
    phase: "PLAY",
    roundNo: 1,
    targetScore: 51,
    version: 1,
    ...overrides,
  };
}

const S = (rank: number): Card => ({ id: `S-${rank}`, suit: "S", rank });
const D = (rank: number): Card => ({ id: `D-${rank}`, suit: "D", rank });
const H = (rank: number): Card => ({ id: `H-${rank}`, suit: "H", rank });
const C = (rank: number): Card => ({ id: `C-${rank}`, suit: "C", rank });

describe("كوت: حفظ الحكم من الحاكم الخصم", () => {
  it("لا ينزل البوت حكماً والحاكم خصمه وما عنده غيره", () => {
    const state = mockState({
      hands: [[S(5), D(8), C(9)], [], [], []],
      currentTrick: [{ seat: 1, card: H(3) }],
      currentSeat: 0,
    });
    const card = chooseCard(state, 0, { difficulty: "MEDIUM" });
    expect(card.suit).not.toBe("S");
  });

  it("ينزل الحكم إذا لم يتبق في يده إلا حكم", () => {
    const state = mockState({
      hands: [[S(5), S(6)], [], [], []],
      currentTrick: [{ seat: 1, card: H(3) }],
      currentSeat: 0,
    });
    const card = chooseCard(state, 0, { difficulty: "MEDIUM" });
    expect(card.suit).toBe("S");
  });

  it("يعيد استخدام الحكم بعد استنفاد حكم الخصوم", () => {
    // سبعة من أوراق الحكم منزلة (الحاكم نزلها كلها) والتامنة في يد البوت
    const playedSpades = [S(14), S(13), S(12), S(11), S(10), S(8), S(7)];
    const history: GameState["trickHistory"] = [
      playedSpades.slice(0, 4).map((card, i) => ({ seat: i, card })),
      [...playedSpades.slice(4).map((card, i) => ({ seat: i, card })), { seat: 3, card: H(3) }],
    ];
    const state = mockState({
      hands: [[S(9), D(5)], [], [], []],
      trickHistory: history,
      currentSeat: 0,
    });
    expect(opponentsTrumpsExhausted(state, 0)).toBe(true);
    const result = koutTacticDecision(state, 0, [S(9), D(5)], "MEDIUM");
    expect(result.candidates.map((c) => c.id)).toContain("S-9");
  });

  it("يمنع الحكم قبل استنفاد حكم الخصوم", () => {
    const state = mockState({
      hands: [[S(9), D(5)], [], [], []],
      currentSeat: 0,
    });
    expect(opponentsTrumpsExhausted(state, 0)).toBe(false);
    const result = koutTacticDecision(state, 0, [S(9), D(5)], "MEDIUM");
    expect(result.candidates.map((c) => c.id)).toEqual(["D-5"]);
  });
});

describe("كوت: الجوكر يخطف أكلة الحاكم الخصم", () => {
  it("ينزل الجوكر الأحمر إذا بدأ الحاكم الخصم الأكلة بحكم", () => {
    const state = mockState({
      variant: "BO6",
      trump: "H",
      bidderSeat: 1,
      hands: [[{ id: "JOKER-RED", joker: "RED" } as Card, D(5), C(6)], [], [], [], [], []],
      currentTrick: [{ seat: 1, card: H(2) }],
      currentSeat: 0,
    });
    const card = chooseCard(state, 0, { difficulty: "MEDIUM" });
    expect(card.joker).toBe("RED");
  });
});

describe("كوت: مشاركة القيادة مع الحاكم صاحبه", () => {
  it("يقود بأعلى ورقة حكم وهو مالك اللعبة والحاكم صاحبه", () => {
    const state = mockState({
      bidderSeat: 2,
      hands: [[S(4), S(9), H(13), D(7)], [], [], []],
      trickHistory: [
        [
          { seat: 0, card: D(3) },
          { seat: 1, card: D(6) },
          { seat: 2, card: D(8) },
          { seat: 3, card: C(3) },
        ],
      ],
      currentSeat: 0,
    });
    expect(hakamIsTeammate(state, 0)).toBe(true);
    const card = chooseCard(state, 0, { difficulty: "MEDIUM" });
    expect(card.id).toBe("S-9");
  });

  it("يقود بأقوى ورقة عادية بعد نفاد حكمه ليتقاسموا اللعب", () => {
    const state = mockState({
      bidderSeat: 2,
      hands: [[H(13), D(7), C(6)], [], [], []],
      currentSeat: 0,
    });
    const card = chooseCard(state, 0, { difficulty: "MEDIUM" });
    expect(card.id).toBe("H-13");
  });
});

describe("كوت: تثبيت أكلة الصاحب", () => {
  it("يثبت أكلة صاحبه الهشة بورقة حكم", () => {
    const state = mockState({
      bidderSeat: 2, // الحاكم صاحبه فلا ينطبق حفظ الحكم
      hands: [[S(3), D(5), C(6)], [], [], []],
      currentTrick: [{ seat: 2, card: H(10) }],
      currentSeat: 0,
    });
    const card = chooseCard(state, 0, { difficulty: "MEDIUM" });
    expect(card.id).toBe("S-3");
  });
});

describe("كوت: ملاحقة أنواع الحاكم", () => {
  it("يقود بأعلى ورقة من نوع انكشف عند الحاكم الخصم", () => {
    const state = mockState({
      bidderSeat: 1,
      hands: [[D(4), D(12), H(13), C(7)], [], [], []],
      trickHistory: [
        [
          { seat: 0, card: D(3) },
          { seat: 1, card: D(9) }, // الحاكم تبع الديمني => عنده ديمني
          { seat: 2, card: D(6) },
          { seat: 3, card: D(8) },
        ],
      ],
      currentSeat: 0,
    });
    expect(hakamRevealedSuits(state).has("D")).toBe(true);
    const card = chooseCard(state, 0, { difficulty: "MEDIUM" });
    expect(card.id).toBe("D-12");
  });

  it("لا يطبق الملاحقة على المستوى السهل", () => {
    const state = mockState({
      bidderSeat: 1,
      hands: [[D(4), D(12), H(13), C(7)], [], [], []],
      trickHistory: [
        [
          { seat: 0, card: D(3) },
          { seat: 1, card: D(9) },
          { seat: 2, card: D(6) },
          { seat: 3, card: D(8) },
        ],
      ],
      currentSeat: 0,
    });
    const result = koutTacticDecision(state, 0, state.hands[0], "EASY");
    expect(result.forced).toBeUndefined();
  });
});
