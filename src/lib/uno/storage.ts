import type { GameState } from "./engine";

/**
 * تحقق شكلي من سلامة الحفظ المحمّل: بيانات تالفة (يد فارغة غير صحيحة، كومة سحب
 * مفقودة، حقل حالة اللعب غريب) تُتجاهل بدل أن تكسر طاولة أونو عند التحميل.
 */
function isValidSavedGame(s: unknown): s is GameState {
  if (!s || typeof s !== "object") return false;
  const g = s as Partial<GameState>;
  if (g.status !== "playing" && g.status !== "roundOver" && g.status !== "matchOver") return false;
  if (!Array.isArray(g.players) || g.players.length < 2 || g.players.length > 6) return false;
  if (!Array.isArray(g.drawPile) || !Array.isArray(g.discard)) return false;
  if (!g.players.every((p) => p && Array.isArray(p.hand) && typeof p.name === "string")) {
    return false;
  }
  if (typeof g.activeColor !== "string" || (g.direction !== 1 && g.direction !== -1)) return false;
  if (typeof g.round !== "number" || typeof g.version !== "number") return false;
  if (typeof g.current !== "number" || g.current < 0 || g.current >= g.players.length) {
    return false;
  }
  const uv = g.unoVulnerable;
  if (uv !== null && (typeof uv !== "number" || uv < 0 || uv >= g.players.length)) return false;
  return true;
}

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
    const s: unknown = JSON.parse(raw);
    return isValidSavedGame(s) ? s : null;
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
