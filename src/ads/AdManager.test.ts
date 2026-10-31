import { describe, it, expect, beforeEach } from "vitest";
import { adManager } from "./AdManager";

describe("AdManager", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("initializes character ad progress correctly", () => {
    const progress = adManager.getCharacterAdProgress("char-1");
    expect(progress.watchedCount).toBe(0);
    expect(progress.requiredCount).toBe(5);
    expect(progress.unlocked).toBe(false);
  });
});
