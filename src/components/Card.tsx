import React from "react";
import { Card as CardType, Suit } from "../types/kout";
import { Button } from "./ui/button";

const suitNames: Record<Suit, string> = { S: "spades", H: "hearts", C: "clubs", D: "diamonds" };
export const SUIT_COLORS: Record<Suit, { text: string; fill: string; name: string }> = {
  S: { text: "text-card-ink", fill: "var(--card-ink)", name: "سبيت" },
  H: { text: "text-card-red", fill: "var(--card-red)", name: "هاص" },
  C: { text: "text-card-ink", fill: "var(--card-ink)", name: "كلفس" },
  D: { text: "text-card-red", fill: "var(--card-red)", name: "ديمن" },
};

export interface CardProps {
  card: CardType;
  faceUp?: boolean;
  isLegal?: boolean;
  isSelected?: boolean;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export function SuitSvg({ suit, className = "w-4 h-4" }: { suit: Suit; className?: string }) {
  const paths: Record<Suit, string> = {
    H: "M12 21C10 19 2 13 2 7a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 6-8 12-10 14Z",
    D: "M12 1 23 12 12 23 1 12Z",
    C: "M12 2a5 5 0 0 1 4 8 5 5 0 1 1-3 8l2 5H9l2-5a5 5 0 1 1-3-8 5 5 0 0 1 4-8Z",
    S: "M12 1C9 5 2 9 2 14a5 5 0 0 0 9 3l-2 6h6l-2-6a5 5 0 0 0 9-3C22 9 15 5 12 1Z",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={SUIT_COLORS[suit].fill}
      aria-label={SUIT_COLORS[suit].name}
    >
      <path d={paths[suit]} />
    </svg>
  );
}

export function JokerSvg({ isRed, className }: { isRed: boolean; className?: string }) {
  return <span className={className + " " + (isRed ? "text-card-red" : "text-card-ink")}>★</span>;
}

export function getAuthenticCardImage(card: CardType): string {
  if (card.joker === "RED") {
    return "/assets/ikout/cards/authentic/1-4.png";
  }
  if (card.joker === "BLACK") {
    return "/assets/ikout/cards/authentic/0-4.png";
  }
  if (card.rank && card.suit) {
    const rankIndex = card.rank - 2;
    const suitMap: Record<Suit, number> = { H: 0, C: 1, D: 2, S: 3 };
    const suitIndex = suitMap[card.suit];
    if (rankIndex >= 0 && rankIndex <= 12 && suitIndex !== undefined) {
      return "/assets/ikout/cards/authentic/" + rankIndex + "-" + suitIndex + ".png";
    }
  }
  return "";
}

export const Card: React.FC<CardProps> = ({
  card,
  faceUp = true,
  isLegal = true,
  isSelected = false,
  size = "md",
  onClick,
  className = "",
  style,
}) => {
  const rank = card.rank;
  const rankName =
    rank === 14
      ? "ace"
      : rank === 13
        ? "king"
        : rank === 12
          ? "queen"
          : rank === 11
            ? "jack"
            : String(rank ?? "");

  const label = card.joker
    ? card.joker === "RED"
      ? "الجيكر الأحمر"
      : "الميكر الأسود"
    : rankName + " " + (card.suit ? SUIT_COLORS[card.suit].name : "");

  const authenticSrc = faceUp ? getAuthenticCardImage(card) : "";

  const content = !faceUp ? (
    <img
      src="/assets/ikout/cards/authentic-back.png"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).src = "/assets/ikout/images/card_back.png";
      }}
      alt="ظهر الورقة"
      draggable={false}
      className="h-full w-full object-cover rounded-[inherit] pointer-events-none select-none shadow-sm"
    />
  ) : authenticSrc ? (
    <img
      src={authenticSrc}
      alt={label}
      draggable={false}
      className="h-full w-full object-fill rounded-[inherit] pointer-events-none select-none drop-shadow-sm"
    />
  ) : (
    <div className="reference-card-face">
      <span>{label}</span>
    </div>
  );

  const classes = [
    "playing-card",
    "playing-card-" + size,
    !faceUp ? "playing-card-back" : "",
    !isLegal ? "card-unavailable" : "",
    isSelected ? "card-selected" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return onClick ? (
    <Button
      variant="ghost"
      onClick={onClick}
      aria-label={label}
      aria-disabled={!isLegal}
      style={style}
      className={classes}
    >
      {content}
    </Button>
  ) : (
    <div style={style} className={classes}>
      {content}
    </div>
  );
};

export default Card;
