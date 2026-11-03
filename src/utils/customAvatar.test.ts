import { describe, it, expect, beforeEach } from "vitest";
import { applyVoiceAd, newCustomAvatar, saveCustomAvatar, listCustomAvatars, isSavedCustomAvatar } from "./customAvatar";

describe("custom characters", () => {
  beforeEach(() => localStorage.clear());
  it("5 voice ads upgrade a character from 5 to 10 voices", () => {
    let a = newCustomAvatar();
    for (let i = 0; i < 4; i++) a = applyVoiceAd(a);
    expect(a.maxClips).toBe(5);
    a = applyVoiceAd(a);
    expect(a.maxClips).toBe(10);
  });
  it("a second character is stored alongside the first", () => {
    saveCustomAvatar({ ...newCustomAvatar(), id: "a1", avatarImage: "x" });
    saveCustomAvatar({ ...newCustomAvatar(), id: "a2", avatarImage: "y" });
    expect(listCustomAvatars().map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(isSavedCustomAvatar("a2")).toBe(true);
  });
});
