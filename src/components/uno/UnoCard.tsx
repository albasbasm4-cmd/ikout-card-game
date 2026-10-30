import type React from "react";
import back from "@/assets/uno-back.jpg.asset.json";
import { cardImageKey, describe, type Card } from "@/lib/uno/engine";
import { UNO_FACES } from "./faces";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function UnoCard({
  card,
  className,
  faceDown,
  onClick,
  disabled,
  highlight,
  style,
}: {
  card?: Card;
  className?: string;
  style?: React.CSSProperties;
  faceDown?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  highlight?: boolean;
}) {
  const label = faceDown || !card ? "بطاقة مقلوبة" : describe(card);
  const src = faceDown || !card ? back.url : UNO_FACES[cardImageKey(card)];
  const content = <img src={src} alt="" draggable={false} className="h-full w-full object-fill" />;
  const classes = cn(
    "uno-card relative block aspect-[2/3] shrink-0 overflow-hidden bg-card shadow-card transition-transform",
    highlight && "ring-2 ring-accent -translate-y-2",
    className,
  );
  return onClick ? (
    <Button
      variant="ghost"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={classes}
      style={style}
    >
      {content}
    </Button>
  ) : (
    <div aria-label={label} className={classes} style={style}>
      {content}
    </div>
  );
}
