import React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { Check, Hand as PassHand } from 'lucide-react';
import { playTapSound } from '../../utils/audio';
import { BID_STEP_187, MAX_BID, snapBid187 } from '../rules';

export interface BidSlider187Props {
  /** Lowest bid allowed right now (75, or the current high bid + 5). */
  min: number;
  value: number;
  onChange: (value: number) => void;
  onConfirm: (value: number) => void;
  onPass: () => void;
}

/**
 * 187 bid picker drawn inside the table: a value box (starts at the lowest
 * allowed bid) with a line under it. Dragging the line to the left raises the
 * bid by 5 each step, up to 185.
 */
export const BidSlider187: React.FC<BidSlider187Props> = ({ min, value, onChange, onConfirm, onPass }) => {
  const canBid = min <= MAX_BID;
  const shown = canBid ? snapBid187(value, min) : MAX_BID;
  return (
    <div className="kt-picker kt187-bid" role="group" aria-label="اختيار القيد" dir="ltr">
      <span className="kt-ribbon"><span>اختر القيد</span></span>
      <div className="kt187-bid-row">
        <button
          type="button"
          className="kt-tile kt187-side-tile"
          aria-label="طاف"
          onClick={() => {
            playTapSound();
            onPass();
          }}
        >
          <PassHand className="kt187-side-icon" strokeWidth={2.4} />
          <small>طاف</small>
        </button>
        <div className="kt187-value" aria-live="polite" aria-label={`القيد ${shown}`}>
          <span key={shown} className="kt187-pop">{canBid ? shown : '—'}</span>
        </div>
        <button
          type="button"
          className="kt-tile kt187-side-tile kt187-ok"
          aria-label={`تأكيد القيد ${shown}`}
          disabled={!canBid}
          onClick={() => {
            playTapSound();
            onConfirm(shown);
          }}
        >
          <Check className="kt187-side-icon" strokeWidth={3} />
          <small>تأكيد</small>
        </button>
      </div>
      <SliderPrimitive.Root
        dir="rtl"
        className="kt187-slider"
        min={Math.min(min, MAX_BID)}
        max={MAX_BID}
        step={BID_STEP_187}
        value={[shown]}
        disabled={!canBid || min >= MAX_BID}
        onValueChange={([v]) => onChange(snapBid187(v, min))}
        aria-label="اسحب لليسار لرفع القيد"
      >
        <SliderPrimitive.Track className="kt187-track">
          <SliderPrimitive.Range className="kt187-range" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="kt187-thumb" aria-label="القيد" />
      </SliderPrimitive.Root>
      <div className="kt187-scale" aria-hidden="true">
        <span>{MAX_BID}</span>
        <em>اسحب الخط لليسار لرفع القيد</em>
        <span>{Math.min(min, MAX_BID)}</span>
      </div>
    </div>
  );
};

export default BidSlider187;
