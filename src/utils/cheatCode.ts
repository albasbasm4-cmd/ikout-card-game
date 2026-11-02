/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const SECRET_CHEAT_CODE = "IKOUT_2026_VIP";
export const VIP_MAX_SUFFIX = 45;
const STORAGE_KEY_CHAR_ADS = "ikout_char_ads_progress";
const STORAGE_KEY_VIP_INDEX = "ikout_vip_code_index";

export interface CheatResult {
  success: boolean;
  message: string;
}

/** Code expected at a given usage index: 0 → base, n → "BASE n" (1..45). */
export function expectedVipCode(index: number): string | null {
  if (index < 0 || index > VIP_MAX_SUFFIX) return null;
  return index === 0 ? SECRET_CHEAT_CODE : `${SECRET_CHEAT_CODE} ${index}`;
}

const normalize = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();

/** Pure check: is `input` the next valid code for `usedCount` previous unlocks? */
export function checkVipCode(input: string, usedCount: number): CheatResult {
  const trimmed = normalize(input || "");
  if (!trimmed) return { success: false, message: "يرجى كتابة الكود أولاً." };
  const expected = expectedVipCode(usedCount);
  if (!expected) return { success: false, message: "تم استخدام جميع الأكواد المتاحة." };
  if (trimmed !== normalize(expected)) {
    return { success: false, message: "الكود غير صحيح أو مستخدم من قبل." };
  }
  return { success: true, message: "الكود صحيح! اختر شخصية واحدة ثم اضغط تأكيد." };
}

export function loadVipIndex(): number {
  if (typeof window === "undefined") return 0;
  const n = Number(localStorage.getItem(STORAGE_KEY_VIP_INDEX) || 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Unlock exactly one character and consume the current code. */
export function redeemVipForCharacter(charId: string): CheatResult {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CHAR_ADS);
    const map: Record<string, unknown> = raw ? JSON.parse(raw) : {};
    map[charId] = { characterId: charId, watchedCount: 5, requiredCount: 5, unlocked: true };
    localStorage.setItem(STORAGE_KEY_CHAR_ADS, JSON.stringify(map));
    localStorage.setItem(STORAGE_KEY_VIP_INDEX, String(loadVipIndex() + 1));
    window.dispatchEvent(new Event("ikout_characters_unlocked"));
    return { success: true, message: "تم فتح الشخصية بنجاح!" };
  } catch {
    return { success: false, message: "حدث خطأ أثناء حفظ البيانات." };
  }
}
