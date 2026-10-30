import React from "react";
import { Suit } from "../types/kout";
import { SuitSvg } from "./Card";
import { playTapSound } from "../utils/audio";

export interface TrumpPickerProps {
  onSelectTrump: (suit: Suit) => void;
  currentTrump?: Suit | null;
  className?: string;
}

/** Trump picker drawn inside the table with the same ribbon + stone tiles as the bid picker. */
export const TrumpPicker: React.FC<TrumpPickerProps> = ({
  onSelectTrump,
  currentTrump,
  className = "",
}) => (
  <div
    className={`kt-picker kt-picker-trump ${className}`}
    role="group"
    aria-label="اختيار الحكم"
    dir="ltr"
  >
    <span className="kt-ribbon">
      <span>اختر الحكم</span>
    </span>
    <div className="kt-tiles kt-tiles-4">
      {(["S", "H", "C", "D"] as Suit[]).map((suit) => (
        <button
          key={suit}
          type="button"
          className="kt-tile kt-tile-suit"
          aria-label={`اختيار ${suit}`}
          aria-pressed={suit === currentTrump}
          onClick={() => {
            playTapSound();
            onSelectTrump(suit);
          }}
        >
          <SuitSvg suit={suit} className="kt-tile-suit-icon" />
        </button>
      ))}
    </div>
  </div>
);
export default TrumpPicker;
