import { useEffect, type RefObject } from 'react';

/** Read the device safe-area insets (notch / home indicator) in px. */
function readSafeInsets() {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;' +
    'padding-top:env(safe-area-inset-top,0px);padding-right:env(safe-area-inset-right,0px);' +
    'padding-bottom:env(safe-area-inset-bottom,0px);padding-left:env(safe-area-inset-left,0px);';
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
 * Fit a fixed-size stage into the visible, notch-safe area of the viewport:
 * centered, rotated 90° in portrait phones and scaled to fit without clipping.
 */
export function useStageFit(stageRef: RefObject<HTMLDivElement | null>, stageW = 1536, stageH = 691) {
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
      const portrait = h > w;
      const s = portrait ? Math.min(h / stageW, w / stageH) : Math.min(w / stageW, h / stageH);
      // Shift the center to the middle of the safe area.
      const dx = (ins.l - ins.r) / 2;
      const dy = (ins.t - ins.b) / 2;
      el.style.transform = `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))${portrait ? ' rotate(90deg)' : ''} scale(${s})`;
    };
    fit();
    const late = window.setTimeout(fit, 350);
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);
    window.visualViewport?.addEventListener('resize', fit);
    return () => {
      window.clearTimeout(late);
      window.removeEventListener('resize', fit);
      window.removeEventListener('orientationchange', fit);
      window.visualViewport?.removeEventListener('resize', fit);
    };
  }, [stageRef]);
}
