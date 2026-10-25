/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Card as CardType, Suit } from "../types/kout";
import { Card } from "./Card";
import { playTapSound } from "../utils/audio";
import { sortHandCards } from "../rules/cards";
import { commitsCardDrag } from "../utils/gamePresentation";

export interface HandProps {
  cards: CardType[];
  trump?: Suit | null;
  legalCardIds?: Set<string> | string[];
  selectedCardId?: string | null;
  onPlayCard?: (card: CardType) => void;
  onSelectCard?: (card: CardType) => void;
  isMyTurn?: boolean;
  className?: string;
  cardSize?: "sm" | "md" | "lg";
  autoSort?: boolean;
}

export const Hand: React.FC<HandProps> = ({
  cards,
  trump,
  legalCardIds,
  selectedCardId: controlledSelectedId,
  onPlayCard,
  onSelectCard,
  isMyTurn = true,
  className = "",
  cardSize = "md",
  autoSort = true,
}) => {
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const [shakingCardId, setShakingCardId] = useState<string | null>(null);
  const [warningTip, setWarningTip] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [fanWidth, setFanWidth] = useState(600);
  const [measuredCardWidth, setMeasuredCardWidth] = useState(76);
  const container = useRef<HTMLDivElement>(null);
  const ignoreClickUntil = useRef(0);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => {
      setFanWidth(element.clientWidth - 24);
      const card = element.querySelector<HTMLElement>(".playing-card");
      if (card) setMeasuredCardWidth(card.offsetWidth);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [cards.length]);

  // Auto-sort player cards: Jokers first, then grouped by suit (trump first) and rank descending
  const displayCards = useMemo(() => {
    if (autoSort === false) return cards;
    return sortHandCards(cards, trump);
  }, [cards, trump, autoSort]);

  const selectedId = controlledSelectedId !== undefined ? controlledSelectedId : internalSelectedId;

  // Pre-calculate set of legal card IDs
  const legalSet = React.useMemo(() => {
    if (!legalCardIds) return null;
    if (legalCardIds instanceof Set) return legalCardIds;
    return new Set(legalCardIds);
  }, [legalCardIds]);

  const count = displayCards.length;
  if (count === 0) {
    return (
      <div
        className={`flex items-center justify-center p-3 text-xs text-muted-foreground ${className}`}
      >
        لا توجد أوراق في اليد
      </div>
    );
  }

  // Calculate fan angle and horizontal overlap based on card count
  const maxAngleSpread = Math.min(14, count * 1.6);
  const angleStep = count > 1 ? (maxAngleSpread * 2) / (count - 1) : 0;
  const step = Math.max(0, (fanWidth - measuredCardWidth) / Math.max(1, count - 1));
  const overlap = Math.min(
    measuredCardWidth * 0.45, // أقصى تغطية للبطاقة 45% بحيث تبقى 55% على الأقل ظاهرة
    Math.max(0, measuredCardWidth - step),
  );
  const horizontalOverlap = count > 1 ? -overlap : 0;

  const handleCardClick = (card: CardType, commit = false) => {
    const isLegal = legalSet ? legalSet.has(card.id) && isMyTurn : isMyTurn;

    if (!isMyTurn) {
      setWarningTip("ليس دورك الآن!");
      setTimeout(() => setWarningTip(null), 1200);
      return;
    }

    if (!isLegal) {
      setShakingCardId(card.id);
      setWarningTip("يجب عليك اتباع لون اللعب!");
      playTapSound();
      setTimeout(() => setShakingCardId(null), 400);
      setTimeout(() => setWarningTip(null), 1400);
      return;
    }

    if (!commit && selectedId !== card.id) {
      setInternalSelectedId(card.id);
      onSelectCard?.(card);
      return;
    }
    // A second tap or a committed upward drag plays the selected card.
    if (onPlayCard) {
      onPlayCard(card);
    }
    if (onSelectCard) {
      onSelectCard(card);
    }
    setInternalSelectedId(card.id);
  };

  return (
    <div
      ref={container}
      dir="ltr"
      className={`relative w-full flex flex-col items-center justify-center pt-3 pb-2 px-1 select-none overflow-visible ${className}`}
    >
      {/* Floating Warning Tip */}
      {warningTip && (
        <div className="hand-warning" role="status">
          {warningTip}
        </div>
      )}

      {/* Fan Area */}
      <div className="relative flex items-end justify-center hand-fan-height">
        {displayCards.map((card, index) => {
          const isLegal = legalSet ? legalSet.has(card.id) && isMyTurn : isMyTurn;
          const isSelected = selectedId === card.id;
          const isShaking = shakingCardId === card.id;

          // Natural parabolic fan geometry
          const normalizedIdx = index - (count - 1) / 2;
          const rotateDeg = normalizedIdx * (angleStep * 0.65);
          const translateY = Math.abs(normalizedIdx) * 2.0;

          return (
            <div
              key={card.id}
              style={{
                marginLeft: index === 0 ? 0 : `${horizontalOverlap}px`,
                transform: isSelected
                  ? `translateY(-30px) rotate(0deg) scale(1.1)`
                  : `rotate(${rotateDeg}deg) translateY(${translateY}px)`,
                zIndex: draggingId === card.id ? 70 : isSelected ? 40 : index + 10,
                transition: "transform 0.22s cubic-bezier(0.16,1,0.3,1), margin 0.2s ease-out",
              }}
              className={`origin-bottom will-change-transform ${reducedMotion ? "" : "animate-deal-card"} ${isShaking ? "animate-card-shake" : ""}`}
            >
              <motion.div
                drag
                dragSnapToOrigin
                dragElastic={0.16}
                dragTransition={{ bounceStiffness: 460, bounceDamping: 24 }}
                whileDrag={{
                  scale: 1.14,
                  rotateZ: -rotateDeg,
                  rotateY: Math.max(-14, Math.min(14, 0)),
                  rotateX: 8,
                  y: -34,
                  zIndex: 60,
                  transition: { type: "spring", stiffness: 500, damping: 28 },
                }}
                onDragStart={() => {
                  setDraggingId(card.id);
                  ignoreClickUntil.current = Date.now() + 60000;
                }}
                onDragEnd={(_, info) => {
                  setDraggingId(null);
                  ignoreClickUntil.current = Date.now() + 250;
                  if (commitsCardDrag(info.offset.y, isLegal, isMyTurn))
                    handleCardClick(card, true);
                }}
                style={{ touchAction: "none", perspective: 800, transformStyle: "preserve-3d" }}
              >
                <Card
                  card={card}
                  faceUp
                  isLegal={isLegal}
                  isSelected={isSelected}
                  size={cardSize}
                  onClick={() => {
                    if (Date.now() >= ignoreClickUntil.current) handleCardClick(card);
                  }}
                />
              </motion.div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Hand;
