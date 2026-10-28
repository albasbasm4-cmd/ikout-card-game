/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { generateFallbackDecision } from './AIClient';
import { Card } from '../types/kout';
import type { GameState } from '../types/kout';

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    variant: 'BO6',
    hands: [[], [], [], [], [], []],
    dealer: 0,
    currentSeat: 0,
    bids: [],
    highBid: null,
    bidderSeat: null,
    trump: null,
    currentTrick: [],
    trickHistory: [],
    tricksWon: [0, 0],
    scores: [0, 0],
    phase: 'BID',
    roundNo: 1,
    targetScore: 51,
    version: 1,
    players: Array.from({ length: 6 }, (_, i) => ({
      seatIndex: i,
      kind: 'AI_BOT' as const,
      name: `Bot ${i}`,
      team: (i % 2) as 0 | 1,
      connected: true,
    })),
    ...overrides,
  };
}

describe('generateFallbackDecision (AI timeout safety net)', () => {
  it('keeps partner protection even when the worker fails', () => {
    const hand: Card[] = [{ id: 'JOKER-RED', joker: 'RED' }, { id: 'JOKER-BLACK', joker: 'BLACK' }, { id: 'H-14', suit: 'H', rank: 14 }, { id: 'H-7', suit: 'H', rank: 7 }];
    const state = baseState({ phase: 'PLAY', trump: 'H', hands: [hand, [], [], [], [], []], currentTrick: [{ seat: 4, card: { id: 'H-13', suit: 'H', rank: 13 } }] });
    const decision = generateFallbackDecision(state, 0);
    expect(decision.type).toBe('PLAY');
    if (decision.type === 'PLAY') expect(decision.card.id).toBe('H-7');
  });
  it('never bids above 6 on a weak hand when the worker times out', () => {
    // A hand with no aces, kings or jokers can never justify 8 or 9.
    const weakHand: Card[] = [
      { id: 'C-2', suit: 'C', rank: 2 }, { id: 'C-4', suit: 'C', rank: 4 },
      { id: 'C-5', suit: 'C', rank: 5 }, { id: 'H-3', suit: 'H', rank: 3 },
      { id: 'H-6', suit: 'H', rank: 6 }, { id: 'D-7', suit: 'D', rank: 7 },
      { id: 'S-8', suit: 'S', rank: 8 }, { id: 'S-9', suit: 'S', rank: 9 },
      { id: 'D-11', suit: 'D', rank: 11 }, { id: 'S-12', suit: 'S', rank: 12 },
      { id: 'D-2', suit: 'D', rank: 2 }, { id: 'H-5', suit: 'H', rank: 5 },
      { id: 'C-9', suit: 'C', rank: 9 }, { id: 'H-8', suit: 'H', rank: 8 },
      { id: 'S-4', suit: 'S', rank: 4 }, { id: 'D-9', suit: 'D', rank: 9 },
    ];
    for (let i = 0; i < 30; i++) {
      const decision = generateFallbackDecision(baseState({ hands: Array.from({ length: 6 }, () => weakHand) }), 0);
      if (decision.type === 'BID') {
        expect(decision.bid).toBeLessThanOrEqual(6);
      }
    }
  });

  it('bids high with a genuinely strong hand even on timeout', () => {
    const monsterHand: Card[] = [
      { id: 'JOKER-RED', joker: 'RED' as const }, { id: 'JOKER-BLACK', joker: 'BLACK' as const },
      { id: 'S-14', suit: 'S', rank: 14 }, { id: 'S-13', suit: 'S', rank: 13 },
      { id: 'S-12', suit: 'S', rank: 12 }, { id: 'S-10', suit: 'S', rank: 10 },
      { id: 'H-14', suit: 'H', rank: 14 }, { id: 'H-13', suit: 'H', rank: 13 },
      { id: 'D-14', suit: 'D', rank: 14 }, { id: 'D-13', suit: 'D', rank: 13 },
      { id: 'C-14', suit: 'C', rank: 14 }, { id: 'C-12', suit: 'C', rank: 12 },
      { id: 'H-11', suit: 'H', rank: 11 }, { id: 'D-11', suit: 'D', rank: 11 },
      { id: 'S-9', suit: 'S', rank: 9 }, { id: 'H-10', suit: 'H', rank: 10 },
    ];
    const decision = generateFallbackDecision(baseState({ hands: Array.from({ length: 6 }, () => monsterHand) }), 0);
    expect(decision.type).toBe('BID');
    if (decision.type === 'BID') expect(decision.bid).toBeGreaterThanOrEqual(8);
  });

  it('declares a forced dealer bid of 5 when every other seat passed', () => {
    const weakHand: Card[] = [
      { id: 'C-2', suit: 'C', rank: 2 }, { id: 'C-3', suit: 'C', rank: 3 },
      { id: 'C-4', suit: 'C', rank: 4 }, { id: 'H-5', suit: 'H', rank: 5 },
      { id: 'H-6', suit: 'H', rank: 6 }, { id: 'D-7', suit: 'D', rank: 7 },
      { id: 'S-8', suit: 'S', rank: 8 }, { id: 'S-9', suit: 'S', rank: 9 },
      { id: 'D-2', suit: 'D', rank: 2 }, { id: 'H-3', suit: 'H', rank: 3 },
      { id: 'D-5', suit: 'D', rank: 5 }, { id: 'S-6', suit: 'S', rank: 6 },
      { id: 'C-10', suit: 'C', rank: 10 }, { id: 'H-9', suit: 'H', rank: 9 },
      { id: 'D-8', suit: 'D', rank: 8 }, { id: 'S-11', suit: 'S', rank: 11 },
    ];
    const state = baseState({
      dealer: 3,
      bids: [{ seat: 0, bid: 0 }, { seat: 1, bid: 0 }, { seat: 2, bid: 0 }, { seat: 4, bid: 0 }, { seat: 5, bid: 0 }],
      currentSeat: 3,
      hands: Array.from({ length: 6 }, () => weakHand),
    });
    const decision = generateFallbackDecision(state, 3);
    expect(decision.type).toBe('BID');
    if (decision.type === 'BID') expect(decision.bid).toBe(5);
  });
});
