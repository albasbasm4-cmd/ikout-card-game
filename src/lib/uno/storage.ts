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

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingState: GameState | null = null;

function flushSaveGame() {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!pendingState) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(pendingState));
  } catch {
    /* storage full or blocked */
  }
  pendingState = null;
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", flushSaveGame);
  window.addEventListener("pagehide", flushSaveGame);
}

const isTest = typeof process !== "undefined" && (process.env.NODE_ENV === "test" || Boolean(process.env.VITEST));

export function saveGame(s: GameState, immediate: boolean = false) {
  pendingState = s;
  if (isTest || immediate || s.status === "roundOver" || s.status === "matchOver") {
    flushSaveGame();
    return;
  }
  if (saveTimer !== null) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushSaveGame();
  }, 300);
}

export function loadGame(): GameState | null {
  flushSaveGame();
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
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  pendingState = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
