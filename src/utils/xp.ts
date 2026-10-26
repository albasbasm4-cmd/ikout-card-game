/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';

const KEY = 'ikout_xp_v1';
const listeners = new Set<(xp: number) => void>();

export function loadXp(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const n = Number(JSON.parse(localStorage.getItem(KEY) || '0'));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch { return 0; }
}

export function addXp(amount: number): number {
  const next = loadXp() + Math.max(0, Math.round(amount));
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  listeners.forEach(l => l(next));
  return next;
}

/**
 * XP needed to advance from level n to n+1 — the usual curve in similar
 * games: each level costs more than the last (100, 200, 300, ...).
 */
export function xpForLevel(level: number): number {
  return 100 * level;
}

/** Breaks total XP into a level, progress inside the level, and what is left. */
export function levelInfo(xp: number): { level: number; inLevel: number; needed: number } {
  let level = 1;
  let remaining = Math.max(0, xp);
  while (remaining >= xpForLevel(level)) { remaining -= xpForLevel(level); level++; }
  return { level, inLevel: remaining, needed: xpForLevel(level) };
}

/** XP for finishing a match: base 30 for a win, +15 for holding a 9-bid (كوت). */
export function addXpForGame(won: boolean, highBid: number): number {
  if (!won) return 0;
  return addXp(30 + (highBid >= 9 ? 15 : 0));
}

export function useXp(): { xp: number; level: number; inLevel: number; needed: number } {
  const [xp, setXp] = useState(0);
  useEffect(() => {
    setXp(loadXp());
    listeners.add(setXp);
    return () => { listeners.delete(setXp); };
  }, []);
  const info = levelInfo(xp);
  return { xp, ...info };
}
