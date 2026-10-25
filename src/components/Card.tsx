import React from "react";
import { Card as CardType, Suit } from "../types/kout";
import { Button } from "./ui/button";

const assets = import.meta.glob<{ url: string }>("../assets/cards/*.asset.json", {
  eager: true,
  import: "default",
});
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
  return <span className={`${className} ${isRed ? "text-card-red" : "text-card-ink"}`}>★</span>;
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
            : String(rank);
  const name = card.joker
    ? `${card.joker.toLowerCase()}_joker`
    : card.suit && rank
      ? `${rankName}_of_${suitNames[card.suit]}`
      : "";
  const asset = assets[`../assets/cards/${name}.png.asset.json`];
  const label = card.joker
    ? card.joker === "RED"
      ? "الجيكر"
      : "الميكر"
    : `${rankName} ${card.suit ? SUIT_COLORS[card.suit].name : ""}`;
  const rankLabel =
    rank === 14
      ? "A"
      : rank === 13
        ? "K"
        : rank === 12
          ? "Q"
          : rank === 11
            ? "J"
            : String(rank ?? "");
  const content = !faceUp ? (
    <div className="card-back-pattern" />
  ) : card.joker ? (
    <div className={`reference-joker ${card.joker === "RED" ? "text-card-red" : "text-card-ink"}`}>
      <span>JOKER</span>
      <svg viewBox="0 0 100 100" aria-label={label}>
        <path
          fill="currentColor"
          d="M50 0 56 22 68 5 68 27 85 15 77 36 98 32 82 48 100 55 78 61 92 78 70 73 73 95 57 79 50 100 43 79 27 95 30 73 8 78 22 61 0 55 18 48 2 32 23 36 15 15 32 27 32 5 44 22Z"
        />
        <path fill="var(--card-paper)" d="M32 38h9v25h-9zm17 0h9v25h-9zm17 0h9v25h-9z" />
      </svg>
    </div>
  ) : rank && rank >= 11 && rank <= 13 && asset ? (
    <img src={asset.url} alt={label} draggable={false} className="h-full w-full" />
  ) : card.suit ? (
    <div className={`reference-card-face ${SUIT_COLORS[card.suit].text}`}>
      <div className="reference-card-corner">
        <strong>{rankLabel}</strong>
        <SuitSvg suit={card.suit} />
      </div>
      <SuitSvg suit={card.suit} className="reference-card-pip" />
    </div>
  ) : (
    <span>{label}</span>
  );
  const classes = `playing-card playing-card-${size} ${!faceUp ? "playing-card-back" : ""} ${!isLegal ? "card-unavailable" : ""} ${isSelected ? "card-selected" : ""} ${className}`;
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
