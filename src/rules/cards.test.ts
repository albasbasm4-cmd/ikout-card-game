/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import { cardStrength, trickWinner, getLegalCards, sortHandCards } from "./cards";
import { Card, Suit, TrickPlay } from "../types/kout";

describe("Card Strength and Trick Winner Rules", () => {
  const trump: Suit = "H";
  const ledSuit: Suit = "S";

  it("strictly satisfies: Red Joker > Trump Ace > Black Joker > trump K..2 > led suit A..2 > others 0", () => {
    const redJoker: Card = { id: "JOKER-RED", joker: "RED" };
    const trumpAce: Card = { id: "H-14", suit: "H", rank: 14 };
    const blackJoker: Card = { id: "JOKER-BLACK", joker: "BLACK" };
    const trumpKing: Card = { id: "H-13", suit: "H", rank: 13 };
    const trump2: Card = { id: "H-2", suit: "H", rank: 2 };
    const ledAce: Card = { id: "S-14", suit: "S", rank: 14 };
    const led2: Card = { id: "S-2", suit: "S", rank: 2 };
    const offSuitCard: Card = { id: "D-14", suit: "D", rank: 14 };

    const redJokerScore = cardStrength(redJoker, trump, ledSuit);
    const trumpAceScore = cardStrength(trumpAce, trump, ledSuit);
    const blackJokerScore = cardStrength(blackJoker, trump, ledSuit);
    const trumpKingScore = cardStrength(trumpKing, trump, ledSuit);
    const trump2Score = cardStrength(trump2, trump, ledSuit);
    const ledAceScore = cardStrength(ledAce, trump, ledSuit);
    const led2Score = cardStrength(led2, trump, ledSuit);
    const offSuitScore = cardStrength(offSuitCard, trump, ledSuit);

    expect(redJokerScore).toBeGreaterThan(trumpAceScore);
    expect(trumpAceScore).toBeGreaterThan(blackJokerScore);
    expect(blackJokerScore).toBeGreaterThan(trumpKingScore);
    expect(trumpKingScore).toBeGreaterThan(trump2Score);
    expect(trump2Score).toBeGreaterThan(ledAceScore);
    expect(ledAceScore).toBeGreaterThan(led2Score);
    expect(led2Score).toBeGreaterThan(offSuitScore);
    expect(offSuitScore).toBe(0);
  });

  it("Red Joker led as first card converts to 6 of Spades", () => {
    const redJoker: Card = { id: "JOKER-RED", joker: "RED" };
    // Red Joker led when trump is H -> converts to 6 of Spades (strength 106)
    const ledStrength = cardStrength(redJoker, "H", "S", true);
    expect(ledStrength).toBe(106);

    // Higher Spade beats it
    const spade7: Card = { id: "S-7", suit: "S", rank: 7 };
    const spade7Strength = cardStrength(spade7, "H", "S", false);
    expect(spade7Strength).toBeGreaterThan(ledStrength);

    // Trump card beats it
    const trump2: Card = { id: "H-2", suit: "H", rank: 2 };
    const trump2Strength = cardStrength(trump2, "H", "S", false);
    expect(trump2Strength).toBeGreaterThan(ledStrength);

    // If trump is S, Red Joker led becomes 6 of trumps (706)
    const ledTrumpSpade = cardStrength(redJoker, "S", "S", true);
    expect(ledTrumpSpade).toBe(706);
  });

  it("Black Joker (Maker) led as first card converts to Trump suit", () => {
    const blackJoker: Card = { id: "JOKER-BLACK", joker: "BLACK" };
    const plays: TrickPlay[] = [
      { seat: 0, card: blackJoker },
      { seat: 1, card: { id: "H-13", suit: "H", rank: 13 } }, // King of trump
    ];
    // Maker is 800, King is 713 -> Maker wins
    const winner = trickWinner(plays, "H");
    expect(winner.seat).toBe(0);

    // Trump Ace (900) beats Maker (800)
    const playsWithAce: TrickPlay[] = [
      { seat: 0, card: blackJoker },
      { seat: 1, card: { id: "H-14", suit: "H", rank: 14 } },
    ];
    const winnerWithAce = trickWinner(playsWithAce, "H");
    expect(winnerWithAce.seat).toBe(1);
  });

  it("awards trick to Red Joker when played during trick", () => {
    const plays: TrickPlay[] = [
      { seat: 0, card: { id: "H-14", suit: "H", rank: 14 } }, // Trump Ace
      { seat: 1, card: { id: "JOKER-RED", joker: "RED" } }, // Red Joker played
    ];
    const winner = trickWinner(plays, "H");
    expect(winner.seat).toBe(1);
  });
});

describe("getLegalCards & Joker Rules", () => {
  const trump: Suit = "H";
  const spadeCard: Card = { id: "S-9", suit: "S", rank: 9 };
  const redJoker: Card = { id: "JOKER-RED", joker: "RED" };
  const blackJoker: Card = { id: "JOKER-BLACK", joker: "BLACK" };
  const diamondCard: Card = { id: "D-10", suit: "D", rank: 10 };

  it("allows playing Jokers at any time with no restrictions against bots", () => {
    const hand: Card[] = [spadeCard, redJoker, blackJoker, diamondCard];
    const trick: TrickPlay[] = [{ seat: 0, card: { id: "S-14", suit: "S", rank: 14 } }];

    // Player holds matching spade, but jokers are always allowed
    const legal = getLegalCards(hand, trick, trump, {});
    const legalIds = legal.map((c) => c.id);
    expect(legalIds).toContain("S-9");
    expect(legalIds).toContain("JOKER-RED");
    expect(legalIds).toContain("JOKER-BLACK");
    // Diamond is not legal because player holds S-9
    expect(legalIds).not.toContain("D-10");
  });

  it("restricts leading trump suit on first trick only", () => {
    const hand: Card[] = [
      { id: "H-10", suit: "H", rank: 10 },
      { id: "D-10", suit: "D", rank: 10 },
      blackJoker, // Maker converts to trump, so also restricted on trick 1
    ];
    const ctx = { playedCards: [] }; // first trick
    const legal = getLegalCards(hand, [], trump, ctx);
    const legalIds = legal.map((c) => c.id);

    // Only non-trump D-10 can lead trick 1
    expect(legalIds).toEqual(["D-10"]);
  });

  it("allows leading any card on subsequent tricks (trick 2 and later)", () => {
    const hand: Card[] = [
      { id: "H-10", suit: "H", rank: 10 },
      { id: "D-10", suit: "D", rank: 10 },
      blackJoker,
      redJoker,
    ];
    const ctx: { playedCards: Card[] } = {
      playedCards: [{ id: "C-7", suit: "C", rank: 7 }], // trick 1 was played
    };
    const legal = getLegalCards(hand, [], trump, ctx);
    expect(legal.length).toBe(4);
  });
});

describe("sortHandCards", () => {
  it("places Red Joker then Black Joker first, then groups by suit and rank descending", () => {
    const hand: Card[] = [
      { id: "D-10", suit: "D", rank: 10 },
      { id: "JOKER-BLACK", joker: "BLACK" },
      { id: "H-14", suit: "H", rank: 14 },
      { id: "JOKER-RED", joker: "RED" },
      { id: "H-9", suit: "H", rank: 9 },
    ];
    const sorted = sortHandCards(hand, "H");
    expect(sorted[0].id).toBe("JOKER-RED");
    expect(sorted[1].id).toBe("JOKER-BLACK");
    expect(sorted[2].id).toBe("H-14");
    expect(sorted[3].id).toBe("H-9");
    expect(sorted[4].id).toBe("D-10");
  });
});
