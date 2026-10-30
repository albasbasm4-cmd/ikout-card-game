import { useEffect, type RefObject } from "react";

/** Read the device safe-area insets (notch / home indicator) in px. */
function readSafeInsets() {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;pointer-events:none;" +
    "padding-top:env(safe-area-inset-top,0px);padding-right:env(safe-area-inset-right,0px);" +
    "padding-bottom:env(safe-area-inset-bottom,0px);padding-left:env(safe-area-inset-left,0px);";
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const r = {
    t: parseFloat(cs.paddingTop) || 0,
    r: parseFloat(cs.paddingRight) || 0,
    b: parseFloat(cs.paddingBottom) || 0,
    l: parseFloat(cs.paddingLeft) || 0,
  };
  probe.remove();
  return r;
}

/**
 * Fit a fixed-size stage into the visible, notch-safe area of the viewport.
 * By default (orientation = 'landscape'), forces landscape: if the device is portrait,
 * it rotates 90° and scales to fit so the game is viewed horizontally.
 * If orientation = 'portrait', it leaves the view vertical without the 90° rotation.
 */
export function useStageFit(
  stageRef: RefObject<HTMLDivElement | null>,
  stageW = 1536,
  stageH = 691,
  orientation: "landscape" | "portrait" = "landscape",
) {
  useEffect(() => {
    const fit = () => {
      const el = stageRef.current;
      if (!el) return;
      const vv = window.visualViewport;
      const vw = vv?.width ?? window.innerWidth;
      const vh = vv?.height ?? window.innerHeight;
      const ins = readSafeInsets();
      const w = Math.max(1, vw - ins.l - ins.r);
      const h = Math.max(1, vh - ins.t - ins.b);
      const isDevicePortrait = h > w;

      const shouldRotate = orientation === "landscape" && isDevicePortrait;
      const s = shouldRotate ? Math.min(h / stageW, w / stageH) : Math.min(w / stageW, h / stageH);

      const dx = (ins.l - ins.r) / 2;
      const dy = (ins.t - ins.b) / 2;
      el.style.transform = `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))${
        shouldRotate ? " rotate(90deg)" : ""
      } scale(${s})`;
    };

    fit();
    const t1 = window.setTimeout(fit, 80);
    const t2 = window.setTimeout(fit, 250);
    const t3 = window.setTimeout(fit, 600);

    window.addEventListener("resize", fit);
    window.addEventListener("orientationchange", fit);
    window.visualViewport?.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("scroll", fit);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.removeEventListener("resize", fit);
      window.removeEventListener("orientationchange", fit);
      window.visualViewport?.removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("scroll", fit);
    };
  }, [stageRef, stageW, stageH, orientation]);
}
