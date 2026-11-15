import type { GameState } from "../types/kout";

/** Team that won the finished Kout match (target reached or Bawan). */
export function koutWinnerTeam(
  state: Pick<GameState, "scores" | "targetScore" | "roundNo" | "highBid" | "tricksWon">,
): 0 | 1 {
  if (state.roundNo === 1 && state.highBid === 9) {
    if (state.tricksWon[0] === 9) return 0;
    if (state.tricksWon[1] === 9) return 1;
  }
  const target = state.targetScore ?? 51;
  const t0 = state.scores[0] >= target;
  const t1 = state.scores[1] >= target;
  if (t0 && t1) {
    return state.scores[0] >= state.scores[1] ? 0 : 1;
  }
  if (t0) return 0;
  if (t1) return 1;
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
  if (!humanSeats.includes(seat)) return false;
  const loser = koutLoserTeam(state);
  const humanLosers = humanSeats.filter((s) => seatTeam(state, s) === loser);
  if (humanLosers.length === 0) return true;
  return seatTeam(state, seat) === loser;
}
