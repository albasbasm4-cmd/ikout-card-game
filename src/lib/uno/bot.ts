import { canPlay, cardPoints, COLORS, nextIndex, type Card, type Color, type GameState } from "./engine";

export type BotMove =
  | { type: "play"; cardId: string; color?: Color }
  | { type: "draw" }
  | { type: "pass" };

function bestColor(hand: Card[]): Color {
  const counts = COLORS.map((c) => ({ c, n: hand.filter((h) => h.color === c).length }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].c : COLORS[Math.floor(Math.random() * 4)];
}

// Bots only read their own hand plus public info (card counts, top card, direction).
export function chooseMove(s: GameState, pi: number): BotMove {
  const me = s.players[pi];
  const playable = me.hand.filter((c) => canPlay(s, c));
  if (playable.length === 0) return s.drawnCardId ? { type: "pass" } : { type: "draw" };

  let pick: Card;
  if (me.difficulty === "easy") {
    const plain = playable.filter((c) => c.kind === "number" || c.kind === "wild");
    const pool = plain.length ? plain : playable;
    pick = pool[Math.floor(Math.random() * pool.length)];
  } else {
    const next = s.players[nextIndex(s, pi)];
    const threat = next.hand.length <= 2;
    const score = (c: Card) => {
      let v = cardPoints(c);
      if (me.difficulty === "hard") {
        if (threat && (c.kind === "draw2" || c.kind === "wild4" || c.kind === "skip")) v += 200;
        if (threat && c.kind === "reverse" && s.players.length > 2) v += 120;
        // save wilds for later unless needed or nearly out
        if (!threat && (c.kind === "wild" || c.kind === "wild4") && me.hand.length > 3) v -= 80;
        // prefer keeping the color we hold most of
        if (c.color === bestColor(me.hand)) v += 5;
      } else if (c.kind !== "number") v += 10;
      return v;
    };
    pick = [...playable].sort((a, b) => score(b) - score(a))[0];
  }
  const isWild = pick.kind === "wild" || pick.kind === "wild4";
  const rest = me.hand.filter((c) => c.id !== pick.id);
  const color = isWild ? (me.difficulty === "easy" ? COLORS[Math.floor(Math.random() * 4)] : bestColor(rest)) : undefined;
  return color ? { type: "play", cardId: pick.id, color } : { type: "play", cardId: pick.id };
}

/** Chance that a bot remembers to call UNO / catches a missed call. */
export function botAwareness(d: GameState["players"][number]["difficulty"]): number {
  return d === "easy" ? 0.6 : d === "medium" ? 0.85 : 1;
}
