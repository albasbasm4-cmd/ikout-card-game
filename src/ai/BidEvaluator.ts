/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Card, Suit, Bid, Difficulty } from "../types/kout";

export const ALL_SUITS: Suit[] = ["S", "H", "D", "C"];

export interface BidEvaluation {
  bid: Bid;
  bestSuit: Suit;
  suit: Suit; // Alias for bestSuit
  score: number;
  expectedTricks: number;
}

export interface BidContext {
  scores?: [number, number];
  targetScore?: number;
  seat?: number;
  partnerSeat?: number;
  bidderSeat?: number | null;
  seed?: number;
}

/**
 * Evaluates the strength of a hand for a potential trump suit:
 * - Scores trump suit length
 * - Scores Jokers (Red Joker = +1.1 tricks, Black Joker = +0.95 tricks)
 * - Scores trump honors (Ace = +1.0, King = +0.8, Queen = +0.6)
 * - Scores side honors (side Aces = +0.8, side Kings = +0.4)
 * - Scores suit distribution (short suit ruffing potential)
 */
/**
 * Emulates the authentic Cardio.Kout.KoutBots.reduceAICallingPower logic:
 * Evaluates the risk of double penalty and reduces aggressive calling power when:
 * - Hand lacks top control (no Jokers and no Trump Ace/King)
 * - Trump suit length is fragile (< 4) without a Joker
 * - Opponent score is dangerously close to targetScore (within strike distance)
 */
export function reduceAICallingPower(
  hand: Card[],
  trumpCandidate: Suit,
  context: BidContext = {},
): number {
  let reduction = 0;
  const trumpCards = hand.filter((c) => c.suit === trumpCandidate);
  const trumpLength = trumpCards.length;
  const hasRedJoker = hand.some((c) => c.joker === "RED");
  const hasBlackJoker = hand.some((c) => c.joker === "BLACK");
  const hasTrumpAce = trumpCards.some((c) => c.rank === 14);
  const hasTrumpKing = trumpCards.some((c) => c.rank === 13);

  // 1. Lack of top trump stopper
  if (!hasRedJoker && !hasBlackJoker && !hasTrumpAce && !hasTrumpKing) {
    reduction += 0.35;
  }

  // 2. Fragile trump count without primary control
  if (trumpLength < 4 && !hasRedJoker && !hasTrumpAce) {
    reduction += 0.25;
  }

  // 3. Match vulnerability: severe penalty risk if opponents are near targetScore
  if (context.scores && context.targetScore && context.seat !== undefined) {
    const myTeam = context.seat % 2;
    const opponentTeam = 1 - myTeam;
    const oppScore = context.scores[opponentTeam];
    const dangerThreshold = context.targetScore - 12;
    if (oppScore >= dangerThreshold) {
      reduction += 0.35;
    }
  }

  return reduction;
}

export function scoreHandForSuit(hand: Card[], trumpCandidate: Suit): number {
  let score = 0;

  // 1. Jokers
  const hasRedJoker = hand.some((c) => c.joker === "RED");
  const hasBlackJoker = hand.some((c) => c.joker === "BLACK");
  if (hasRedJoker) score += 1.1;
  if (hasBlackJoker) score += 0.95;

  // 2. Trump length and trump honors
  const trumpCards = hand.filter((c) => c.suit === trumpCandidate);
  const trumpLength = trumpCards.length;

  // Trump length points
  if (trumpLength >= 6) score += 2.8;
  else if (trumpLength === 5) score += 2.0;
  else if (trumpLength === 4) score += 1.3;
  else if (trumpLength === 3) score += 0.7;
  else if (trumpLength === 2) score += 0.2;

  // Trump honors
  const hasTrumpAce = trumpCards.some((c) => c.rank === 14);
  const hasTrumpKing = trumpCards.some((c) => c.rank === 13);
  const hasTrumpQueen = trumpCards.some((c) => c.rank === 12);
  const hasTrumpJack = trumpCards.some((c) => c.rank === 11);

  if (hasTrumpAce) score += 1.0;
  if (hasTrumpKing) score += 0.8;
  if (hasTrumpQueen) score += 0.6;
  if (hasTrumpJack) score += 0.4;

  // Synergy bonus: holding Red Joker + Trump Ace/King gives supreme control
  if (hasRedJoker && (hasTrumpAce || hasTrumpKing)) {
    score += 0.5;
  }

  // 3. Side suit honors and distribution
  for (const suit of ALL_SUITS) {
    if (suit === trumpCandidate) continue;

    const sideCards = hand.filter((c) => c.suit === suit);
    const hasSideAce = sideCards.some((c) => c.rank === 14);
    const hasSideKing = sideCards.some((c) => c.rank === 13);

    if (hasSideAce) score += 0.8;
    if (hasSideKing && sideCards.length >= 2) score += 0.4;

    // Void or singleton in side suit provides ruffing power if player has trumps
    if (sideCards.length === 0 && trumpLength >= 3) {
      score += 0.6;
    } else if (sideCards.length === 1 && trumpLength >= 3) {
      score += 0.3;
    }
  }

  return score;
}

