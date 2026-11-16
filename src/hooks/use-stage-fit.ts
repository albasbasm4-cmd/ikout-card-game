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
 */
export function useStageFit(
  stageRef: RefObject<HTMLDivElement | null>,
  stageW = 1536,
  stageH = 691,
  orientation: "landscape" | "portrait" = "landscape",
) {
  useEffect(() => {
    let animFrameId = 0;

    const fit = () => {
      const el = stageRef.current;
      if (!el) return;

      const isNative = typeof window !== "undefined" && Capacitor.isNativePlatform();
      const kbActive = isKeyboardActive();

      // On native platform with adjustNothing, or when keyboard is active,
      // preserve stable window dimensions so the stage does not compress or shrink.
      const vv = window.visualViewport;
      const useVv = !isNative && !kbActive && !!vv;
      const rawVw = useVv
        ? vv.width
        : window.innerWidth || document.documentElement.clientWidth || 1;
      const rawVh = useVv
        ? vv.height
        : window.innerHeight || document.documentElement.clientHeight || 1;

      const ins = readSafeInsets();
      const w = Math.max(1, rawVw - ins.l - ins.r);
      const h = Math.max(1, rawVh - ins.t - ins.b);

      const isDevicePortrait = h > w;

      // On native Android, Activity owns orientation — do NOT rotate with CSS.
      // On Web only: rotate 90deg if the browser viewport is in portrait.
      const shouldRotate = !isNative && orientation === "landscape" && isDevicePortrait;
      const s = shouldRotate ? Math.min(h / stageW, w / stageH) : Math.min(w / stageW, h / stageH);

      const dx = (ins.l - ins.r) / 2;
      const dy = (ins.t - ins.b) / 2;
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
        // Staggered follow-ups after returning from background to catch immersive bar hide
        window.setTimeout(fit, 80);
        window.setTimeout(fit, 250);
        window.setTimeout(fit, 600);
      }
    };

    // Immediate calculation
    fit();
    animFrameId = requestAnimationFrame(fit);

    // Staggered initial recalculations for system bars / immersive mode transitions
    const t1 = window.setTimeout(fit, 60);
    const t2 = window.setTimeout(fit, 180);
    const t3 = window.setTimeout(fit, 400);
    const t4 = window.setTimeout(fit, 800);

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
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearTimeout(t4);
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
