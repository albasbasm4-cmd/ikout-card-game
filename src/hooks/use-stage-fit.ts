import { useEffect, type RefObject } from "react";
import { Capacitor } from "@capacitor/core";
import { isKeyboardActive } from "@/utils/keyboardOverlay";

let safeProbeEl: HTMLDivElement | null = null;

/** Read the device safe-area insets (notch / home indicator / system bars) in px without DOM thrashing. */
function readSafeInsets() {
  if (typeof document === "undefined") {
    return { t: 0, r: 0, b: 0, l: 0 };
  }
  if (!safeProbeEl || !safeProbeEl.isConnected) {
    safeProbeEl = document.createElement("div");
    safeProbeEl.id = "ikout-safe-area-probe";
    safeProbeEl.style.cssText =
      "position:fixed;visibility:hidden;pointer-events:none;z-index:-9999;" +
      "padding-top:env(safe-area-inset-top,0px);padding-right:env(safe-area-inset-right,0px);" +
      "padding-bottom:env(safe-area-inset-bottom,0px);padding-left:env(safe-area-inset-left,0px);";
    document.body.appendChild(safeProbeEl);
  }
  const cs = getComputedStyle(safeProbeEl);
  return {
    t: parseFloat(cs.paddingTop) || 0,
    r: parseFloat(cs.paddingRight) || 0,
    b: parseFloat(cs.paddingBottom) || 0,
    l: parseFloat(cs.paddingLeft) || 0,
  };
}

/**
 * Fit a fixed-size stage into the visible, notch-safe area of the viewport.
 * - On native Android (Capacitor APK): orientation is handled entirely by the Android
 *   Activity (sensorLandscape), so CSS rotation (rotate 90deg) is never applied.
 * - When the Android soft keyboard appears as an overlay, stage dimensions and scaling
 *   are preserved without shrinking or compressing the game layout.
 * - On Web (browsers): if viewed in portrait, it can rotate 90° and scale to fit
 *   so the game can still be played horizontally in a mobile browser.
 * - Respects safe area insets so system status bar, navigation bar, and display cutout/notch
 *   never clip content, while maximizing horizontal screen utilization in fullscreen.
 * - Guards against double-subtracting safe area insets if a parent container already applies safe padding.
 * - Carefully tracks and cleans up all staggered timers and listeners on unmount.
 */
export function useStageFit(
  stageRef: RefObject<HTMLDivElement | null>,
  stageW = 1536,
  stageH = 691,
  orientation: "landscape" | "portrait" = "landscape",
) {
  useEffect(() => {
    let animFrameId = 0;
    const activeTimers = new Set<number>();

    const safeTimeout = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        activeTimers.delete(id);
        fn();
      }, ms);
      activeTimers.add(id);
      return id;
    };

    const fit = () => {
      const el = stageRef.current;
      if (!el) return;

      const isNative = typeof window !== "undefined" && Capacitor.isNativePlatform();
      const kbActive = isKeyboardActive();

      // On native platform with adjustNothing and fullscreen, window dimensions provide
      // stable geometry that spans the display. On web browsers without keyboard,
      // visualViewport captures the visible area accounting for browser UI chrome.
      const vv = typeof window !== "undefined" ? window.visualViewport : null;
      const useVv = !isNative && !kbActive && !!vv;
      const rawVw = useVv
        ? vv.width
        : window.innerWidth ||
          (typeof document !== "undefined" ? document.documentElement.clientWidth : 0) ||
          1;
      const rawVh = useVv
        ? vv.height
        : window.innerHeight ||
          (typeof document !== "undefined" ? document.documentElement.clientHeight : 0) ||
          1;

      const ins = readSafeInsets();

      // Check if stage parent container already applies padding or safe insets
      let parentPadL = 0;
      let parentPadR = 0;
      let parentPadT = 0;
      let parentPadB = 0;
      const parent = el.parentElement;
      if (
        parent &&
        typeof document !== "undefined" &&
        parent !== document.body &&
        parent !== document.documentElement
      ) {
        const pcs = getComputedStyle(parent);
        parentPadL = parseFloat(pcs.paddingLeft) || 0;
        parentPadR = parseFloat(pcs.paddingRight) || 0;
        parentPadT = parseFloat(pcs.paddingTop) || 0;
        parentPadB = parseFloat(pcs.paddingBottom) || 0;
      }

      // Do NOT subtract safe area twice if parent container already applies padding for insets
      const effectiveInsetL = Math.max(ins.l, parentPadL);
      const effectiveInsetR = Math.max(ins.r, parentPadR);
      const effectiveInsetT = Math.max(ins.t, parentPadT);
      const effectiveInsetB = Math.max(ins.b, parentPadB);

      const w = Math.max(1, rawVw - effectiveInsetL - effectiveInsetR);
      const h = Math.max(1, rawVh - effectiveInsetT - effectiveInsetB);

      const isDevicePortrait = h > w;

      // On native Android, Activity owns orientation — do NOT rotate with CSS.
      // On Web only: rotate 90deg if the browser viewport is in portrait.
      const shouldRotate = !isNative && orientation === "landscape" && isDevicePortrait;
      const s = shouldRotate ? Math.min(h / stageW, w / stageH) : Math.min(w / stageW, h / stageH);

      // Center stage precisely within the available safe area
      const dx = (effectiveInsetL - effectiveInsetR) / 2;
      const dy = (effectiveInsetT - effectiveInsetB) / 2;
      const nextTransform = `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))${
        shouldRotate ? " rotate(90deg)" : ""
      } scale(${s})`;

      if (el.style.transform !== nextTransform) {
        el.style.transform = nextTransform;
      }
    };

    const scheduleFit = () => {
      cancelAnimationFrame(animFrameId);
      animFrameId = requestAnimationFrame(fit);
    };

    const handleVisualViewportResize = () => {
      // Ignore visualViewport resizing triggered by software keyboard overlay
      if (isKeyboardActive()) return;
      scheduleFit();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        scheduleFit();
        // Staggered follow-ups after returning from background to catch immersive bar transitions
        safeTimeout(fit, 80);
        safeTimeout(fit, 250);
        safeTimeout(fit, 600);
      }
    };

    // Immediate calculation
    fit();
    animFrameId = requestAnimationFrame(fit);

    // Staggered initial recalculations for system bars / immersive mode transitions
    safeTimeout(fit, 60);
    safeTimeout(fit, 180);
    safeTimeout(fit, 400);
    safeTimeout(fit, 800);

    window.addEventListener("resize", scheduleFit);
    window.addEventListener("orientationchange", scheduleFit);
    window.addEventListener("focus", scheduleFit);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("fullscreenchange", scheduleFit);

    // ResizeObserver on documentElement ensures we catch viewport changes when system bars hide
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        scheduleFit();
      });
      resizeObserver.observe(document.documentElement);
    }

    window.visualViewport?.addEventListener("resize", handleVisualViewportResize);
    window.visualViewport?.addEventListener("scroll", handleVisualViewportResize);

    return () => {
      cancelAnimationFrame(animFrameId);
      activeTimers.forEach((id) => window.clearTimeout(id));
      activeTimers.clear();
      window.removeEventListener("resize", scheduleFit);
      window.removeEventListener("orientationchange", scheduleFit);
      window.removeEventListener("focus", scheduleFit);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("fullscreenchange", scheduleFit);
      resizeObserver?.disconnect();
      window.visualViewport?.removeEventListener("resize", handleVisualViewportResize);
      window.visualViewport?.removeEventListener("scroll", handleVisualViewportResize);
    };
  }, [stageRef, stageW, stageH, orientation]);
}
