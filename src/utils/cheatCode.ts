/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CHARACTER_IDS } from "./profile";

export const SECRET_CHEAT_CODE = "IKOUT_2026_VIP";
const STORAGE_KEY_CHAR_ADS = "ikout_char_ads_progress";

export interface CheatResult {
  success: boolean;
  message: string;
}

export function applyCheatCode(inputCode: string): CheatResult {
  const trimmed = inputCode ? inputCode.trim() : "";

  if (!trimmed) {
    return { success: false, message: "يرجى كتابة الكود السري أولاً." };
  }

  if (trimmed.toUpperCase() !== SECRET_CHEAT_CODE.toUpperCase()) {
    return { success: false, message: "الكود السري غير صحيح!" };
  }

  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY_CHAR_ADS) : null;
    const progressMap: Record<string, any> = raw ? JSON.parse(raw) : {};

    CHARACTER_IDS.forEach((charId: string) => {
      progressMap[charId] = {
        characterId: charId,
        watchedCount: 5,
        requiredCount: 5,
        unlocked: true,
      };
    });

    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_CHAR_ADS, JSON.stringify(progressMap));
      // إشعار الواجهة بتحديث الشخصيات فوراً
      window.dispatchEvent(new Event("ikout_characters_unlocked"));
    }

    return {
      success: true,
      message: "تم تفعيل الكود بنجاح! تم فتح جميع الشخصيات.",
    };
  } catch (error) {
    console.error("فشل حفظ حالة الشخصيات في التخزين المحلي:", error);
    return { success: false, message: "حدث خطأ أثناء حفظ البيانات." };
  }
}
