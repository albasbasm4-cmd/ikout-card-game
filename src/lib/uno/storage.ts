import type { GameState } from "./engine";

const KEY = "uno.savedGame.v1";

export function saveGame(s: GameState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked */
  }
}
export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    return Array.isArray(s.players) && Array.isArray(s.drawPile) ? s : null;
  } catch {
    return null;
  }
}
export function clearGame() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
