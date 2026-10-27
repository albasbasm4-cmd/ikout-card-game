/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { Card187, GameState187, Suit187, TrickPlay187 } from '../types';
import { Card, SuitSvg } from '../../components/Card';
import { getLegalCards187, getCardPoints } from '../rules';
import { Crown, ShieldAlert } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { characterFace, CHARACTER_IDS, useProfile } from '../../utils/profile';
import { playTapSound } from '../../utils/audio';

export interface Table187Props {
  state: GameState187;
  mySeat?: number;
  onPlayCard: (card: Card187) => void;
  onBid: (bid: number) => void;
  onGiveAwayCards: (cardIds: string[]) => void;
  onDeclareTrump: (suit: Suit187) => void;
  onEarlySettleChoice: (continuePlay: boolean) => void;
  onReportCheat?: (accusedSeat: number, suit: Suit187) => void;
  onNextRound: () => void;
  onExit: () => void;
}

// مواقع اللاعبين الخمسة حول الطاولة بالنسبة لـ mySeat (0 في الأسفل)
// relative 0: أسفل الوسط (أنا)
// relative 1: أسفل اليمين
// relative 2: أعلى اليمين
// relative 3: أعلى اليسار
// relative 4: أسفل اليسار
const SEAT_POSITIONS: Record<number, { left: string; top: string }> = {
  0: { left: '50%', top: '88%' },
  1: { left: '88%', top: '65%' },
  2: { left: '76%', top: '16%' },
  3: { left: '24%', top: '16%' },
  4: { left: '12%', top: '65%' },
};

// مواقع الأوراق المنزلة في منتصف الطاولة (خمس أوراق)
const TRICK_POSITIONS: Record<number, { left: string; top: string }> = {
  0: { left: '50%', top: '60%' },
  1: { left: '65%', top: '50%' },
  2: { left: '58%', top: '35%' },
  3: { left: '42%', top: '35%' },
  4: { left: '35%', top: '50%' },
};

