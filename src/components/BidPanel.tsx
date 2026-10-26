import React from 'react';
import { Hand } from 'lucide-react';
import { Bid } from '../types/kout';
import { Button } from './ui/button';
import { playTapSound } from '../utils/audio';
export interface BidPanelProps { currentHighBid: Bid | null; isDealerForced?: boolean; maxBid?: number; onBid: (bid: Bid) => void; className?: string }
export const BidPanel: React.FC<BidPanelProps> = ({ currentHighBid, isDealerForced = false, maxBid = 9, onBid, className = '' }) => {
 const choose = (bid: Bid) => { playTapSound(); onBid(bid); };
 return <div className={`reference-bid-wheel ${className}`} role="group" aria-label="المزايدة">
   <span className="reference-picker-ribbon">اختر طلبك</span>
   {([5, 6, 7, 8, 9] as Bid[]).map((bid, i) => <Button key={bid} variant="ghost" disabled={bid > maxBid || bid <= (currentHighBid ?? 0) || (bid === 5 && !isDealerForced)} aria-label={`طلب ${bid}`} onClick={()=>choose(bid)} className={`bid-wedge wedge-${i}`}><span>{bid}</span></Button>)}
   <Button variant="ghost" disabled={isDealerForced} aria-label="طاف" title={isDealerForced ? 'ملزوم' : 'طاف'} onClick={()=>choose(0)} className="bid-pass"><Hand/><span>{isDealerForced ? 'ملزوم' : 'طاف'}</span></Button>
 </div>;
};
export default BidPanel;
