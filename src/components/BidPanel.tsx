import React from 'react';
import { Hand } from 'lucide-react';
import { Bid } from '../types/kout';
import { playTapSound } from '../utils/audio';

export interface BidPanelProps { currentHighBid: Bid | null; isDealerForced?: boolean; maxBid?: number; onBid: (bid: Bid) => void; className?: string }

/** Bid picker drawn inside the table: teal ribbon + 3×2 stone tiles (طاف، 5..9) like the reference. */
export const BidPanel: React.FC<BidPanelProps> = ({ currentHighBid, isDealerForced = false, maxBid = 9, onBid, className = '' }) => {
  const choose = (bid: Bid) => { playTapSound(); onBid(bid); };
  const bids: Bid[] = [5, 6, 7, 8, 9] as Bid[];
  return (
    <div className={`kt-picker ${className}`} role="group" aria-label="المزايدة" dir="ltr">
      <span className="kt-ribbon"><span>اختر طلبتك</span></span>
      <div className="kt-tiles">
        <button
          type="button"
          className="kt-tile kt-tile-pass"
          disabled={isDealerForced}
          aria-label="طاف"
          title={isDealerForced ? 'ملزوم' : 'طاف'}
          onClick={() => choose(0 as Bid)}
        >
          <Hand className="kt-tile-hand" strokeWidth={2.4} />
          {isDealerForced && <small>ملزوم</small>}
        </button>
        {bids.map((bid) => (
          <button
            key={bid}
            type="button"
            className={`kt-tile ${currentHighBid === bid ? 'kt-tile-current' : ''}`}
            disabled={bid > maxBid || bid <= (currentHighBid ?? 0) || (bid === 5 && !isDealerForced)}
            aria-label={`طلب ${bid}`}
            onClick={() => choose(bid)}
          >
            <span>{bid}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
export default BidPanel;
