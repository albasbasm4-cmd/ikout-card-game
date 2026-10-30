/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Table187 } from "../components/Table187";
import { GameEngine187 } from "../engine";
import type { GameState187 } from "../types";

function playingState(): GameState187 {
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

const noop = () => undefined;

function renderTable(overrides: Partial<Parameters<typeof Table187>[0]> = {}) {
  const base = {
    state: playingState(),
    onPlayCard: noop,
    onBid: noop,
    onGiveAwayCards: noop,
    onDeclareTrump: noop,
    onEarlySettleChoice: noop,
    onNextRound: noop,
    onExit: noop,
  };
  return render(<Table187 {...base} {...overrides} />);
}

function openSettings() {
  const btn = screen.getByLabelText("الإعدادات", { exact: false });
  fireEvent.click(btn);
}

describe("187 cheat modal targets", () => {
  it("as hakem: lists all four opponents", () => {
    renderTable({ mySeat: 0, onReportCheat: noop });
    fireEvent.click(screen.getByLabelText("البلاغ عن غش"));
    expect(
      screen.getByText("حدد اللاعب المتهم ونوع الورقة التي رمى بها خلافاً لنوع بداية الأكلة:"),
    ).toBeTruthy();
    for (const name of ["سالم", "فهد", "مبارك", "طلال"]) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
  });

  it("as an opponent: lists only the hakem, never a teammate (no friendly fire)", () => {
    renderTable({ mySeat: 1, onReportCheat: noop });
    fireEvent.click(screen.getByLabelText("البلاغ عن غش"));
    // لا يوجد زر بلاغ لأي زميل في الفريق
    for (const name of ["سالم", "فهد", "مبارك", "طلال"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    // الحاكم وحده متاحاً للبلاغ
    expect(screen.getAllByRole("button", { name: "أنت" }).length).toBeGreaterThan(0);
  });
});

describe("187 settings: card placement sound", () => {
  it("shows the card placement sound toggle even when onRestart is not provided (multiplayer room)", () => {
    renderTable({ onRestart: undefined, onReportCheat: noop });
    openSettings();
    expect(screen.getByLabelText("تفعيل/كتم صوت إنزال البطاقات")).toBeTruthy();
  });

  it("toggling flips the stored setting", () => {
    renderTable({ onRestart: undefined });
    openSettings();
    const toggle = screen.getByLabelText("تفعيل/كتم صوت إنزال البطاقات");
    fireEvent.click(toggle);
    const saved = JSON.parse(localStorage.getItem("ikout_settings_v1") ?? "{}");
    expect(saved.cardPlacementSoundEnabled).toBe(false);
  });
});
