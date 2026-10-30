import { describe, it, expect } from "vitest";
import { GameEngine187 } from "../engine";
import { createDeck187, getCardPoints, TOTAL_GAME_POINTS } from "../rules";
import { chooseBotBid, chooseBotDiscards, chooseBotTrump, chooseBotCardToPlay } from "../ai";

describe("Game 187 Rules & Engine", () => {
  it("deck has exactly 40 cards and total points equal 187", () => {
    const deck = createDeck187();
    expect(deck.length).toBe(40);

    const totalPoints = deck.reduce((sum, c) => sum + getCardPoints(c), 0);
    expect(totalPoints).toBe(TOTAL_GAME_POINTS); // 187 points!

    // Verify 2♣ has 25 points
    const twoClubs = deck.find((c) => c.suit === "C" && c.rank === 2);
    expect(twoClubs).toBeDefined();
    expect(getCardPoints(twoClubs!)).toBe(25);

    // Verify other 2s have 10 points
    const twoSpades = deck.find((c) => c.suit === "S" && c.rank === 2);
    expect(getCardPoints(twoSpades!)).toBe(10);
  });

  it("deals 7 cards to each of the 5 players and 5 cards to table", () => {
    const engine = new GameEngine187({ seed: 1234 });
    engine.startRound();

    expect(engine.state.phase).toBe("BID");
    expect(engine.state.hands.length).toBe(5);
    for (let s = 0; s < 5; s++) {
      expect(engine.state.hands[s].length).toBe(7);
    }
    expect(engine.state.tableCards.length).toBe(5);
  });

  it("runs auction: allows raises and ends when 4 players pass", () => {
    const engine = new GameEngine187({ seed: 1234, initialDealer: 0 });
    engine.startRound();

    // Dealer is 0, first bidder is 1
    expect(engine.state.currentSeat).toBe(1);
    engine.placeBid(1, 80);
    expect(engine.state.highBid).toBe(80);
    expect(engine.state.currentSeat).toBe(2);

    engine.placeBid(2, 0); // Pass
    engine.placeBid(3, 0); // Pass
    engine.placeBid(4, 90); // Raise to 90
    expect(engine.state.highBid).toBe(90);

    engine.placeBid(0, 0); // Dealer passes
    engine.placeBid(1, 0); // Seat 1 passes

    // Now only Seat 4 remains active -> Seat 4 is Hakem with 90
    expect(engine.state.phase).toBe("DISCARD");
    expect(engine.state.bidderSeat).toBe(4);
    expect(engine.state.highBid).toBe(90);

    // Hakem received table cards: 7 + 5 = 12 cards
    expect(engine.state.hands[4].length).toBe(12);
  });

  it("forces last player at 75 if all players pass without bids", () => {
    const engine = new GameEngine187({ seed: 9999, initialDealer: 0 });
    engine.startRound();

    // Seats 1, 2, 3, 4 pass
    engine.placeBid(1, 0);
    engine.placeBid(2, 0);
    engine.placeBid(3, 0);
    engine.placeBid(4, 0);
    // Last remaining player (0) is forced at 75!
    expect(engine.state.phase).toBe("DISCARD");
    expect(engine.state.highBid).toBe(75);
    expect(engine.state.bidderSeat).toBe(0);
  });

  it("allows Hakem to give away 4 cards and declare trump, then all have 8 cards", () => {
    const engine = new GameEngine187({ seed: 42, initialDealer: 0 });
    engine.startRound();

    engine.placeBid(1, 75);
    engine.placeBid(2, 0);
    engine.placeBid(3, 0);
    engine.placeBid(4, 0);
    engine.placeBid(0, 0);

    expect(engine.state.bidderSeat).toBe(1);
    const hakemHand = engine.state.hands[1];
    expect(hakemHand.length).toBe(12);

    const cardsToGive = hakemHand.slice(0, 4).map((c) => c.id);
    engine.giveAwayCards(1, cardsToGive);

    expect(engine.state.phase).toBe("TRUMP");
    // All 5 players now have exactly 8 cards
    for (let s = 0; s < 5; s++) {
      expect(engine.state.hands[s].length).toBe(8);
    }

    engine.declareTrump(1, "H");
    expect(engine.state.phase).toBe("PLAY");
    expect(engine.state.trump).toBe("H");
    // Hakem starts trick 1
    expect(engine.state.currentSeat).toBe(1);
  });

  it("plays an entire round of 8 tricks and points sum to 187", () => {
    const engine = new GameEngine187({ seed: 777, initialDealer: 0 });
    engine.startRound();

    // Bidding
    engine.placeBid(1, 85);
    engine.placeBid(2, 0);
    engine.placeBid(3, 0);
    engine.placeBid(4, 0);
    engine.placeBid(0, 0);

    // Discard & Trump using AI helper
    const hakemSeat = engine.state.bidderSeat!;
    const trump = chooseBotTrump(engine.state.hands[hakemSeat]);
    const discards = chooseBotDiscards(engine.state.hands[hakemSeat], trump);
    engine.giveAwayCards(hakemSeat, discards);
    engine.declareTrump(hakemSeat, trump);

    // Play 8 tricks (40 card plays)
    for (let t = 0; t < 8; t++) {
      if (engine.state.phase === "EARLY_SETTLE") {
        engine.decideEarlyContinue(true);
      }
      if (engine.state.phase === "ROUND_END") break;

      for (let p = 0; p < 5; p++) {
        const seat = engine.state.currentSeat;
        const cardToPlay = chooseBotCardToPlay(engine.state, seat);
        engine.playCard(seat, cardToPlay);
      }
    }

    // Points sum must equal 187
    expect(engine.state.hakemPoints + engine.state.opponentsPoints).toBe(187);
    expect(engine.state.trickHistory.length).toBe(8);
  });
});
