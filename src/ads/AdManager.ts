/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ADMOB_CONFIG } from "./AdConfig";

export interface CharacterAdProgress {
  characterId: string;
  watchedCount: number;
  requiredCount: number;
  unlocked: boolean;
}

const STORAGE_KEY_CHAR_ADS = "ikout_char_ads_progress";
const STORAGE_KEY_FIRST_OPEN = "ikout_app_first_open_time";

class AdManager {
  private bannerVisible = false;
  private bannerTimer: any = null;
  private currentScreen: string = "home"; // "home" | "game" | "other"

  constructor() {
    this.initAppStartTimestamp();
    this.startBannerScheduler();
  }

  private initAppStartTimestamp(): void {
    if (typeof window === "undefined") return;
    try {
      if (!localStorage.getItem(STORAGE_KEY_FIRST_OPEN)) {
        localStorage.setItem(STORAGE_KEY_FIRST_OPEN, String(Date.now()));
      }
    } catch {
      /* ignore */
    }
  }

  public isOnline(): boolean {
    if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
      return navigator.onLine;
    }
    return false;
  }

  /**
   * Tracks whether player is on the Home/Splash screen or in an active game table.
   * Ads are strictly prohibited inside game screens.
   */
  public setCurrentScreen(screen: "home" | "game" | "other"): void {
    this.currentScreen = screen;
    if (screen === "game") {
      this.hideBanner();
    } else if (screen === "home") {
      this.evaluateBannerConditions();
    }
  }

  private startBannerScheduler(): void {
    if (typeof window === "undefined") return;
    this.bannerTimer = setInterval(() => {
      this.evaluateBannerConditions();
    }, 15000); // Check every 15s if interval was reached
  }

  private evaluateBannerConditions(): void {
    if (this.currentScreen !== "home") {
      this.hideBanner();
      return;
    }

    if (!this.isOnline()) {
      this.hideBanner();
      return;
    }

    const firstOpen = Number(localStorage.getItem(STORAGE_KEY_FIRST_OPEN) || Date.now());
    const elapsed = Date.now() - firstOpen;
    if (elapsed < ADMOB_CONFIG.initialDelayMs) {
      return; // Less than 5 minutes since first use
    }

    this.showBanner();
  }

  public async showBanner(): Promise<void> {
    if (this.currentScreen !== "home" || !this.isOnline()) {
      return;
    }
    if (this.bannerVisible) return;

    this.bannerVisible = true;
    const win = window as any;
    if (win.Capacitor?.Plugins?.AdMob?.showBanner) {
      try {
        await win.Capacitor.Plugins.AdMob.showBanner({
          adId: ADMOB_CONFIG.bannerAdUnitId,
          position: "BOTTOM_CENTER",
          margin: 0,
          isTesting: false,
        });
      } catch (e) {
        console.warn("[AdManager] Native banner show failed:", e);
      }
    }
  }

  public async hideBanner(): Promise<void> {
    if (!this.bannerVisible) return;
    this.bannerVisible = false;
    const win = window as any;
    if (win.Capacitor?.Plugins?.AdMob?.hideBanner) {
      try {
        await win.Capacitor.Plugins.AdMob.hideBanner();
      } catch (e) {
        console.warn("[AdManager] Native banner hide failed:", e);
      }
    }
  }

  /**
   * Rewarded Ads for unlocking characters (5 ads per character)
   */
  public getCharacterAdProgress(characterId: string): CharacterAdProgress {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CHAR_ADS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed[characterId]) {
          return parsed[characterId];
        }
      }
    } catch {
      /* ignore */
    }

    return {
      characterId,
      watchedCount: 0,
      requiredCount: 5,
      unlocked: false,
    };
  }

  public async watchRewardedAdForCharacter(characterId: string): Promise<CharacterAdProgress> {
    if (!this.isOnline()) {
      throw new Error("تحتاج إلى اتصال بالإنترنت لمشاهدة الإعلانات");
    }

    const win = window as any;
    if (win.Capacitor?.Plugins?.AdMob?.showRewardVideoAd) {
      try {
        await win.Capacitor.Plugins.AdMob.prepareRewardVideoAd({
          adId: ADMOB_CONFIG.rewardedAdUnitId,
        });
        await win.Capacitor.Plugins.AdMob.showRewardVideoAd();
      } catch (e) {
        console.warn("[AdManager] Rewarded ad failed:", e);
        throw new Error("تعذر تحميل الإعلان، يرجى المحاولة لاحقاً");
      }
    }

    const current = this.getCharacterAdProgress(characterId);
    const newCount = Math.min(current.watchedCount + 1, current.requiredCount);
    const updated: CharacterAdProgress = {
      ...current,
      watchedCount: newCount,
      unlocked: newCount >= current.requiredCount,
    };

    try {
      const saved = localStorage.getItem(STORAGE_KEY_CHAR_ADS);
      const all = saved ? JSON.parse(saved) : {};
      all[characterId] = updated;
      localStorage.setItem(STORAGE_KEY_CHAR_ADS, JSON.stringify(all));
    } catch {
      /* ignore */
    }

    return updated;
  }

  /**
   * Rewarded Ads for Custom Avatar Sessions (5 ads required)
   */
  public getCustomAvatarAdProgress(): {
    watchedCount: number;
    requiredCount: number;
    unlocked: boolean;
  } {
    try {
      const saved = localStorage.getItem("ikout_custom_avatar_ads");
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          watchedCount: Number(parsed.watchedCount) || 0,
          requiredCount: 5,
          unlocked: (Number(parsed.watchedCount) || 0) >= 5,
        };
      }
    } catch {
      /* ignore */
    }
    return { watchedCount: 0, requiredCount: 5, unlocked: false };
  }

  public async watchRewardedAdForCustomAvatar(): Promise<{
    watchedCount: number;
    requiredCount: number;
    unlocked: boolean;
  }> {
    if (!this.isOnline()) {
      throw new Error("تحتاج إلى اتصال بالإنترنت لمشاهدة الإعلانات");
    }

    const win = window as any;
    if (win.Capacitor?.Plugins?.AdMob?.showRewardVideoAd) {
      try {
        await win.Capacitor.Plugins.AdMob.prepareRewardVideoAd({
          adId: ADMOB_CONFIG.rewardedAdUnitId,
        });
        await win.Capacitor.Plugins.AdMob.showRewardVideoAd();
      } catch (e) {
        console.warn("[AdManager] Rewarded ad failed:", e);
        throw new Error("تعذر تحميل الإعلان، يرجى المحاولة لاحقاً");
      }
    }

    const current = this.getCustomAvatarAdProgress();
    const newCount = Math.min(current.watchedCount + 1, current.requiredCount);
    const updated = {
      watchedCount: newCount,
      requiredCount: 5,
      unlocked: newCount >= 5,
    };

    try {
      localStorage.setItem("ikout_custom_avatar_ads", JSON.stringify(updated));
    } catch {
      /* ignore */
    }

    return updated;
  }

  public resetCustomAvatarAdProgress(): void {
    try {
      localStorage.removeItem("ikout_custom_avatar_ads");
    } catch {
      /* ignore */
    }
  }
}

export const adManager = new AdManager();
