import React from "react";
import { Hand } from "lucide-react";
import { Bid } from "../types/kout";
import { playTapSound } from "../utils/audio";
import { Button } from "./ui/button";

export interface BidPanelProps {
  currentHighBid: Bid | null;
  isDealerForced?: boolean;
  maxBid?: number;
  onBid: (bid: Bid) => void;
  className?: string;
}

/** Voluntary bids start at six; the pass tile becomes mandatory five only for the final forced dealer. */
export const BidPanel: React.FC<BidPanelProps> = ({
  currentHighBid,
  isDealerForced = false,
  maxBid = 9,
  onBid,
  className = "",
}) => {
  const choose = (bid: Bid) => {
    playTapSound();
    onBid(bid);
  };
  const bids: Bid[] = [6, 7, 8, 9];
  return (
    <div className={`kt-picker ${className}`} role="group" aria-label="المزايدة" dir="ltr">
      <span className="kt-ribbon">
        <span>اختر طلبتك</span>
      </span>
      <div className="kt-tiles">
        <Button
          type="button"
          className="kt-tile kt-tile-pass"
          aria-label={isDealerForced ? "ملزوم 5" : "طاف"}
          title={isDealerForced ? "ملزوم" : "طاف"}
          onClick={() => choose(isDealerForced ? 5 : 0)}
        >
          {isDealerForced ? <span>5</span> : <Hand className="kt-tile-hand" strokeWidth={2.4} />}
          {isDealerForced && <small>ملزوم</small>}
        </Button>
        {bids.map((bid) => (
          <Button
            key={bid}
            type="button"
            className={`kt-tile ${currentHighBid === bid ? "kt-tile-current" : ""}`}
            disabled={bid > maxBid || bid <= (currentHighBid ?? 0)}
            aria-label={`طلب ${bid}`}
            onClick={() => choose(bid)}
          >
            <span>{bid}</span>
          </Button>
        ))}
        <span className="kt-bid-spacer" aria-hidden="true" />
      </div>
    </div>
  );
};
export default BidPanel;
