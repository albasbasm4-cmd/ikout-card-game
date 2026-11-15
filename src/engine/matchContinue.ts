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
/**
 * Who may decide continue/stop after a Kout match ends:
 * - Only human players may decide (never bots).
 * - If there are human players on the losing team, only those losing human players may decide.
 * - If there is no human player on the losing team:
 *   - If the match contains bots, the winning team is NOT granted continue authority.
 *   - Only if the match contains no bots at all (all humans) may the winning team decide.
 */
export function canDecideContinue(state: GameState, seat: number, humanSeats: number[]): boolean {
  if (state.phase !== "GAME_END" || state.matchStopped) return false;
  if (!humanSeats.includes(seat)) return false;

  const loser = koutLoserTeam(state);
  const humanLosers = humanSeats.filter((s) => seatTeam(state, s) === loser);

  if (humanLosers.length > 0) {
    return seatTeam(state, seat) === loser;
  }

  // لا يوجد لاعب بشري في الفريق الخاسر:
  // إذا كانت المباراة تحتوي على بوتات، لا يُمنح الفريق الفائز صلاحية اتخاذ القرار.
  const hasBots = (state.players || []).some((p) => p.kind === "AI_BOT");
  if (hasBots) {
    return false;
  }

  // احتفظ بحق الفريق الفائز في اتخاذ القرار فقط بشرط عدم وجود بوتات في المباراة
  return true;
}
