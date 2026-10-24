import React from 'react';
import { Suit } from '../types/kout';
import { SuitSvg } from './Card';
import { Button } from './ui/button';
export interface TrumpPickerProps { onSelectTrump: (suit: Suit) => void; currentTrump?: Suit | null; className?: string }
export const TrumpPicker: React.FC<TrumpPickerProps> = ({ onSelectTrump, currentTrump, className = '' }) => <div className={`reference-trump-picker relative ${className}`} role="group" aria-label="اختيار الحكم"><span className="reference-picker-ribbon">اختر الحكم</span>{(['H','S','C','D'] as Suit[]).map(suit=><Button key={suit} variant="ghost" aria-label={`اختيار ${suit}`} aria-pressed={suit===currentTrump} onClick={()=>onSelectTrump(suit)}><SuitSvg suit={suit} className="w-10 h-10"/></Button>)}</div>;
export default TrumpPicker;
