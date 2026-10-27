import { useEffect, type RefObject } from 'react';

/**
 * Fit a fixed-size 1536x691 stage (the home.html port) into the viewport:
 * centered via translate(-50%,-50%), rotated 90° in portrait phones and
 * scaled to fill the screen. Shared by the home and setup screens.
 */
export function useStageFit(stageRef: RefObject<HTMLDivElement | null>, stageW = 1536, stageH = 691) {
  useEffect(() => {
    const fit = () => {
      const el = stageRef.current;
      if (!el) return;
      const w = window.innerWidth, h = window.innerHeight;
      const portrait = h > w;
      const s = portrait ? Math.min(h / stageW, w / stageH) : Math.min(w / stageW, h / stageH);
      el.style.transform = `translate(-50%,-50%)${portrait ? ' rotate(90deg)' : ''} scale(${s})`;
    };
    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);
    return () => {
      window.removeEventListener('resize', fit);
      window.removeEventListener('orientationchange', fit);
    };
  }, [stageRef]);
}
