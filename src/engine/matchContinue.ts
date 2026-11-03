import type { GameState } from "../types/kout";

/** Team that won the finished Kout match (target reached or Bawan). */
export function koutWinnerTeam(state: Pick<GameState, "scores" | "targetScore" | "roundNo" | "highBid" | "tricksWon">): 0 | 1 {
  const team0 =
    state.scores[0] >= state.targetScore ||
    (state.roundNo === 1 && state.highBid === 9 && state.tricksWon[0] === 9);
  if (team0) return 0;
  if (state.scores[1] >= state.targetScore) return 1;
  return state.scores[0] >= state.scores[1] ? 0 : 1;
}

export function koutLoserTeam(state: Parameters<typeof koutWinnerTeam>[0]): 0 | 1 {
  return koutWinnerTeam(state) === 0 ? 1 : 0;
}

export function seatTeam(state: Pick<GameState, "players">, seat: number): 0 | 1 {
  const p = state.players?.find((s) => s.seatIndex === seat);
  return (p?.team ?? seat % 2) as 0 | 1;
}

/**
 * Who may decide continue/stop after a Kout match ends: only seats on the losing team.
 * If the losing team has no human seat at all, any human may decide.
 */
export function canDecideContinue(state: GameState, seat: number, humanSeats: number[]): boolean {
  if (state.phase !== "GAME_END" || state.matchStopped) return false;
  const loser = koutLoserTeam(state);
  const humanLosers = humanSeats.filter((s) => seatTeam(state, s) === loser);
  if (humanLosers.length === 0) return humanSeats.includes(seat);
  return seatTeam(state, seat) === loser;
}
