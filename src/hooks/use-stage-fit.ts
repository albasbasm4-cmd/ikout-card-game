import { useEffect, type RefObject } from 'react';

/**
 * Fit a fixed-size 1536x691 stage (the home.html port) into the viewport:
 * centered via translate(-50%,-50%), rotated 90° in portrait phones and
 * scaled to fill the screen. Shared by the home and setup screens.
 */
export function useStageFit(stageRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const fit = () => {
      const el = stageRef.current;
      if (!el) return;
      const w = window.innerWidth, h = window.innerHeight;
      const portrait = h > w;
      const s = portrait ? Math.min(h / 1536, w / 691) : Math.min(w / 1536, h / 691);
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
