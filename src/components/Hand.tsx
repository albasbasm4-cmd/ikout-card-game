/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useReducedMotion } from 'motion/react';
import { Card as CardType, Suit } from '../types/kout';
import { Card } from './Card';
import { playTapSound } from '../utils/audio';
import { commitsCardDrag } from '../utils/gamePresentation';
import { registerCardLaunch, screenDeltaToLocal } from '../utils/cardFlight';

export interface HandProps {
  cards: CardType[];
  trump?: Suit | null;
  legalCardIds?: Set<string> | string[];
  selectedCardId?: string | null;
  onPlayCard?: (card: CardType) => void;
  onSelectCard?: (card: CardType) => void;
  isMyTurn?: boolean;
  className?: string;
  cardSize?: 'sm' | 'md' | 'lg';
  autoSort?: boolean;
  /** Maximum horizontal distance between neighbouring cards (keeps the fan tight like the reference). */
  cardStep?: number;
}

interface DragState {
  id: string;
  pointerId: number;
  sx: number;
  sy: number;
  active: boolean;
  card: CardType;
  isLegal: boolean;
  wrapper: HTMLElement;
}

export const Hand: React.FC<HandProps> = ({
  cards,
  trump: _trump,
  legalCardIds,
  selectedCardId: controlledSelectedId,
  onPlayCard,
  onSelectCard,
  isMyTurn = true,
  className = '',
  cardSize = 'md',
  autoSort = true,
  cardStep,
}) => {
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const [shakingCardId, setShakingCardId] = useState<string | null>(null);
  const [warningTip, setWarningTip] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const [launchedId, setLaunchedId] = useState<string | null>(null);
  const [fanWidth, setFanWidth] = useState(600);
  const [measuredCardWidth, setMeasuredCardWidth] = useState(76);
  const container = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const innerRefs = useRef(new Map<string, HTMLDivElement>());
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => {
      setFanWidth(element.clientWidth - 24);
      const card = element.querySelector<HTMLElement>('.playing-card');
      if (card) setMeasuredCardWidth(card.offsetWidth);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [cards.length]);

  // A launched card stays hidden until the engine removes it from the hand.
  useEffect(() => {
    if (!launchedId) return;
    if (!cards.some((c) => c.id === launchedId)) {
      setLaunchedId(null);
      return;
    }
    const t = setTimeout(() => setLaunchedId(null), 2600);
    return () => clearTimeout(t);
  }, [cards, launchedId]);

  // Display order like the reference: spades, hearts, clubs, diamonds (rank descending), jokers last
  const displayCards = useMemo(() => {
    if (autoSort === false) return cards;
    const suitOrder: Record<string, number> = { S: 0, H: 1, C: 2, D: 3 };
    return [...cards].sort((a, b) => {
      if (a.joker && !b.joker) return 1;
      if (!a.joker && b.joker) return -1;
      if (a.joker && b.joker) return a.joker === 'RED' ? -1 : 1;
      const sa = a.suit ? suitOrder[a.suit] : 9;
      const sb = b.suit ? suitOrder[b.suit] : 9;
      if (sa !== sb) return sa - sb;
      return (b.rank ?? 0) - (a.rank ?? 0);
    });
  }, [cards, autoSort]);

  const selectedId = controlledSelectedId !== undefined ? controlledSelectedId : internalSelectedId;

  const legalSet = React.useMemo(() => {
    if (!legalCardIds) return null;
    if (legalCardIds instanceof Set) return legalCardIds;
    return new Set(legalCardIds);
  }, [legalCardIds]);

  const count = displayCards.length;
  if (count === 0) {
    return (
      <div className={`flex items-center justify-center p-3 text-xs text-muted-foreground ${className}`}>
        لا توجد أوراق في اليد
      </div>
    );
  }

  // Fan geometry like the reference: gentle arc, tight overlap
  const fanStep = count > 1 ? Math.min(2.6, 22 / (count - 1)) : 0;
  const horizontalOverlap =
    count > 1
      ? Math.min(
          -20,
          (fanWidth - count * measuredCardWidth) / (count - 1),
          cardStep !== undefined ? cardStep - measuredCardWidth : Number.POSITIVE_INFINITY,
        )
      : 0;

  const launch = (card: CardType) => {
    const inner = innerRefs.current.get(card.id);
    if (inner) registerCardLaunch(card.id, inner, 0);
    setLaunchedId(card.id);
  };

  const handleCardClick = (card: CardType, commit = false) => {
    const isLegal = legalSet ? legalSet.has(card.id) && isMyTurn : isMyTurn;

    if (!isMyTurn) {
      setWarningTip('ليس دورك الآن!');
      setTimeout(() => setWarningTip(null), 1200);
      return;
    }

    if (!isLegal) {
      setShakingCardId(card.id);
      setWarningTip('يجب عليك اتباع لون اللعب!');
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
      launch(card);
      onPlayCard(card);
    }
    onSelectCard?.(card);
    setInternalSelectedId(null);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>, card: CardType, isLegal: boolean) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (launchedId === card.id) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: card.id, pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, active: false, card, isLegal, wrapper: e.currentTarget };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.active) {
      if (Math.hypot(dx, dy) < 8) return;
      d.active = true;
      setDraggingId(d.id);
    }
    // Follow the finger exactly, whatever the stage scale/rotation and fan angle are.
    const local = screenDeltaToLocal(d.wrapper, dx, dy);
    setDragPos({ id: d.id, x: local.x, y: local.y });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    if (!d.active) {
      handleCardClick(d.card);
      return;
    }
    setDraggingId(null);
    const moved = screenDeltaToLocal(container.current, e.clientX - d.sx, e.clientY - d.sy);
    if (commitsCardDrag(moved.y, d.isLegal, isMyTurn)) {
      handleCardClick(d.card, true);
      setDragPos(null);
    } else {
      if (moved.y <= -90) handleCardClick(d.card, true); // explains why (not your turn / must follow suit)
      setDragPos(null);
    }
  };

  const onPointerCancel = () => {
    drag.current = null;
    setDraggingId(null);
    setDragPos(null);
  };

  return (
    <div
      ref={container}
      dir="ltr"
      className={`relative w-full flex flex-col items-center justify-center pt-3 pb-2 px-1 select-none overflow-visible ${className}`}
    >
      {warningTip && (
        <div className="hand-warning" role="status">
          {warningTip}
        </div>
      )}

      <div className="relative flex items-end justify-center hand-fan-height">
        {displayCards.map((card, index) => {
          const isLegal = legalSet ? legalSet.has(card.id) && isMyTurn : isMyTurn;
          const isSelected = selectedId === card.id;
          const isShaking = shakingCardId === card.id;
          const isDragging = draggingId === card.id;
          const isLaunched = launchedId === card.id;

          const normalizedIdx = index - (count - 1) / 2;
          const rotateDeg = normalizedIdx * fanStep;
          const translateY = normalizedIdx * normalizedIdx * 1.9;
          const pos = dragPos?.id === card.id ? dragPos : null;

          return (
            <div
              key={card.id}
              role="button"
              tabIndex={0}
              aria-label={`ورقة ${index + 1}`}
              onPointerDown={(e) => onPointerDown(e, card, isLegal)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleCardClick(card);
                }
              }}
              style={{
                marginLeft: index === 0 ? 0 : `${horizontalOverlap}px`,
                transform: isSelected
                  ? `translateY(-18px) rotate(0deg)`
                  : `rotate(${rotateDeg}deg) translateY(${translateY}px)`,
                zIndex: isDragging ? 70 : isSelected ? 40 : index + 10,
                animationDelay: `${index * 45}ms`,
                transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), margin 0.2s ease-out',
                touchAction: 'none',
                visibility: isLaunched ? 'hidden' : undefined,
              }}
              className={`hand-card-slot origin-bottom will-change-transform outline-none ${reducedMotion ? '' : 'animate-deal-card'} ${isShaking ? 'animate-card-shake' : ''}`}
            >
              <div
                ref={(el) => {
                  if (el) innerRefs.current.set(card.id, el);
                  else innerRefs.current.delete(card.id);
                }}
                style={{
                  transform: pos
                    ? `translate(${pos.x}px, ${pos.y}px) rotate(${isSelected ? 0 : -rotateDeg}deg) scale(1.06)`
                    : 'none',
                  transition: isDragging ? 'none' : 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                  cursor: isMyTurn && isLegal ? 'grab' : 'default',
                }}
              >
                <Card card={card} faceUp={true} isLegal={!isMyTurn || isLegal} isSelected={isSelected} size={cardSize} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Hand;
