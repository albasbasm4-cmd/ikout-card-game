/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Play, RotateCcw, Users, Gauge, Wifi, QrCode, ChevronRight, X, Bot } from 'lucide-react';
import { RoomConfig, createDefaultPlayers } from '../store/useRoom';
import { hasSavedGame, loadSavedGameState } from '../utils/persist';
import { loadProfile } from '../utils/profile';
import { QrModal } from './QrModal';
import { JoinScreen } from './JoinScreen';
import { generateRoomCode } from '../network/localIp';
import { playTapSound } from '../utils/audio';
import type { GameState } from '../types/kout';

export interface SetupScreenProps {
  onBack: () => void;
  onStartGame: (config: RoomConfig) => void;
  onResumeGame: (state: GameState) => void;
  className?: string;
}

const TARGETS = [51, 71, 101] as const;

/**
 * Second screen (after pressing ترب on the home menu): resume a saved game,
 * start a new one, pick the player count and the score limit (القيد), and add
 * real players over a hotspot room (QR code as host / join by code).
 */
export const SetupScreen: React.FC<SetupScreenProps> = ({ onBack, onStartGame, onResumeGame, className = '' }) => {
  const [variant, setVariant] = useState<'BO6' | 'BO4'>('BO6');
  const [targetScore, setTargetScore] = useState<number>(51);
  const [hotspotOpen, setHotspotOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [roomCode] = useState(() => generateRoomCode());
  const canResume = hasSavedGame();

  const startNewGame = () => {
    playTapSound();
    const players = createDefaultPlayers(variant, 'MEDIUM').map(p =>
      p.seatIndex === 0 ? { ...p, name: loadProfile().name || 'أنت' } : p
    );
    onStartGame({ variant, targetScore, botDifficulty: 'MEDIUM', players });
  };

  const resume = () => {
    playTapSound();
    const saved = loadSavedGameState();
    if (saved) onResumeGame(saved);
  };

  if (showJoin) {
    return (
      <JoinScreen
        onBack={() => setShowJoin(false)}
        onConnected={() => setShowJoin(false)}
      />
    );
  }

  return (
    <div dir="rtl" className={`relative w-full min-h-[100dvh] bg-neutral-950 text-amber-50 overflow-hidden ${className}`}>
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,58,26,0.5),rgba(6,10,6,0.95)_75%)]" />
      </div>

      <div className="relative z-10 min-h-[100dvh] flex flex-col items-center justify-center px-5 py-10">
        {/* Back to home — top-left */}
        <button
          type="button"
          onClick={() => { playTapSound(); onBack(); }}
          aria-label="رجوع للشاشة الرئيسية"
          className="absolute top-4 left-4 flex items-center gap-1 px-3 py-1.5 rounded-full bg-black/70 border border-amber-400/40 text-amber-200 text-xs font-black backdrop-blur-md active:scale-95 cursor-pointer hover:border-amber-300"
        >
          <X className="w-4 h-4" />
          <span>رجوع</span>
        </button>

        <h1 className="text-2xl font-black text-amber-300 mb-6">إعداد الجولة</h1>

        <div className="w-full max-w-md flex flex-col gap-3">
          {/* Resume saved game — on top of "new game" */}
          {canResume && (
            <button
              type="button"
              onClick={resume}
              className="w-full h-14 rounded-2xl border-2 border-emerald-400/70 bg-gradient-to-l from-emerald-500/20 via-emerald-400/10 to-transparent px-4 flex items-center gap-3 shadow-lg active:scale-[0.98] cursor-pointer hover:border-emerald-300 transition-all"
            >
              <RotateCcw className="w-5 h-5 text-emerald-300" />
              <span className="flex-1 text-right">
                <span className="block text-base font-black text-emerald-200">استئناف اللعبة المحفوظة</span>
                <span className="block text-[10px] font-bold text-emerald-200/60 mt-0.5">أكمل من حيث توقفت</span>
              </span>
            </button>
          )}

          {/* New game */}
          <button
            type="button"
            onClick={startNewGame}
            className="w-full h-14 rounded-2xl border-2 border-amber-400/70 bg-gradient-to-l from-amber-500/20 via-amber-400/10 to-transparent px-4 flex items-center gap-3 shadow-lg active:scale-[0.98] cursor-pointer hover:border-amber-300 transition-all"
          >
            <Play className="w-5 h-5 text-amber-300 fill-current" />
            <span className="flex-1 text-right">
              <span className="block text-base font-black text-amber-200">بدء لعبة جديدة</span>
              <span className="block text-[10px] font-bold text-amber-200/60 mt-0.5">أنت ضد بوتات ذكية</span>
            </span>
          </button>

          {/* Player count 6 or 4 */}
          <button
            type="button"
            onClick={() => { playTapSound(); setVariant(v => (v === 'BO6' ? 'BO4' : 'BO6')); }}
            className="w-full h-14 rounded-2xl border-2 border-neutral-700 bg-neutral-900/80 px-4 flex items-center gap-3 active:scale-[0.98] cursor-pointer hover:border-amber-400/50 transition-all"
          >
            <Users className="w-5 h-5 text-amber-300" />
            <span className="flex-1 text-right">
              <span className="block text-sm font-black text-amber-200">عدد اللاعبين</span>
              <span className="block text-[10px] font-bold text-amber-200/60 mt-0.5">اضغط للتبديل بين ٦ و ٤</span>
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-amber-400 text-black text-sm font-black shadow">
              {variant === 'BO6' ? '٦ لاعبين' : '٤ لاعبين'}
            </span>
          </button>

          {/* Score limit (القيد) */}
          <div className="w-full rounded-2xl border-2 border-neutral-700 bg-neutral-900/80 px-4 py-3">
            <div className="flex items-center gap-3 mb-2">
              <Gauge className="w-5 h-5 text-amber-300" />
              <span className="flex-1 text-sm font-black text-amber-200">حد القيد (نقطة الفوز)</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {TARGETS.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { playTapSound(); setTargetScore(t); }}
                  className={`py-2 rounded-xl text-sm font-black border transition-all active:scale-95 cursor-pointer ${
                    targetScore === t
                      ? 'bg-amber-400 text-black border-amber-300 shadow'
                      : 'bg-neutral-950 text-neutral-300 border-neutral-700 hover:bg-neutral-800'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Hotspot: add real players */}
          <button
            type="button"
            onClick={() => { playTapSound(); setHotspotOpen(true); }}
            className="w-full h-14 rounded-2xl border-2 border-neutral-700 bg-neutral-900/80 px-4 flex items-center gap-3 active:scale-[0.98] cursor-pointer hover:border-emerald-400/50 transition-all"
          >
            <Wifi className="w-5 h-5 text-emerald-300" />
            <span className="flex-1 text-right">
              <span className="block text-sm font-black text-amber-200">إضافة لاعبين (هوت سبوت)</span>
              <span className="block text-[10px] font-bold text-amber-200/60 mt-0.5">أنشئ غرفة وشارك الرمز أو انضم لغرفة</span>
            </span>
            <ChevronRight className="w-4 h-4 text-amber-300 rotate-180" />
          </button>
        </div>
      </div>

      {/* Hotspot room: host (QR) or join */}
      {hotspotOpen && (
        <div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-md flex items-center justify-center p-4" dir="rtl">
          <div className="relative w-full max-w-sm bg-neutral-950 border-2 border-amber-500/50 rounded-3xl p-5 shadow-2xl text-center">
            <button
              type="button"
              onClick={() => setHotspotOpen(false)}
              aria-label="إغلاق"
              className="absolute top-4 left-4 w-8 h-8 rounded-full bg-neutral-800 text-white border border-neutral-600 flex items-center justify-center cursor-pointer hover:bg-neutral-700"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-base font-black text-amber-300 mb-1">اللعب عبر هوت سبوت</h3>
            <p className="text-[11px] text-amber-200/60 font-bold mb-4">
              تأكد أن جميع اللاعبين على نفس شبكة الواي فاي أو الهوت سبوت، ثم اختر:
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => { playTapSound(); setQrOpen(true); }}
                className="w-full py-3 rounded-2xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 font-black text-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] hover:bg-emerald-900"
              >
                <Bot className="w-4 h-4" />
                <span>أنا صاحب الغرفة (المنظّم)</span>
              </button>
              <button
                type="button"
                onClick={() => { playTapSound(); setQrOpen(true); }}
                className="w-full py-3 rounded-2xl bg-amber-500/15 border border-amber-400/50 text-amber-200 font-black text-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] hover:bg-amber-500/25"
              >
                <QrCode className="w-4 h-4 text-amber-300" />
                <span>اعرض رمز الغرفة (QR)</span>
              </button>
              <button
                type="button"
                onClick={() => { playTapSound(); setShowJoin(true); }}
                className="w-full py-3 rounded-2xl bg-neutral-900 border border-neutral-700 text-amber-200 font-black text-sm cursor-pointer active:scale-[0.98] hover:bg-neutral-800"
              >
                الانضمام إلى غرفة موجودة
              </button>
            </div>
          </div>
        </div>
      )}

      <QrModal isOpen={qrOpen} onClose={() => setQrOpen(false)} roomCode={roomCode} />
    </div>
  );
};

export default SetupScreen;
