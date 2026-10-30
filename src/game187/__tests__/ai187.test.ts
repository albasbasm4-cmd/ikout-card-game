import { describe, it, expect } from "vitest";
import { bidFromPointCapacity187, evaluateBotBid } from "../ai";
import { isMessage187 } from "../messages";

describe("187 bot contracts", () => {
  it("capacity 100 bids 90", () => expect(bidFromPointCapacity187(100, null)).toBe(90));
  it("capacity 120 bids 110", () => expect(bidFromPointCapacity187(120, null)).toBe(110));
  it("capacity 140 bids 130", () => expect(bidFromPointCapacity187(140, null)).toBe(130));
  it("capacity 150 bids 140", () => expect(bidFromPointCapacity187(150, 135)).toBe(140));
  it("never exceeds 140", () => expect(bidFromPointCapacity187(180, 135)).toBe(140));
  it("exits at current 140", () => expect(bidFromPointCapacity187(180, 140)).toBe(0));
  it("exits above 140", () => expect(bidFromPointCapacity187(180, 145)).toBe(0));
  it("passes rather than exceeding its safe contract", () =>
    expect(bidFromPointCapacity187(100, 90)).toBe(0));
  it("passes if reserve leaves less than minimum 75", () =>
    expect(bidFromPointCapacity187(80, null)).toBe(0));
  it("hand evaluation applies the reserve, not a minimum opening", () => {
    expect(
      evaluateBotBid(
        [
          { id: "S-2", suit: "S", rank: 2 },
          { id: "S-14", suit: "S", rank: 14 },
          { id: "S-13", suit: "S", rank: 13 },
        ],
        null,
      ),
    ).toBe(100);
  });
  it("187 messages reject Kout voice codes and calls", () => {
    expect(isMessage187("بالتوفيق")).toBe(true);
    expect(isMessage187("clip:bid6.mp3")).toBe(false);
    expect(isMessage187("جيكر")).toBe(false);
    expect(isMessage187("bid:9")).toBe(false);
  });
});
import { CHARACTER_VOICES } from "../../data/characterVoiceManifest";
import { chatCode187, clip187, chatClips187, isSafe187 } from "../messages";

describe("187 character voices", () => {
  it("drops Kout-only vocabulary and 5-9 digits", () => {
    expect(isSafe187({ file: "x.mp3", text: "بالتوفيق يا شباب" })).toBe(true);
    expect(isSafe187({ file: "x.mp3", text: "الجوكر عندي" })).toBe(false);
    expect(isSafe187({ file: "x.mp3", text: "بالستة" })).toBe(false);
    expect(isSafe187({ file: "x.mp3", text: "ماكر" })).toBe(false);
    expect(isSafe187({ file: "x.mp3", text: "عندي 7" })).toBe(false);
  });
  it("only accepts chat voice lines that are safe clips", () => {
    for (const [id, voices] of Object.entries(CHARACTER_VOICES)) {
      for (const clip of voices.chat) {
        expect(isMessage187(chatCode187(clip), id)).toBe(isSafe187(clip));
        if (!isSafe187(clip)) expect(chatClips187(id)).not.toContainEqual(clip);
      }
    }
    expect(isMessage187("voice187:does-not-exist.mp3")).toBe(false);
  });
  it("situation clips are always safe", () => {
    for (const id of Object.keys(CHARACTER_VOICES)) {
      for (const key of ["welcome", "pass", "win", "lose"] as const) {
        const clip = clip187(id, key);
        if (clip) expect(isSafe187(clip)).toBe(true);
      }
    }
  });
});
