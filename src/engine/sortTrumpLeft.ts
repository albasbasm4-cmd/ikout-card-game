import type { Card, Suit } from "../types/kout";

/** Stable partition: trump cards first (leftmost in the LTR fan), order kept within groups. */
export function sortTrumpLeft(cards: readonly Card[], trump?: Suit | null): Card[] {
  if (!trump) return [...cards];
  const isTrump = (c: Card) => !(c as { joker?: unknown }).joker && c.suit === trump;
  return [...cards.filter(isTrump), ...cards.filter((c) => !isTrump(c))];
}
