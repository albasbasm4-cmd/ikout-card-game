import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "./useSettings";

describe("independent card placement sound", () => {
  beforeEach(() => localStorage.clear());
  it("disables placement sounds while keeping other sound enabled", () => {
    saveSettings({ ...DEFAULT_SETTINGS, soundEnabled: true, cardPlacementSoundEnabled: false });
    expect(loadSettings().cardPlacementSoundEnabled).toBe(false);
    expect(loadSettings().soundEnabled).toBe(true);
  });
  it("keeps placement sounds enabled for existing saved settings", () => {
    localStorage.setItem("ikout_settings_v1", JSON.stringify({ soundEnabled: true }));
    expect(loadSettings().cardPlacementSoundEnabled).toBe(true);
  });
});
