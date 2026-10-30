import { useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { Card } from "@/lib/uno/engine";
import { UnoCard } from "./UnoCard";
import { CARD_FLIGHT_SECONDS, screenDeltaToLocal } from "@/utils/cardFlight";

export function UnoHand({
  cards,
  width,
  cardWidth,
  isLegal,
  onPlay,
  enabled,
}: {
  cards: Card[];
  width: number;
  cardWidth: number;
  isLegal: (card: Card) => boolean;
  onPlay: (id: string) => void;
  enabled: boolean;
}) {
  const reduced = useReducedMotion();
  const [selected, setSelected] = useState<string | null>(null);
  const [offset, setOffset] = useState<{ id: string; x: number; y: number } | null>(null);
  const drag = useRef<{ id: string; x: number; y: number; pointer: number; moved: boolean } | null>(
    null,
  );
  const suppressClick = useRef(false);
  const tap = (id: string) => {
    if (selected === id) {
      onPlay(id);
      setSelected(null);
    } else setSelected(id);
  };
  const step =
    cards.length > 1
      ? Math.max(1, Math.min(cardWidth * 0.72, (width - cardWidth) / (cards.length - 1)))
      : 0;
  return (
    <div
      className="uno-hand absolute bottom-2 left-1/2 z-30 flex -translate-x-1/2 items-end"
      dir="ltr"
      style={{
        width: cardWidth + step * Math.max(0, cards.length - 1),
        height: cardWidth * 1.5 + 20,
      }}
    >
      {cards.map((card, i) => {
        const active = offset?.id === card.id;
        const legal = enabled && isLegal(card);
        return (
          <div
            key={card.id}
            className="uno-hand-slot"
            style={{
              width: cardWidth,
              left: i * step,
              zIndex: active || selected === card.id ? cards.length + 1 : i,
            }}
            onPointerDown={(e) => {
              if (!enabled || (e.pointerType === "mouse" && e.button !== 0)) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = {
                id: card.id,
                x: e.clientX,
                y: e.clientY,
                pointer: e.pointerId,
                moved: false,
              };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d || d.id !== card.id || d.pointer !== e.pointerId) return;
              const dx = e.clientX - d.x,
                dy = e.clientY - d.y;
              if (!d.moved && Math.hypot(dx, dy) < 8) return;
              d.moved = true;
              const local = screenDeltaToLocal(e.currentTarget, dx, dy);
              setOffset({ id: card.id, x: local.x, y: local.y });
            }}
            onPointerCancel={() => {
              drag.current = null;
              setOffset(null);
            }}
            onPointerUp={(e) => {
              const d = drag.current;
              if (!d || d.id !== card.id) return;
              if (d.moved) {
                suppressClick.current = true;
                const local = screenDeltaToLocal(e.currentTarget, e.clientX - d.x, e.clientY - d.y);
                if (legal && local.y < -40) {
                  onPlay(card.id);
                  setSelected(null);
                }
                setTimeout(() => {
                  suppressClick.current = false;
                }, 0);
              } else {
                suppressClick.current = true;
                tap(card.id);
                setTimeout(() => {
                  suppressClick.current = false;
                }, 0);
              }
              drag.current = null;
              setOffset(null);
            }}
          >
            <motion.div
              animate={{
                x: active ? offset.x : 0,
                y: active ? offset.y : selected === card.id ? -24 : legal ? -8 : 0,
              }}
              transition={{ duration: active || reduced ? 0 : 0.2 }}
            >
              <UnoCard
                card={card}
                disabled={!enabled}
                highlight={legal}
                style={{ width: cardWidth }}
                onClick={() => {
                  if (suppressClick.current) return;
                  tap(card.id);
                }}
              />
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}
