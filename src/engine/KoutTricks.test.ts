/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { KoutGameEngine } from './KoutGameEngine';
import { getLegalCards } from '../rules/cards';
import { getPlayedCards } from './KoutTricks';
import { Card } from '../types/kout';

describe('KoutTricks & Trick Playing Engine', () => {
  describe('Trump Declaration', () => {
    it('allows only the winning bidder to declare trump and player to right leads first trick', () => {
      const engine = new KoutGameEngine({ variant: 'BO6', initialDealer: 0, seed: 1234 });
      engine.startRound();

      // Bidding: Seat 1 bids 6, all others pass
      engine.placeBid(1, 6);
      for (let s = 2; s <= 5; s++) engine.placeBid(s, 0);
      engine.placeBid(0, 0);

      expect(engine.state.phase).toBe('TRUMP');
      expect(engine.state.bidderSeat).toBe(1);

      // Other player tries to declare trump -> throws
      expect(() => engine.declareTrump(2, 'H')).toThrowError(/Only the winning bidder/);

      // Winning bidder declares trump
      const playState = engine.declareTrump(1, 'H');
      expect(playState.phase).toBe('PLAY');
      expect(playState.trump).toBe('H');
      // الحاكم ينزل آخر واحد في أول أكلة، والذي على يمينه (مقعد 2) يبدأ اللعب
      expect(playState.currentSeat).toBe(2);
    });
  });

  describe('playCard Validation', () => {
    it('validates turn and throws if out-of-turn seat plays', () => {
      const engine = new KoutGameEngine({ variant: 'BO6', initialDealer: 0, seed: 5678 });
      engine.startRound();
      engine.placeBid(1, 6);
      for (let s = 2; s <= 5; s++) engine.placeBid(s, 0);
      engine.placeBid(0, 0);
      engine.declareTrump(1, 'S');

      // Current seat is 2 (right of bidder 1), seat 3 tries to play
      const cardSeat3 = engine.state.hands[3][0];
      expect(() => engine.playCard(3, cardSeat3)).toThrowError(/Not seat 3's turn/);
    });

    it('rejects illegal card plays when player fails to follow led suit', () => {
      const engine = new KoutGameEngine({ variant: 'BO6', initialDealer: 0, seed: 9999 });
      engine.startRound();
      engine.placeBid(1, 6);
      for (let s = 2; s <= 5; s++) engine.placeBid(s, 0);
      engine.placeBid(0, 0);
      engine.declareTrump(1, 'C');

      // Seat 2 leads a non-trump card
      const hand2 = engine.state.hands[2];
      const leadCard = hand2.find((c) => c.suit !== 'C' && c.joker === undefined) || hand2[0];
      engine.playCard(2, leadCard);

      // Now seat 3 must play
      const hand3 = engine.state.hands[3];
      const ledSuit = leadCard.joker !== undefined ? 'C' : leadCard.suit;

      const hasSuit = hand3.some((c) => c.suit === ledSuit);
      const offSuit = hand3.find(
        (c) => c.suit !== ledSuit && c.suit !== 'C' && c.joker === undefined
      );

      if (hasSuit && offSuit) {
        expect(() => engine.playCard(3, offSuit)).toThrowError(
          /Illegal card play/
        );
      }
    });
  });

  describe('Full Round Simulation with Fixed Seed', () => {
    it('plays an entire 9-trick round to completion deterministically', () => {
      const engine = new KoutGameEngine({ variant: 'BO6', initialDealer: 0, seed: 42 });

      // 1. Deal cards
      engine.startRound(42);
      expect(engine.state.phase).toBe('BID');
      expect(engine.state.roundNo).toBe(1);
      expect(engine.state.dealer).toBe(0);
      expect(engine.state.currentSeat).toBe(1);

      // 2. Run auction: Seat 1 bids 6, others pass
      engine.placeBid(1, 6);
      engine.placeBid(2, 0);
      engine.placeBid(3, 0);
      engine.placeBid(4, 0);
      engine.placeBid(5, 0);
      engine.placeBid(0, 0);

      expect(engine.state.phase).toBe('TRUMP');
      expect(engine.state.highBid).toBe(6);
      expect(engine.state.bidderSeat).toBe(1);

      // 3. Declare trump
      engine.declareTrump(1, 'D');
      expect(engine.state.phase).toBe('PLAY');
      expect(engine.state.trump).toBe('D');
      // المقعد على يمين الحاكم (مقعد 2) يبدأ الأكلة الأولى
      expect(engine.state.currentSeat).toBe(2);

      // 4. Play all 9 tricks (54 total card plays)
      const TOTAL_TRICKS = 9;
      const PLAYERS_COUNT = 6;

      for (let trickIdx = 0; trickIdx < TOTAL_TRICKS; trickIdx++) {
        const trickLeader = engine.state.currentSeat;

        for (let playIdx = 0; playIdx < PLAYERS_COUNT; playIdx++) {
          const seat = engine.state.currentSeat;
          const hand = engine.state.hands[seat];
          expect(hand.length).toBe(TOTAL_TRICKS - trickIdx);

          const playedCards = getPlayedCards(
            engine.state.trickHistory,
            engine.state.currentTrick
          );
          const legalCards = getLegalCards(
            hand,
            engine.state.currentTrick,
            engine.state.trump,
            { playedCards, highBid: engine.state.highBid }
          );

          expect(legalCards.length).toBeGreaterThan(0);

          // Play the first legal card
          const chosenCard = legalCards[0];
          engine.playCard(seat, chosenCard);
        }

        // Trick completed
        expect(engine.state.currentTrick.length).toBe(0);
        expect(engine.state.trickHistory.length).toBe(trickIdx + 1);
      }

      // 5. Round is over
      expect(engine.state.phase).toBe('ROUND_END');
      const totalTricksWon =
        engine.state.tricksWon[0] + engine.state.tricksWon[1];
      expect(totalTricksWon).toBe(TOTAL_TRICKS);

      // All hands empty
      for (let s = 0; s < PLAYERS_COUNT; s++) {
        expect(engine.state.hands[s].length).toBe(0);
      }
    });
  });
});
