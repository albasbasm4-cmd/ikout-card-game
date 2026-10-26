/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ShieldAlert, X } from 'lucide-react';
import type { Suit, PlayerSlot } from '../types/kout';
import type { ReportedCardType } from '../rules/cheat';
import { Button } from './ui/button';
import { playTapSound } from '../utils/audio';

const CARD_TYPES: { value: ReportedCardType; label: string; icon: string }[] = [
  { value: 'S', label: 'سبيت', icon: '♠' },
  { value: 'H', label: 'هاص', icon: '♥' },
  { value: 'D', label: 'ديمن', icon: '♦' },
  { value: 'C', label: 'كلفس', icon: '♣' },
  { value: 'JOKER', label: 'جوكر أحمر', icon: '🃏' },
  { value: 'MAKER', label: 'ماكر أسود', icon: '🃏' },
];

export interface CheatReportModalProps {
  players: PlayerSlot[];
  seatsCount: number;
  onClose: () => void;
  onSubmit: (accusedSeat: number, cardType: ReportedCardType) => void;
}

/**
 * نافذة البلاغ عن غش: تُفعَّل فقط في اللعب الجماعي ضد لاعبين بشريين.
 * البلاغ يُحكم فيه بعد التحقق من يده الكاملة وقت اللعب — لا يُحتسب غشاً تلقائياً.
 */
export const CheatReportModal: React.FC<CheatReportModalProps> = ({
  players,
  seatsCount,
  onClose,
  onSubmit,
}) => {
  const [accusedSeat, setAccusedSeat] = useState<number | null>(null);
  const [cardType, setCardType] = useState<ReportedCardType | null>(null);

  const playerName = (seat: number): string =>
    players?.[seat]?.name || `لاعب ${seat + 1}`;

  const canSubmit = accusedSeat !== null && cardType !== null;

  return (
    <div className="absolute inset-0 z-[60] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-sm bg-neutral-950 border-2 border-rose-500/60 rounded-3xl p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-rose-500 to-rose-700 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-sm font-black text-rose-300">البلاغ عن غش</h2>
          </div>
          <button
            type="button"
            onClick={() => {
              playTapSound();
              onClose();
            }}
            className="w-7 h-7 rounded-full bg-black/60 border border-white/20 flex items-center justify-center"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4 text-white/70" />
          </button>
        </div>

        <p className="text-[11px] text-amber-200/70 font-medium mb-3 leading-relaxed">
          اختر اللاعب ونوع الورقة التي كسر فيها التبعية. النظام يفحص يده وقت اللعب ويصدر الحكم —
          البلاغ الكذب يُستهلك من حدّك (٣ بلاغات بالجولة).
        </p>

        {/* الخطوة ١: اختيار اللاعب */}
        <span className="text-[10px] text-white/50 font-black block mb-1">اللاعب المُبلَّغ عنه</span>
        <div className={`grid gap-1.5 mb-3 ${seatsCount === 6 ? 'grid-cols-3' : 'grid-cols-3'}`}>
          {Array.from({ length: seatsCount }, (_, seat) => (
            <button
              key={seat}
              type="button"
              onClick={() => {
                playTapSound();
                setAccusedSeat(seat);
              }}
              className={`px-2 py-1.5 rounded-xl text-[11px] font-black border transition-colors cursor-pointer ${
                accusedSeat === seat
                  ? 'bg-rose-600 border-rose-300 text-white'
                  : 'bg-black/60 border-white/15 text-white/80 hover:border-rose-400/60'
              }`}
            >
              {playerName(seat)}
            </button>
          ))}
        </div>

        {/* الخطوة ٢: نوع الورقة */}
        <span className="text-[10px] text-white/50 font-black block mb-1">نوع الورقة (الذي لم ينزّله رغم توفره)</span>
        <div className="grid grid-cols-3 gap-1.5 mb-3">
          {CARD_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => {
                playTapSound();
                setCardType(t.value);
              }}
              className={`px-2 py-1.5 rounded-xl text-[11px] font-black border transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                cardType === t.value
                  ? 'bg-amber-500 border-amber-200 text-black'
                  : 'bg-black/60 border-white/15 text-white/80 hover:border-amber-400/60'
              }`}
            >
              <span className={t.value === 'H' || t.value === 'D' ? 'text-rose-400' : ''}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        <Button
          type="button"
          disabled={!canSubmit}
          onClick={() => {
            if (!canSubmit) return;
            playTapSound();
            onSubmit(accusedSeat as number, cardType as ReportedCardType);
          }}
          className={`w-full py-2.5 rounded-2xl font-black text-xs border shadow-xl active:scale-98 cursor-pointer flex items-center justify-center gap-2 ${
            canSubmit
              ? 'bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 text-white border-rose-300/40'
              : 'bg-black/40 border-white/10 text-white/40 cursor-not-allowed'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>إرسال البلاغ</span>
        </Button>
      </div>
    </div>
  );
};

export default CheatReportModal;
