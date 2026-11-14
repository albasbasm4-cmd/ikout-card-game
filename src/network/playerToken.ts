/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * إدارة توكنات اللاعبين الثابتة لكل لعبة لضمان إعادة الاتصال
 * واحتفاظ اللاعب بمقعده وأوراقه عند انقطاع الشبكة.
 */

export function getPersistentPlayerToken(gameKey: string = "ikout"): string {
  const storageKey = `${gameKey}_player_token`;
  try {
    let token = localStorage.getItem(storageKey);
    if (!token) {
      token =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${gameKey}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(storageKey, token);
    }
    return token;
  } catch {
    return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${gameKey}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