/**
 * Evaluates the best bid and trump suit for a player's hand:
 * - Scores each suit by trump length, jokers, Aces, and Kings
 * - Strict invariants:
 *     - Voluntary bids start at 6 (5 is only for forced dealer Malzom)
 *     - Bid 9 (Kout sweep) STRICTLY requires >= 5 trumps, Jokers, and high honors
 *     - Partner awareness: passes to support partner's contract unless holding a monster
 *     - Accurate risk-adjusted thresholds
 * - Returns Bid (0 for pass, 6..9, or 5 if Malzom) and bestSuit
 */
export function evaluateBid(
  hand: Card[],
  currentHighBid: Bid | null,
  isDealerForced: boolean,
  difficulty: Difficulty = "MEDIUM",
  context: BidContext = {},
): BidEvaluation {
  // Score every suit and pick the best one
  let bestSuit: Suit = "S";
  let bestScore = -1;

  for (const suit of ALL_SUITS) {
    const score = scoreHandForSuit(hand, suit);
    if (score > bestScore) {
      bestScore = score;
      bestSuit = suit;
    }
  }

  let expectedTricks = bestScore;

  // Difficulty adjustments
  if (difficulty === "EASY") {
    // Add small random noise bounded between -0.5 and +0.5
    const noise = (Math.random() - 0.5) * 1.0;
    expectedTricks += noise;
  } else if (difficulty === "EXPERT") {
    // Conservative safety margin: losing double points is severe penalty
    expectedTricks += 0.3;
  } else {
    // MEDIUM
    expectedTricks += 0.4;
  }

  // Apply authentic Cardio.Kout.KoutBots calling power reduction
  const callingPenalty = reduceAICallingPower(hand, bestSuit, context);
  expectedTricks = Math.max(0, expectedTricks - callingPenalty);

  const trumpCards = hand.filter((c) => c.suit === bestSuit);
  const trumpLength = trumpCards.length;
  const hasRedJoker = hand.some((c) => c.joker === "RED");
  const hasBlackJoker = hand.some((c) => c.joker === "BLACK");
  const hasAnyJoker = hasRedJoker || hasBlackJoker;
  const hasTrumpAce = trumpCards.some((c) => c.rank === 14);
  const hasTrumpKing = trumpCards.some((c) => c.rank === 13);

  // Check unguarded side suits
  let unguardedSideSuits = 0;
  for (const suit of ALL_SUITS) {
    if (suit === bestSuit) continue;
    const sideCards = hand.filter((c) => c.suit === suit);
    const hasSideAce = sideCards.some((c) => c.rank === 14);
    if (sideCards.length > 0 && !hasSideAce && sideCards.length <= 2) {
      unguardedSideSuits++;
    }
  }

  // Strict invariant for bidding 9 (Kout / باوان):
  // Must have: >= 5 trumps, at least one Joker, Trump Ace or King, expected tricks >= 8.6, and <= 1 unguarded side suit
  const canBid9 =
    trumpLength >= 5 &&
    hasAnyJoker &&
    (hasRedJoker || hasTrumpAce || hasTrumpKing) &&
    unguardedSideSuits <= 1 &&
    expectedTricks >= 8.6;

  // Invariant for bidding 8:
  const canBid8 =
    trumpLength >= 4 && (hasAnyJoker || hasTrumpAce || hasTrumpKing) && expectedTricks >= 7.6;

  // Invariant for bidding 7:
  const canBid7 = (trumpLength >= 4 || (trumpLength >= 3 && hasAnyJoker)) && expectedTricks >= 6.6;

  // Invariant for bidding 6 (minimum voluntary bid):
  const canBid6 =
    trumpLength >= 3 &&
    expectedTricks >= (difficulty === "EXPERT" ? 6.0 : difficulty === "EASY" ? 5.8 : 5.9);

  let rawBid: Bid = 0;
  if (canBid9) {
    rawBid = 9;
  } else if (canBid8) {
    rawBid = 8;
  } else if (canBid7) {
    rawBid = 7;
  } else if (canBid6) {
    rawBid = 6;
  } else {
    rawBid = 0;
  }

  // Partner coordination:
  // In Kout, if your partner already holds the high bid, pass to support them
  // unless your hand is so strong that you can safely take an 8 or 9.
  if (
    context.bidderSeat !== undefined &&
    context.bidderSeat !== null &&
    context.seat !== undefined &&
    context.bidderSeat % 2 === context.seat % 2
  ) {
    if (rawBid < 8 || rawBid <= (currentHighBid ?? 0)) {
      rawBid = 0; // Pass to support partner
    }
  }

  // Enforce auction rules:
  // Non-pass bid must be strictly higher than currentHighBid
  const high = currentHighBid ?? 0;
  let finalBid: Bid = rawBid;

  if (finalBid <= high) {
    finalBid = 0; // Pass if cannot outbid
  }

  // Forced bid (Malzom): If dealer is forced because all others passed, must bid 5
  if (isDealerForced && finalBid === 0) {
    finalBid = 5;
  }

  return {
    bid: finalBid,
    bestSuit,
    suit: bestSuit,
    score: bestScore,
    expectedTricks,
  };
}
