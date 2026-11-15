/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * إدارة توكنات اللاعبين الثابتة لكل لعبة لضمان استقرار الهوية
 * وإعادة الاتصال واحتفاظ اللاعب بمقعده وأوراقه عند انقطاع الشبكة.
 */

export function getPersistentPlayerToken(gameKey: string = "ikout"): string {
  const storageKey = `${gameKey}_player_token`;
  try {
    if (typeof localStorage !== "undefined") {
      let token = localStorage.getItem(storageKey);
      if (!token) {
        token =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${gameKey}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem(storageKey, token);
      }
      return token;
    }
  } catch {
    // fallback if localStorage is blocked
  }

  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${gameKey}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function generateSessionId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function generateMessageId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
