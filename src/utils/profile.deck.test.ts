/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deckCardFace, loadProfile, saveProfile } from "./profile";

describe("deck card theme", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("maps ranks and suits to deck images", () => {
    expect(deckCardFace({ suit: "S", rank: 14 })).toBe("/assets/ikout/cards/deck/SA.webp");
    expect(deckCardFace({ suit: "H", rank: 10 })).toBe("/assets/ikout/cards/deck/H10.webp");
    expect(deckCardFace({ suit: "D", rank: 11 })).toBe("/assets/ikout/cards/deck/DJ.webp");
    expect(deckCardFace({ suit: "C", rank: 13 })).toBe("/assets/ikout/cards/deck/CK.webp");
    expect(deckCardFace({ joker: "RED" })).toBe("/assets/ikout/cards/deck/JR.webp");
    expect(deckCardFace({ joker: "BLACK" })).toBe("/assets/ikout/cards/deck/JB.webp");
    expect(deckCardFace({ suit: "X", rank: 5 })).toBeNull();
    expect(deckCardFace({})).toBeNull();
  });

  it("migrates the legacy authentic default to the deck theme", () => {
    localStorage.setItem(
      "ikout_profile_v1",
      JSON.stringify({ name: "أمير", characterId: "a2", table: "wood", cards: "authentic" }),
    );
    expect(loadProfile().cards).toBe("deck");
    expect(loadProfile().characterId).toBe("a2");
  });

  it("keeps a deliberately chosen theme stored in the new key", () => {
    saveProfile({ cards: "authentic" });
    expect(loadProfile().cards).toBe("authentic");
  });
});
