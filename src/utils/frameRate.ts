/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type FrameRateTarget = 60 | 90 | 120;

const STORAGE_KEY_FPS = "ikout_target_fps_v1";

export function loadTargetFps(): FrameRateTarget {
  if (typeof window === "undefined") return 60;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FPS);
    if (raw) {
      const val = parseInt(raw, 10);
      if (val === 60 || val === 90 || val === 120) return val;
    }
  } catch (err) {
    console.warn("Failed to load FPS setting:", err);
  }
  return 60;
}

export function saveTargetFps(fps: FrameRateTarget): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_FPS, fps.toString());
    applyFrameRate(fps);
  } catch (err) {
    console.warn("Failed to save FPS setting:", err);
  }
}

/**
 * Applies the frame rate limit / refresh rate request.
 * For Android WebView / Chrome and modern mobile devices,
 * this hints CSS rendering performance and regulates animation cadence.
 */
export function applyFrameRate(fps: FrameRateTarget): void {
  if (typeof document === "undefined") return;

  // Set data attribute on root element for CSS animation adjustments
  document.documentElement.dataset["targetFps"] = fps.toString();

  // Try Android WebView / Screen refresh rate adaptation API if exposed
  if ("screen" in window && (window.screen as any).orientation) {
    try {
      // Hints the browser frame scheduler
      (window as any).__IKOUT_TARGET_FPS__ = fps;
    } catch {
      // Safe no-op
    }
  }
}
