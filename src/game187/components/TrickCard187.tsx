import React, { useLayoutEffect, useRef } from "react";
import { animate, motion, useMotionValue } from "motion/react";
import { Card } from "../../components/Card";
import { CARD_FLIGHT_SECONDS, linearToScreen, peekCardLaunch } from "../../utils/cardFlight";
import type { TrickPlay187 } from "../types";

interface TrickCard187Props {
  play: TrickPlay187;
  left: number;
  top: number;
  zIndex: number;
  winning: boolean;
  exitX: number;
  exitY: number;
  reducedMotion: boolean;
}

/**
 * A card on the 187 table. On mount it flies from the spot the local player
 * released/tapped it, or from the bot's avatar, to its slot — the same motion
 * as the iKout table. Presentation only: engine timing and rules are untouched.
 */
export function TrickCard187({
  play,
  left,
  top,
  zIndex,
  winning,
  exitX,
  exitY,
  reducedMotion,
}: TrickCard187Props) {
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const rotate = useMotionValue(0);
  const opacity = useMotionValue(1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || started.current || reducedMotion) return;
    started.current = true;
    const own = el.getBoundingClientRect();
    if (!own.width) return;
    const launch = peekCardLaunch(play.card.id);
    let src: { cx: number; cy: number; w: number; rot: number; fade: boolean } | null = null;
    if (launch) {
      src = {
        cx: launch.rect.left + launch.rect.width / 2,
        cy: launch.rect.top + launch.rect.height / 2,
        w: launch.rect.width,
        rot: launch.rotate,
        fade: false,
      };
    } else {
      const origin = el
        .closest(".kt-root")
        ?.querySelector(`[data-seat-origin="${play.seat}"] .kt-avatar`);
      if (origin) {
        const r = origin.getBoundingClientRect();
        src = {
          cx: r.left + r.width / 2,
          cy: r.top + r.height / 2,
          w: own.width * 0.55,
          rot: 0,
          fade: true,
        };
      }
    }
    if (!src) return;
    const inv = linearToScreen(el.parentElement).inverse();
    const d = inv.transformPoint(
      new DOMPoint(src.cx - (own.left + own.width / 2), src.cy - (own.top + own.height / 2)),
    );
    x.set(d.x);
    y.set(d.y);
    scale.set(Math.max(0.3, Math.min(2.2, src.w / own.width)));
    rotate.set(src.rot - 14 * Math.sign(d.x || 1));
    if (src.fade) opacity.set(0.2);
    const opts = { duration: CARD_FLIGHT_SECONDS, ease: [0.22, 1, 0.36, 1] as const };
    animate(x, 0, opts);
    animate(y, 0, opts);
    animate(scale, 1, opts);
    animate(rotate, 0, opts);
    if (src.fade) animate(opacity, 1, { duration: CARD_FLIGHT_SECONDS * 0.4 });
  }, []);

  return (
    <motion.div
      ref={ref}
      className={`kt-trick-card ${winning ? "kt-trick-winning" : ""}`}
      style={{ left: `${left}%`, top: `${top}%`, zIndex, x, y, scale, rotate, opacity }}
      exit={{
        x: exitX,
        y: exitY,
        scale: 0.35,
        opacity: 0,
        transition: { duration: 0.4, ease: "easeIn" },
      }}
    >
      <Card card={{ id: play.card.id, suit: play.card.suit, rank: play.card.rank }} size="sm" />
    </motion.div>
  );
}

export default TrickCard187;
