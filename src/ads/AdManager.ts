/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AdManager handles Google AdMob interstitial ads (every 5 minutes of online play)
 * and rewarded video ads (e.g. 5 ads to unlock specific characters).
 * Offline/Hotspot friendly: skips gracefully when no internet connection is available.
 */

export interface CharacterAdProgress {
  characterId: string;
  watchedCount: number;
  requiredCount: number;
  unlocked: boolean;
}

const STORAGE_KEY_CHAR_ADS = "ikout_char_ads_progress";
const INTERSTITIAL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

class AdManager {
  private lastInterstitialTime = Date.now();
  private timer: any = null;

  constructor() {
    this.startInterstitialTimer();
  }

  public isOnline(): boolean {
    if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
      return navigator.onLine;
    }
    return false;
  }

  private startInterstitialTimer(): void {
    if (typeof window === "undefined") return;
    this.timer = setInterval(() => {
      this.checkAndShowTimedInterstitial();
    }, 60000); // Check every minute
  }

  /**
   * Shows an interstitial ad if 5 minutes have passed and device is online.
   */
  public async checkAndShowTimedInterstitial(): Promise<boolean> {
    const now = Date.now();
    if (now - this.lastInterstitialTime < INTERSTITIAL_INTERVAL_MS) {
      return false;
    }

    if (!this.isOnline()) {
      // Hotspot or offline: do not block or lag game
      return false;
    }

    this.lastInterstitialTime = now;
    return this.showInterstitial();
  }

  public async showInterstitial(): Promise<boolean> {
    if (!this.isOnline()) return false;

    // Check for native Capacitor AdMob
    const win = window as any;
    if (win.Capacitor?.Plugins?.AdMob?.showInterstitial) {
      try {
        await win.Capacitor.Plugins.AdMob.showInterstitial();
        return true;
      } catch (e) {
        console.warn("[AdManager] Failed to show native interstitial:", e);
        return false;
      }
    }

    // Web / preview fallback simulation
    console.log("[AdManager] Simulated 5-min interstitial ad (online)");
    return true;
  }

  /**
   * Rewarded Ads for Character Unlocks (e.g. 5 ads per character)
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
      // ignore
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
      // ignore
    }

    return updated;
  }
}

export const adManager = new AdManager();
