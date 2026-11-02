import { describe, expect, it } from "vitest";
import type { Card } from "../types/kout";
import { sortTrumpLeft } from "./sortTrumpLeft";

const cards = [
  { id: "s", suit: "S", rank: 14 },
  { id: "h1", suit: "H", rank: 13 },
  { id: "d", suit: "D", rank: 12 },
  { id: "h2", suit: "H", rank: 10 },
] as unknown as Card[];

describe("sortTrumpLeft", () => {
  it("puts trump cards leftmost keeping order", () => {
    expect(sortTrumpLeft(cards, "H" as never).map((c) => (c as { id: string }).id)).toEqual(["h1", "h2", "s", "d"]);
  });
  it("keeps order before trump is chosen", () => {
    expect(sortTrumpLeft(cards, null)).toEqual(cards);
  });
});