export const Table187: React.FC<Table187Props> = ({
  state,
  mySeat = 0,
  onPlayCard,
  onBid,
  onGiveAwayCards,
  onDeclareTrump,
  onEarlySettleChoice,
  onReportCheat,
  onNextRound,
  onExit,
}) => {
  const profile = useProfile();
  const [selectedDiscards, setSelectedDiscards] = React.useState<string[]>([]);
  const [showCheatModal, setShowCheatModal] = React.useState(false);
  const [selectedCheatPlayer, setSelectedCheatPlayer] = React.useState<number | null>(null);
  const [selectedCheatSuit, setSelectedCheatSuit] = React.useState<Suit187 | null>(null);

  // الشخصيات المستقرة لكل مقعد
  const seatCharacters = useMemo<Record<number, string>>(() => {
    const map: Record<number, string> = { [mySeat]: profile.characterId };
    const pool = CHARACTER_IDS.filter((id) => id !== profile.characterId);
    let next = 0;
    for (let s = 0; s < 5; s++) {
      if (s === mySeat) continue;
      map[s] = pool[next++ % pool.length];
    }
    return map;
  }, [mySeat, profile.characterId]);

  const myHand = state.hands[mySeat] || [];
  const isMyTurn = state.currentSeat === mySeat;

  // فحص الأوراق القانونية في دوري
  const legalCardIds = useMemo(() => {
    if (state.phase !== 'PLAY' || !isMyTurn) return new Set<string>();
    const legal = getLegalCards187(
      myHand,
      state.currentTrick,
      state.trump,
      mySeat,
      state.bidderSeat ?? 0,
      state.trickHistory.length
    );
    return new Set(legal.map((c) => c.id));
  }, [state.phase, isMyTurn, myHand, state.currentTrick, state.trump, mySeat, state.bidderSeat, state.trickHistory.length]);

  const isHumanHakem = state.bidderSeat === mySeat;

  // بطاقات التوزيع
  const toggleDiscard = (id: string) => {
    playTapSound();
    if (selectedDiscards.includes(id)) {
      setSelectedDiscards(selectedDiscards.filter((c) => c !== id));
    } else if (selectedDiscards.length < 4) {
      setSelectedDiscards([...selectedDiscards, id]);
    }
  };

  // المزايدة المتاحة
  const minAllowedBid = state.highBid ? state.highBid + 5 : 75;

  return (
    <div className="relative w-full h-full select-none overflow-hidden bg-[#0d1419]">
      {/* إطار الطاولة البيضاوية الفخمة */}
      <div className="absolute inset-4 sm:inset-10 rounded-[60px] border-[12px] border-[#3a2c20] bg-[#1a4428] shadow-[inset_0_0_80px_rgba(0,0,0,0.8),0_12px_36px_rgba(0,0,0,0.7)] flex items-center justify-center">
        {/* حزام الزخرفة الذهبي الداخلي للطاولة */}
        <div className="absolute inset-4 rounded-[48px] border-2 border-[#d4af37]/30 pointer-events-none" />

        {/* لوحة المعلومات العلوية في الطاولة */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 bg-black/60 border border-amber-400/50 backdrop-blur-md rounded-2xl px-6 py-2 flex items-center gap-8 text-white shadow-xl">
          <div className="text-center">
            <span className="text-[11px] text-amber-300 font-bold block">الحكم</span>
            <div className="flex items-center justify-center gap-1 font-black text-sm">
              {state.trump ? <SuitSvg suit={state.trump} className="w-5 h-5 inline" /> : '—'}
            </div>
          </div>

          <div className="text-center">
            <span className="text-[11px] text-amber-300 font-bold block">القيْد</span>
            <span className="font-black text-base text-amber-200">
              {state.highBid ? state.highBid : '—'}
            </span>
          </div>

          <div className="h-6 w-px bg-white/20" />

          <div className="text-center">
            <span className="text-[11px] text-amber-300 font-bold block">نقاط الحاكم</span>
            <span className="font-black text-base text-cyan-300">{state.hakemPoints}</span>
          </div>

          <div className="text-center">
            <span className="text-[11px] text-amber-300 font-bold block">نقاط الخصوم</span>
            <span className="font-black text-base text-rose-300">{state.opponentsPoints}</span>
          </div>

          <div className="text-center">
            <span className="text-[11px] text-amber-300 font-bold block">المجموع</span>
            <span className="font-black text-xs text-white/70">
              {state.hakemPoints + state.opponentsPoints} / 187
            </span>
          </div>

          {/* زر البلاغ عن غش إذا كان اللعب حراً بين بشر */}
          {state.phase === 'PLAY' && onReportCheat && (
            <button
              type="button"
              onClick={() => {
                playTapSound();
                setShowCheatModal(true);
              }}
              className="px-3 py-1 bg-rose-600/80 hover:bg-rose-500 border border-rose-300 rounded-xl text-xs font-black flex items-center gap-1 cursor-pointer transition-colors"
            >
              <ShieldAlert className="w-4 h-4" />
              <span>إبلاغ</span>
            </button>
          )}
        </div>

        {/* عرض الأوراق المنزلة في منتصف الطاولة (الأكلة الحالية) */}
        <div className="absolute inset-0 pointer-events-none">
          {state.currentTrick.map((play) => {
            const relative = (play.seat - mySeat + 5) % 5;
            const pos = TRICK_POSITIONS[relative];
            return (
              <div
                key={play.card.id}
                style={{
                  position: 'absolute',
                  left: pos.left,
                  top: pos.top,
                  transform: 'translate(-50%, -50%)',
                }}
                className="animate-in zoom-in-75 duration-200 shadow-2xl"
              >
                <Card card={{ id: play.card.id, suit: play.card.suit, rank: play.card.rank }} size="md" />
                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] font-black text-white/90 bg-black/70 px-2 py-0.5 rounded-full whitespace-nowrap">
                  {state.players[play.seat]?.name}
                </span>
              </div>
            );
          })}
        </div>

        {/* اللاعبون الخمسة حول الطاولة */}
        {state.players.map((player) => {
          const seat = player.seatIndex;
          const relative = (seat - mySeat + 5) % 5;
          const pos = SEAT_POSITIONS[relative];
          const isHakem = state.bidderSeat === seat;
          const isCurrent = state.currentSeat === seat;
          const charFace = characterFace(seatCharacters[seat]);

          return (
            <div
              key={seat}
              style={{
                position: 'absolute',
                left: pos.left,
                top: pos.top,
                transform: 'translate(-50%, -50%)',
              }}
              className={`flex flex-col items-center z-10 ${
                isCurrent ? 'scale-105' : 'scale-95'
              } transition-transform duration-200`}
            >
              {/* صورة اللاعب وتاجه إذا كان حاكماً */}
              <div className="relative">
                {isHakem && (
                  <Crown className="w-6 h-6 text-amber-400 absolute -top-5 left-1/2 -translate-x-1/2 filter drop-shadow animate-bounce" />
                )}
                <div
                  className={`w-14 h-14 rounded-full border-2 overflow-hidden bg-neutral-800 shadow-lg ${
                    isCurrent ? 'border-amber-400 ring-4 ring-amber-400/40' : 'border-white/30'
                  }`}
                >
                  <img src={charFace} alt="" className="w-full h-full object-cover" />
                </div>
                {/* عدد الأكلات التي حصل عليها */}
                <span className="absolute -bottom-1 -right-1 bg-amber-500 text-black text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center border border-white">
                  {state.tricksWon[seat]}
                </span>
              </div>

              {/* اسم اللاعب */}
              <span className="text-xs font-black text-white mt-1 drop-shadow bg-black/50 px-2 py-0.5 rounded-full">
                {player.name}
              </span>

              {/* آخر مزايدة نطق بها */}
              {state.bids.some((b) => b.seat === seat) && (
                <span className="text-[10px] font-black text-amber-300 bg-neutral-900/90 border border-amber-400/40 px-2 py-0.5 rounded-full mt-0.5">
                  {state.bids.filter((b) => b.seat === seat).slice(-1)[0].bid === 0
                    ? 'طاف'
                    : state.bids.filter((b) => b.seat === seat).slice(-1)[0].bid}
                </span>
              )}
            </div>
          );
        })}

        {/* يد اللاعب البشري (Seat 0) في الأسفل */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 p-2 bg-black/40 border border-white/10 backdrop-blur-md rounded-2xl shadow-2xl">
          {myHand.map((card) => {
            const isLegal = state.phase !== 'PLAY' || !isMyTurn || legalCardIds.has(card.id);
            const isSelected = selectedDiscards.includes(card.id);

            return (
              <div key={card.id} className="relative group">
                <Card
                  card={{ id: card.id, suit: card.suit, rank: card.rank }}
                  size="md"
                  isLegal={isLegal}
                  isSelected={isSelected}
                  onClick={() => {
                    playTapSound();
                    if (state.phase === 'DISCARD' && isHumanHakem) {
                      toggleDiscard(card.id);
                    } else if (state.phase === 'PLAY' && isMyTurn) {
                      if (isLegal) onPlayCard(card);
                    }
                  }}
                  className={`transition-transform duration-150 cursor-pointer ${
                    isSelected ? '-translate-y-4 shadow-xl' : 'hover:-translate-y-2'
                  }`}
                />
                {/* علامة نقاط الورقة */}
                <span className="absolute -top-2 -right-1 text-[9px] font-black bg-black/80 text-amber-300 px-1 rounded-full border border-amber-400/40">
                  {getCardPoints(card)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== نوافذ تفاعلية حسب المرحلة ===== */}

      {/* 1. نافذة المزايدة للمستخدم */}
      {state.phase === 'BID' && isMyTurn && (
        <div className="absolute inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-950 border-2 border-amber-400/70 rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl">
            <h3 className="text-xl font-black text-amber-300 mb-2">دورك في المزايدة (187)</h3>
            <p className="text-xs text-white/70 mb-4">
              أعلى مزايدة حالياً: <b className="text-amber-200">{state.highBid || 'لا يوجد'}</b>
            </p>

            <div className="grid grid-cols-3 gap-2 mb-4">
              {[minAllowedBid, minAllowedBid + 5, minAllowedBid + 10, minAllowedBid + 15, minAllowedBid + 20, minAllowedBid + 25]
                .filter((b) => b <= 185)
                .map((b) => (
                  <Button
                    key={b}
                    onClick={() => {
                      playTapSound();
                      onBid(b);
                    }}
                    className="bg-amber-500 hover:bg-amber-400 text-black font-black py-2 rounded-xl text-sm"
                  >
                    {b}
                  </Button>
                ))}
            </div>

            <Button
              variant="outline"
              onClick={() => {
                playTapSound();
                onBid(0);
              }}
              className="w-full border-rose-500 text-rose-300 hover:bg-rose-950/50 font-black py-2 rounded-xl text-sm"
            >
              طاف (انسحاب)
            </Button>
          </div>
        </div>
      )}

      {/* 2. نافذة توزيع الأوراق للحاكم البشري */}
      {state.phase === 'DISCARD' && isHumanHakem && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 bg-neutral-950/95 border-2 border-amber-400 rounded-2xl px-6 py-3 text-center shadow-2xl backdrop-blur-md">
          <p className="text-sm font-black text-amber-300 mb-2">
            اختر 4 أوراق لتعطيها لخصومك الأربعة ({selectedDiscards.length} / 4)
          </p>
          <Button
            disabled={selectedDiscards.length !== 4}
            onClick={() => {
              playTapSound();
              onGiveAwayCards(selectedDiscards);
            }}
            className="bg-amber-500 hover:bg-amber-400 text-black font-black px-6 py-2 rounded-xl text-sm"
          >
            تأكيد التوزيع للخصوم
          </Button>
        </div>
      )}

      {/* 3. نافذة تحديد الحكم للحاكم البشري */}
      {state.phase === 'TRUMP' && isHumanHakem && (
        <div className="absolute inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-950 border-2 border-amber-400/70 rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl">
            <h3 className="text-xl font-black text-amber-300 mb-2">حدد نوع الحكم</h3>
            <p className="text-xs text-white/70 mb-5">اختر نوع الحكم الذي تود اللعب به</p>

            <div className="grid grid-cols-2 gap-3">
              {(['S', 'H', 'D', 'C'] as Suit187[]).map((suit) => (
                <button
                  key={suit}
                  type="button"
                  onClick={() => {
                    playTapSound();
                    onDeclareTrump(suit);
                  }}
                  className="p-4 rounded-2xl bg-black/60 border border-white/20 hover:border-amber-400 flex items-center justify-center gap-2 text-white font-black text-base cursor-pointer hover:bg-white/5 transition-all"
                >
                  <SuitSvg suit={suit} className="w-8 h-8" />
                  <span>
                    {suit === 'S' ? 'سبيد' : suit === 'H' ? 'هاص' : suit === 'D' ? 'ديمن' : 'كلفس'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 4. نافذة قرار الحسم المبكر */}
      {state.phase === 'EARLY_SETTLE' && (
        <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-neutral-950 border-2 border-cyan-400 rounded-3xl p-6 max-w-md w-full text-center shadow-2xl">
            <h3 className="text-2xl font-black text-cyan-300 mb-2">
              {state.earlySettledWinner === 'HAKEM'
                ? isHumanHakem
                  ? '🎉 مبروك! لقد ربحت اللعبة مبكراً'
                  : 'لقد فاز الحاكم مبكراً'
                : isHumanHakem
                ? 'لقد خسرت اللعبة مبكراً'
                : '🎉 مبروك! لقد فاز الخصوم مبكراً'}
            </h3>
            <p className="text-sm text-white/80 mb-6">
              وصلت النقاط إلى حد الحسم الرسمي. هل تريد الاستمرار حتى انتهاء البطائق؟
            </p>

            <div className="flex gap-3 justify-center">
              <Button
                onClick={() => {
                  playTapSound();
                  onEarlySettleChoice(true);
                }}
                className="bg-cyan-500 hover:bg-cyan-400 text-black font-black px-6 py-2 rounded-xl text-sm"
              >
                نعم، استمر
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  playTapSound();
                  onEarlySettleChoice(false);
                }}
                className="border-white/30 text-white font-black px-6 py-2 rounded-xl text-sm"
              >
                لا، إنهاء الجولة
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 5. نافذة نهاية الجولة */}
      {state.phase === 'ROUND_END' && (
        <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-neutral-950 border-2 border-amber-400 rounded-3xl p-6 max-w-md w-full text-center shadow-2xl">
            <h3 className="text-2xl font-black text-amber-300 mb-2">
              {state.winner === 'HAKEM' ? '🏆 فاز الحاكم!' : '🏆 فاز فريق الخصوم!'}
            </h3>

            {state.lastCheatVerdict && (
              <p className="text-xs text-rose-300 font-bold mb-3">
                {state.lastCheatVerdict.announcement}
              </p>
            )}

            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 my-4 flex justify-around">
              <div>
                <span className="text-xs text-amber-300 block">نقاط الحاكم</span>
                <span className="text-2xl font-black text-cyan-300">{state.hakemPoints}</span>
                <span className="text-[10px] text-white/60 block">القيْد: {state.highBid}</span>
              </div>
              <div className="w-px bg-white/20" />
              <div>
                <span className="text-xs text-amber-300 block">نقاط الخصوم</span>
                <span className="text-2xl font-black text-rose-300">{state.opponentsPoints}</span>
                <span className="text-[10px] text-white/60 block">المطلوب: {187 - (state.highBid || 75)}</span>
              </div>
            </div>

            <div className="flex gap-3 justify-center">
              <Button
                onClick={() => {
                  playTapSound();
                  onNextRound();
                }}
                className="bg-amber-500 hover:bg-amber-400 text-black font-black px-6 py-2.5 rounded-xl text-sm"
              >
                جولة جديدة
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  playTapSound();
                  onExit();
                }}
                className="border-white/30 text-white font-black px-6 py-2.5 rounded-xl text-sm"
              >
                الخروج
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 6. نافذة الإبلاغ عن غش */}
      {showCheatModal && (
        <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-neutral-950 border-2 border-rose-500 rounded-3xl p-6 max-w-sm w-full shadow-2xl text-right">
            <h3 className="text-lg font-black text-rose-400 mb-2 text-center">إبلاغ عن غش</h3>
            <p className="text-xs text-white/70 mb-4 text-center">
              اختر اللاعب الذي كسر التبعية ونوع الورقة التي غش فيها
            </p>

            <span className="text-xs font-bold text-white/60 block mb-1">اللاعب:</span>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {state.players
                .filter((p) => p.seatIndex !== mySeat)
                .map((p) => (
                  <button
                    key={p.seatIndex}
                    type="button"
                    onClick={() => setSelectedCheatPlayer(p.seatIndex)}
                    className={`p-2 rounded-xl text-xs font-black border transition-colors cursor-pointer ${
                      selectedCheatPlayer === p.seatIndex
                        ? 'bg-rose-600 border-rose-300 text-white'
                        : 'bg-black/60 border-white/20 text-white/80'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
            </div>

            <span className="text-xs font-bold text-white/60 block mb-1">نوع الورقة:</span>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {(['S', 'H', 'D', 'C'] as Suit187[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSelectedCheatSuit(s)}
                  className={`p-2 rounded-xl text-xs font-black border transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                    selectedCheatSuit === s
                      ? 'bg-amber-500 border-amber-200 text-black'
                      : 'bg-black/60 border-white/20 text-white/80'
                  }`}
                >
                  <SuitSvg suit={s} className="w-4 h-4" />
                  <span>{s === 'S' ? 'سبيد' : s === 'H' ? 'هاص' : s === 'D' ? 'ديمن' : 'كلفس'}</span>
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                disabled={selectedCheatPlayer === null || selectedCheatSuit === null}
                onClick={() => {
                  playTapSound();
                  if (selectedCheatPlayer !== null && selectedCheatSuit !== null && onReportCheat) {
                    onReportCheat(selectedCheatPlayer, selectedCheatSuit);
                  }
                  setShowCheatModal(false);
                }}
                className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-black py-2 rounded-xl text-xs"
              >
                تأكيد البلاغ
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowCheatModal(false)}
                className="border-white/30 text-white font-black py-2 rounded-xl text-xs"
              >
                إلغاء
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
