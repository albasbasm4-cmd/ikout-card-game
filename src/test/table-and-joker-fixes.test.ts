import { describe, it, expect } from "vitest";
import { TRICK_SLOTS, trickSlotFor } from "../components/Table";
import { readFileSync } from "fs";
import { join } from "path";

describe("Table cards spacing (6 players)", () => {
  it("has vertical separation between top and bottom cards in columns 1, 2, and 3", () => {
    // Column 1: slots 1 (top) and 4 (bottom)
    // Column 2: slots 2 (top) and 5 (bottom)
    // Column 3: slots 3 (top) and 6 (bottom)

    // Top cards should be around ~14% - 15%
    expect(TRICK_SLOTS[1].top).toBeLessThanOrEqual(15);
    expect(TRICK_SLOTS[2].top).toBeLessThanOrEqual(15);
    expect(TRICK_SLOTS[3].top).toBeLessThanOrEqual(15);

    // Bottom cards should be around ~55% - 56%
    expect(TRICK_SLOTS[4].top).toBeGreaterThanOrEqual(55);
    expect(TRICK_SLOTS[5].top).toBeGreaterThanOrEqual(55);
    expect(TRICK_SLOTS[6].top).toBeGreaterThanOrEqual(55);

    // Vertical gap in each column should be at least 40% (card height is ~35.8%, so gap is positive)
    expect(TRICK_SLOTS[4].top - TRICK_SLOTS[1].top).toBeGreaterThan(40);
    expect(TRICK_SLOTS[5].top - TRICK_SLOTS[2].top).toBeGreaterThan(40);
    expect(TRICK_SLOTS[6].top - TRICK_SLOTS[3].top).toBeGreaterThan(40);
  });
});

describe("Joker bot cards protection", () => {
  it("ensures JokerApp only allows the local human player to reveal their own card", () => {
    const jokerPath = join(process.cwd(), "src/joker/JokerApp.tsx");
    const code = readFileSync(jokerPath, "utf8");

    // Must check isHuman
    expect(code).toContain("const isHuman = p.id === human;");
    expect(code).toContain("const isHolding = isHuman && holdingId === p.id;");
    expect(code).toContain("if (!isHuman) return;");
    expect(code).toContain('{isHolding && isHuman ? (isJk ? "🃏" : playerCard) : ""}');
  });
});
