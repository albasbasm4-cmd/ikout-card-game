/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { StrictMode } from "react";
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useGame } from "./useGame";
import { KoutGameEngine } from "../engine/KoutGameEngine";
import type { Card, GameState, PlayerSlot, Suit } from "../types/kout";
import type { ReportedCardType } from "../rules/cheat";

vi.mock("../ai/AIClient", () => ({
  getBotDecision: vi.fn(async () => ({ type: "BID", bid: 0, bestSuit: "S" })),
}));
vi.mock("../utils/audio", () => ({
  playCardSound: vi.fn(),
  playTrickWinSound: vi.fn(),
  playTrumpSound: vi.fn(),
  playWinSound: vi.fn(),
  playLoseSound: vi.fn(),
}));
vi.mock("../utils/persist", () => ({ saveGameState: vi.fn() }));
vi.mock("./useSettings", () => ({
  useHaptics: () => ({ trigger: vi.fn() }),
}));

/**
 * سباق البلاغ مع نافذة عرض الأكلة (1500ms):
 * البلاغ أثناء النافذة يجب أن يُكمل الأكلة المعلقة فوراً ثم يحكم،
 * وألا يستبدل المؤقت القديم حالة الحكم لاحقاً.
 */

const allHuman: PlayerSlot[] = [0, 1, 2, 3].map((seat) => ({
  seatIndex: seat,
  kind: "HUMAN_LOCAL" as const,
  name: `لاعب ${seat + 1}`,
  team: (seat % 2) as 0 | 1,
  connected: true,
}));

function buildMidTrickState(): { state: GameState; ledSuit: Suit } {
  const engine = new KoutGameEngine({ variant: "BO4", initialDealer: 0, seed: 1 });
  engine.startRound();
  engine.placeBid(1, 6);
  for (const s of [2, 3, 0]) engine.placeBid(s, 0);
  engine.declareTrump(1, "C");

  // الأكلة الحالية: 3 أوراق نزلت ويبقى المقعد 1 ليكملها
  const leadCard = engine.state.hands[2].find(
    (c) => c.suit !== "C" && c.joker === undefined,
  ) as Card;
  engine.playCard(2, leadCard);
  const ledSuit = leadCard.suit as Suit;

  const follow3 = engine.state.hands[3].find((c) => c.suit === ledSuit);
  engine.playCard(3, (follow3 ?? engine.state.hands[3][0]) as Card, { allowAnyCard: true });

  // المقعد 0 (فريق 0) يكسر التبعية وهو يحتفظ بورقة من نوع الأكلة — الغش المبحوث عنه
  const broke = engine.state.hands[0].find(
    (c) => c.joker === undefined && c.suit !== ledSuit && c.suit !== "C",
  ) as Card;
  if (!broke) throw new Error("seed 1 has no break card for seat 0");
  engine.playCard(0, broke, { allowAnyCard: true });

  return { state: engine.state, ledSuit };
}

describe("reportCheat during the trick pacing window", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("flushes the pending trick, then applies the verdict, and no stale timer overwrites it", () => {
    const { state } = buildMidTrickState();
    const { result } = renderHook(
      () => useGame({ initialState: state, variant: "BO4", targetScore: 51, players: allHuman }),
      { wrapper: ({ children }) => <StrictMode>{children}</StrictMode> },
    );

    expect(result.current.state.phase).toBe("PLAY");
    expect(result.current.state.currentTrick).toHaveLength(3);
    expect(result.current.state.currentSeat).toBe(1);

    // المقعد 1 يكمل الأكلة: تدخل نافذة العرض (1500ms)
    const completer = result.current.state.hands[1][0];
    act(() => {
      result.current.humanPlayCard(completer);
    });
    expect(result.current.displayedTrick).toHaveLength(4);

    const scoresBefore = [...result.current.state.scores] as [number, number];

    // البلاغ أثناء النافذة: يُكمل الأكلة فوراً ثم يُحكم
    let applied = false;
    act(() => {
      applied = result.current.reportCheat(0, "H");
    });
    expect(applied).toBe(true);

    const scoresAfterVerdict = [...result.current.state.scores] as [number, number];
    expect(scoresAfterVerdict).not.toEqual(scoresBefore);
    // حُسم البلاغ: نقاط مضاعفة (highBid 6 → 12) لفريق المُبلِّغ (المقعد 1، فريق 1)
    expect(scoresAfterVerdict[1] - scoresBefore[1]).toBe(12);
    expect(result.current.state.phase).toBe("ROUND_END");
    expect(result.current.cheatVerdict?.confirmed).toBe(true);

    // مرور الوقت لا يستبدل حكم البلاغ بحالة المحرك القديم
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.state.scores).toEqual(scoresAfterVerdict);
    expect(result.current.state.phase).toBe("ROUND_END");
  });

  it("rejects a report against a teammate without consuming the attempt", () => {
    const { state } = buildMidTrickState();
    const { result } = renderHook(
      () => useGame({ initialState: state, variant: "BO4", targetScore: 51, players: allHuman }),
      { wrapper: ({ children }) => <StrictMode>{children}</StrictMode> },
    );

    const completer = result.current.state.hands[1][0];
    act(() => {
      result.current.humanPlayCard(completer);
    });

    // المُبلِّغ هو المقعد النشط (1، فريق 1) — البلاغ عن المقعد 3 (فريق 1) مرفوض
    let applied = true;
    act(() => {
      applied = result.current.reportCheat(3, "H");
    });
    expect(applied).toBe(false);
    expect(result.current.cheatVerdict).toBeNull();

    // المحاولة لم تُستهلك: بلاغ صحيح بعدها على الفريق المقابل لا يزال مقبولاً
    const follow = result.current.state.hands[2].find((c) => c.joker === undefined) as Card;
    act(() => {
      result.current.reportCheat(0, follow.suit as Suit as ReportedCardType);
    });
    expect(result.current.cheatVerdict).not.toBeNull();
  });
});
