/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Suit187 = "S" | "H" | "D" | "C";
export type Rank187 = 2 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card187 {
  id: string;
  suit: Suit187;
  rank: Rank187;
}

export type Phase187 =
  "DEAL" | "BID" | "DISCARD" | "TRUMP" | "PLAY" | "EARLY_SETTLE" | "ROUND_END" | "GAME_END";

export interface TrickPlay187 {
  seat: number;
  card: Card187;
}

export interface Player187 {
  seatIndex: number;
  kind: "HUMAN_LOCAL" | "AI_BOT" | "REMOTE";
  name: string;
  characterId?: string;
  isHost?: boolean;
}

export interface GameState187 {
  roundNo: number;
  dealer: number;
  currentSeat: number;
  hands: Card187[][];
  tableCards: Card187[];
  bids: { seat: number; bid: number }[];
  passedSeats: boolean[];
  highBid: number | null;
  bidderSeat: number | null;
  trump: Suit187 | null;
  currentTrick: TrickPlay187[];
  trickHistory: TrickPlay187[][];
  tricksWon: number[];
  capturedCards: Card187[][];
  hakemPoints: number;
  opponentsPoints: number;
  earlySettled: boolean;
  earlySettledWinner: "HAKEM" | "OPPONENTS" | null;
  continueAfterEarlySettle: boolean;
  phase: Phase187;
  players: Player187[];
  winner: "HAKEM" | "OPPONENTS" | null;
  cheatReportsCount?: number;
  lastCheatVerdict?: {
    confirmed: boolean;
    accusedSeat: number;
    reporterSeat: number;
    announcement: string;
  } | null;
  version: number;
}
