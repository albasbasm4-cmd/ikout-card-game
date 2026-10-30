/**
 * Presentation-only bridge between the hand and the table: when the local
 * player commits a card (tap or drag), the hand records where that card was on
 * screen so the table can fly it from exactly that spot to its trick slot.
 * Nothing here affects game rules or engine timing.
 */

export interface CardLaunch {
  /** Screen-space rect of the card at the moment it was committed. */
  rect: { left: number; top: number; width: number; height: number };
  /** Visual rotation (deg) of the card at launch. */
  rotate: number;
  at: number;
}

const launches = new Map<string, CardLaunch>();
const MAX_AGE_MS = 4000;

export function registerCardLaunch(cardId: string, el: Element, rotate = 0): void {
  const r = el.getBoundingClientRect();
  launches.set(cardId, {
    rect: { left: r.left, top: r.top, width: r.width, height: r.height },
    rotate,
    at: Date.now(),
  });
}

/** Read (without consuming, so StrictMode re-runs see the same value) a recent launch. */
export function peekCardLaunch(cardId: string): CardLaunch | undefined {
  const now = Date.now();
  for (const [id, l] of launches) if (now - l.at > MAX_AGE_MS) launches.delete(id);
  return launches.get(cardId);
}

/**
 * Linear (rotation + scale, no translation) screen transform of an element,
 * accumulated over all transformed ancestors. Used to convert screen-space
 * pointer/flight deltas into the element's local coordinates, so dragging and
 * flights stay correct inside the scaled / rotated game stage.
 */
export function linearToScreen(el: Element | null): DOMMatrix {
  let m = new DOMMatrix();
  for (let n: Element | null = el; n instanceof HTMLElement; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (cs.transform && cs.transform !== "none") {
      const d = new DOMMatrix(cs.transform);
      d.e = 0;
      d.f = 0;
      m = d.multiply(m);
    }
    // Tailwind v4 / CSS individual transform properties
    if (cs.scale && cs.scale !== "none") {
      const [sx, sy] = cs.scale.split(" ").map(Number);
      m = new DOMMatrix().scale(sx || 1, sy ?? sx ?? 1).multiply(m);
    }
    if (cs.rotate && cs.rotate !== "none") {
      const deg = parseFloat(cs.rotate);
      if (!Number.isNaN(deg)) m = new DOMMatrix().rotate(deg).multiply(m);
    }
  }
  return m;
}

/** Convert a screen-space delta to the local coordinate frame of `el`. */
export function screenDeltaToLocal(
  el: Element | null,
  dx: number,
  dy: number,
): { x: number; y: number } {
  const inv = linearToScreen(el).inverse();
  const p = inv.transformPoint(new DOMPoint(dx, dy));
  return { x: p.x, y: p.y };
}

/** Duration (seconds) of a card flying from a hand/avatar to the table. */
export const CARD_FLIGHT_SECONDS = 0.8;
