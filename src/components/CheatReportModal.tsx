/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { ShieldAlert, X } from "lucide-react";
import type { PlayerSlot } from "../types/kout";
import type { ReportedCardType } from "../rules/cheat";
import { Button } from "./ui/button";
import { playTapSound } from "../utils/audio";

const CARD_TYPES: { value: ReportedCardType; label: string; icon: string }[] = [
  { value: "S", label: "سبيت", icon: "♠" },
  { value: "H", label: "هاص", icon: "♥" },
  { value: "D", label: "ديمن", icon: "♦" },
  { value: "C", label: "كلفس", icon: "♣" },
  { value: "JOKER", label: "جوكر أحمر", icon: "🃏" },
  { value: "MAKER", label: "ماكر أسود", icon: "🃏" },
];

export interface CheatReportModalProps {
  players: PlayerSlot[];
  reporterSeat?: number;
  seatsCount: number;
  onClose: () => void;
  onSubmit: (accusedSeat: number, cardType: ReportedCardType) => void;
}

/**
 * نافذة البلاغ عن غش:
 * تظهر فقط اللاعبين الحقيقيين الذين انضموا للغرفة (بدون البوتات وبدون اللاعب نفسه).
 */
export const CheatReportModal: React.FC<CheatReportModalProps> = ({
  players,
  reporterSeat,
  seatsCount,
  onClose,
  onSubmit,
}) => {
  const [accusedSeat, setAccusedSeat] = useState<number | null>(null);
  const [cardType, setCardType] = useState<ReportedCardType | null>(null);

  // إظهار اللاعبين الحقيقيين فقط الذين دخلوا الغرفة
  const eligiblePlayers = (players || []).filter(
    (p) => p.kind !== "AI_BOT" && p.seatIndex !== reporterSeat,
  );

  const canSubmit = accusedSeat !== null && cardType !== null;

  return (
    <div className="absolute inset-0 z-[70] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-sm bg-neutral-950 border-2 border-rose-500/60 rounded-3xl p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-rose-500 to-rose-700 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-sm font-black text-rose-300">إبلاغ عن غش</h2>
          </div>
          <button
            type="button"
            onClick={() => {
              playTapSound();
              onClose();
            }}
            className="w-7 h-7 rounded-full bg-black/60 border border-white/20 flex items-center justify-center cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4 text-white/70" />
          </button>
        </div>

        <p className="text-[11px] text-amber-200/80 font-medium mb-3 leading-relaxed">
          حدد اللاعب الحقيقي ونوع البطاقة التي غش فيها (مثلاً كسر التبعية ونزل ورقة أخرى). إذا ثبت
          الغش يُدبّل الفوز لفريقك، وإذا كان البلاغ خاطئاً تُحتسب النقاط المضاعفة لفريقه.
        </p>

        {/* الخطوة ١: اختيار اللاعب الحقيقي فقط */}
        <span className="text-[10px] text-white/60 font-black block mb-1">
          اللاعب الحقيقي المُبلَّغ عنه
        </span>

        {eligiblePlayers.length === 0 ? (
          <div className="p-3 mb-3 bg-white/5 border border-white/10 rounded-xl text-center text-xs text-white/60 font-bold">
            لا يوجد لاعبون حقيقيون متاحون للإبلاغ عنهم في هذه الغرفة.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mb-3">
            {eligiblePlayers.map((p) => {
              const isSelected = accusedSeat === p.seatIndex;
              return (
                <button
                  key={p.seatIndex}
                  type="button"
                  onClick={() => {
                    playTapSound();
                    setAccusedSeat(p.seatIndex);
                  }}
                  className={`px-2 py-2 rounded-xl text-[11px] font-black border transition-colors cursor-pointer flex flex-col items-center justify-center text-center ${
                    isSelected
                      ? "bg-rose-600 border-rose-300 text-white shadow-md"
                      : "bg-black/60 border-white/15 text-white/80 hover:border-rose-400/60"
                  }`}
                >
                  <span className="truncate w-full">{p.name || `لاعب ${p.seatIndex + 1}`}</span>
                  <span className="text-[9px] opacity-70">فريق {p.team === 0 ? "١" : "٢"}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* الخطوة ٢: نوع البطاقة */}
        <span className="text-[10px] text-white/60 font-black block mb-1">
          نوع البطاقة التي غش فيها
        </span>
        <div className="grid grid-cols-3 gap-1.5 mb-3">
          {CARD_TYPES.map((t) => {
            const isSelected = cardType === t.value;
            const isRed = t.value === "H" || t.value === "D";
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => {
                  playTapSound();
                  setCardType(t.value);
                }}
                className={`px-2 py-1.5 rounded-xl text-[11px] font-black border transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                  isSelected
                    ? "bg-amber-500 border-amber-200 text-black shadow-md"
                    : "bg-black/60 border-white/15 text-white/80 hover:border-amber-400/60"
                }`}
              >
                <span className={isRed ? "text-rose-400" : ""}>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            );
          })}
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
              ? "bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 text-white border-rose-300/40"
              : "bg-black/40 border-white/10 text-white/40 cursor-not-allowed"
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>تأكيد الإبلاغ عن الغش</span>
        </Button>
      </div>
    </div>
  );
};

export default CheatReportModal;
