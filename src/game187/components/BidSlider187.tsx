import React from 'react';
import { screenDeltaToLocal } from '../../utils/cardFlight';
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
      <BidTrack187
        min={Math.min(min, MAX_BID)}
        value={shown}
        disabled={!canBid || min >= MAX_BID}
        onChange={(v) => onChange(snapBid187(v, min))}
      />
      <div className="kt187-scale" aria-hidden="true">
        <span>{MAX_BID}</span>
        <em>اسحب الخط لليسار لرفع القيد</em>
        <span>{Math.min(min, MAX_BID)}</span>
      </div>
    </div>
  );
};

/**
 * Pointer-driven track that converts the finger position into the stage's
 * local frame, so dragging stays smooth even when the stage is scaled or
 * rotated (portrait phones). Left = higher bid.
 */
function BidTrack187({ min, value, disabled, onChange }: { min: number; value: number; disabled: boolean; onChange: (v: number) => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const span = Math.max(1, MAX_BID - min);
  const fraction = (MAX_BID - value) / span; // 0 = left (185), 1 = right (min)
  const update = (clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const local = screenDeltaToLocal(el, clientX - (r.left + r.width / 2), clientY - (r.top + r.height / 2));
    const f = Math.min(1, Math.max(0, 0.5 + local.x / el.offsetWidth));
    const raw = MAX_BID - f * span;
    onChange(Math.round(raw / BID_STEP_187) * BID_STEP_187);
  };
  return (
    <div
      ref={ref}
      className="kt187-slider"
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="اسحب لليسار لرفع القيد"
      aria-valuemin={min}
      aria-valuemax={MAX_BID}
      aria-valuenow={value}
      aria-disabled={disabled}
      onPointerDown={(e) => {
        if (disabled) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (disabled || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
        update(e.clientX, e.clientY);
      }}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); onChange(Math.min(MAX_BID, value + BID_STEP_187)); }
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); onChange(Math.max(min, value - BID_STEP_187)); }
      }}
    >
      <div className="kt187-track">
        <div className="kt187-range" style={{ left: `${fraction * 100}%`, right: 0 }} />
      </div>
      <span className="kt187-thumb" style={{ left: `${fraction * 100}%` }} />
    </div>
  );
}

export default BidSlider187;
