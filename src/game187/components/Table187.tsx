/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useRef, useState } from 'react';
import { Card187, GameState187, Suit187 } from '../types';
import { Card, SuitSvg } from '../../components/Card';
import { getLegalCards187, getCardPoints } from '../rules';
import {
  Crown,
  ShieldAlert,
  Smartphone,
  ArrowRight,
  Bot,
  X,
  Trophy,
  Flame,
  Sparkles,
  RotateCcw,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { characterFace, CHARACTER_IDS, useProfile } from '../../utils/profile';
import { playTapSound } from '../../utils/audio';
import { useStageFit } from '../../hooks/use-stage-fit';
import { useSettings } from '../../store/useSettings';

const FAN_BACK = '/assets/ikout/cards/CardBack-BlueFlask.png';

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

// مواضع الأوراق المنزلة الـ 5 داخل سطح الطاولة (.reference-trick) بنسب مئوية متناظرة ودقيقة
const TRICK_SLOTS_5: Record<number, { left: number; top: number }> = {
  0: { left: 43.1, top: 54 }, // أنا (أسفل الوسط)
  1: { left: 63, top: 38 },   // اللاعب على يميني
  2: { left: 54, top: 10 },   // اللاعب أعلى اليمين
  3: { left: 32, top: 10 },   // اللاعب أعلى اليسار
  4: { left: 23, top: 38 },   // اللاعب على يساري
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
  const stageRef = useRef<HTMLDivElement>(null);
  const { settings, toggleOrientationPreference } = useSettings();
  const orientation = settings.orientationPreference;

  // معايرة مسرح اللعبة إلى 1600x900 تماماً كطاولة ikout الأصلية
  useStageFit(stageRef, 1600, 900, orientation);

  const [selectedDiscards, setSelectedDiscards] = useState<string[]>([]);
  const [showCheatModal, setShowCheatModal] = useState(false);
  const [selectedCheatPlayer, setSelectedCheatPlayer] = useState<number | null>(null);
  const [selectedCheatSuit, setSelectedCheatSuit] = useState<Suit187 | null>(null);

  // شخصيات ثابتة ومستقرة لكل مقعد
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
  }, [
    state.phase,
    isMyTurn,
    myHand,
    state.currentTrick,
    state.trump,
    mySeat,
    state.bidderSeat,
    state.trickHistory.length,
  ]);

  const isHumanHakem = state.bidderSeat === mySeat;

  const toggleDiscard = (id: string) => {
    playTapSound();
    if (selectedDiscards.includes(id)) {
      setSelectedDiscards(selectedDiscards.filter((c) => c !== id));
    } else if (selectedDiscards.length < 4) {
      setSelectedDiscards([...selectedDiscards, id]);
    }
  };

  const minAllowedBid = state.highBid ? state.highBid + 5 : 75;
  const name = (seat: number) => state.players?.[seat]?.name || `لاعب ${seat + 1}`;

  // حساب ترتيب الأوراق في يد اللاعب (سبيت، هاص، كلفس، ديمن، ثم الرتبة تنازلياً)
  const sortedHand = useMemo(() => {
    const suitOrder: Record<string, number> = { S: 0, H: 1, C: 2, D: 3 };
    return [...myHand].sort((a, b) => {
      const sa = suitOrder[a.suit] ?? 9;
      const sb = suitOrder[b.suit] ?? 9;
      if (sa !== sb) return sa - sb;
      return (b.rank ?? 0) - (a.rank ?? 0);
    });
  }, [myHand]);

  const handCount = sortedHand.length;
  const handFanStep = handCount > 1 ? Math.min(3.5, 28 / (handCount - 1)) : 0;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 bg-black text-amber-50 select-none overflow-hidden"
    >
      <div
        ref={stageRef}
        className="absolute top-1/2 left-1/2 w-[1600px] h-[900px] bg-[var(--reference-felt)] shadow-2xl flex flex-col overflow-hidden"
      >
        <div
          dir="rtl"
          className="reference-game table-theme-wood card-theme-authentic w-full h-full"
        >
          <section
            className="reference-arena table-felt"
            aria-label="طاولة 187"
            style={{
              backgroundImage: 'url(/assets/ikout/backgrounds/wood-bg.png)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            {/* أزرار التحكم العلوية على اليسار (خروج، اتجاه، إبلاغ عن غش) */}
            <div className="reference-tools" dir="ltr">
              <Button
                type="button"
                onClick={() => {
                  playTapSound();
                  onExit();
                }}
                className="w-8 h-8 rounded-full bg-black/80 border border-amber-400/40 text-amber-300 flex items-center justify-center shadow-lg hover:bg-neutral-900 active:scale-95 cursor-pointer p-0"
                title="الخروج إلى القائمة"
              >
                <ArrowRight className="w-4 h-4" />
              </Button>

              <Button
                type="button"
                onClick={() => {
                  playTapSound();
                  toggleOrientationPreference();
                }}
                className="w-8 h-8 rounded-full bg-black/80 border border-amber-400/40 text-amber-300 flex items-center justify-center shadow-lg hover:bg-neutral-900 active:scale-95 cursor-pointer p-0"
                title={
                  orientation === 'landscape'
                    ? 'التحويل إلى الوضع العمودي'
                    : 'التحويل إلى الوضع الأفقي'
                }
              >
                <Smartphone
                  className={`w-4 h-4 ${
                    orientation === 'landscape' ? 'rotate-90 text-amber-400' : 'text-emerald-400'
                  }`}
                />
              </Button>

              {state.phase === 'PLAY' && onReportCheat && (
                <Button
                  type="button"
                  onClick={() => {
                    playTapSound();
                    setShowCheatModal(true);
                  }}
                  className="px-2.5 h-8 rounded-full bg-rose-950/80 border border-rose-400/60 text-rose-300 flex items-center gap-1 shadow-lg hover:bg-rose-900 active:scale-95 cursor-pointer text-xs font-black"
                  title="البلاغ عن غش"
                >
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  <span>إبلاغ</span>
                </Button>
              )}
            </div>

            {/* لوحة النتائج والمعلومات العلوية الأنيقة لطاولة 187 */}
            <header className="reference-scorebar" dir="ltr" style={{ width: '310px' }}>
              <div className="reference-score-row" style={{ height: '28px' }}>
                <span className="reference-score team-red" title="نقاط الحاكم">
                  <strong className="text-sm font-black text-cyan-300">
                    حاكم: {state.hakemPoints}
                  </strong>
                </span>
                <span className="reference-score-mid" title="نوع الحكم والقيْد">
                  <strong className="flex items-center gap-1 text-base text-amber-300">
                    {state.trump ? (
                      <SuitSvg suit={state.trump} className="w-5 h-5 inline" />
                    ) : (
                      '—'
                    )}
                    <span>{state.highBid ?? '—'}</span>
                  </strong>
                </span>
                <span className="reference-score team-blue" title="نقاط الخصوم الأربعة">
                  <strong className="text-sm font-black text-rose-300">
                    خصوم: {state.opponentsPoints}
                  </strong>
                </span>
              </div>
              <div className="reference-trick-row" style={{ paddingTop: '2px' }}>
                <span className="text-[10px] font-bold text-amber-200/80">
                  المجموع: {state.hakemPoints + state.opponentsPoints} / 187
                </span>
                <span className="text-[10px] font-bold text-white/70">
                  الجولة {state.roundNo}
                </span>
              </div>
            </header>

            {/* هيكل طاولة كوت الفخمة الأصلية مع إطار الفضة والمقابض الذهبية */}
            <div className="reference-table">
              <div className="reference-table-frame" aria-hidden="true">
                <span className="reference-table-handle handle-left" />
                <span className="reference-table-handle handle-right" />
                <div className="reference-table-surface" />
              </div>

              {/* الأوراق المنزلة الـ 5 في منتصف الطاولة بتوزيع هندسي متناسق */}
              <div className="reference-trick" aria-label="الأوراق على الطاولة">
                {state.currentTrick.map((play, i) => {
                  const relative = (play.seat - mySeat + 5) % 5;
                  const slot = TRICK_SLOTS_5[relative];
                  return (
                    <div
                      key={play.card.id}
                      className="reference-trick-card"
                      style={{
                        left: `${slot.left}%`,
                        top: `${slot.top}%`,
                        zIndex: i + 1,
                      }}
                    >
                      <Card
                        card={{ id: play.card.id, suit: play.card.suit, rank: play.card.rank }}
                        size="sm"
                      />
                      <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] font-black text-amber-300 bg-black/85 px-2 py-0.5 rounded-full whitespace-nowrap border border-amber-400/40 shadow">
                        {name(play.seat)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* رمز الحكم في الركن العلوي إذا تم تحديده */}
            {state.trump && (
              <div className="reference-trump">
                <SuitSvg suit={state.trump} className="w-5 h-5" />
                <strong>{state.highBid}</strong>
              </div>
            )}

            {/* اللاعبون المنافسون الـ 4 الموزعون حول الطاولة بمقاسات ikout الأصلية */}
            {Array.from({ length: 5 }, (_, seat) => {
              if (seat === mySeat) return null;
              const relative = (seat - mySeat + 5) % 5;
              const isHakem = state.bidderSeat === seat;
              const isCurrent = state.currentSeat === seat;
              const held = state.hands[seat]?.length ?? 0;
              const fanMid = (held - 1) / 2;
              const fanSide = relative === 1 ? 'left' : relative === 4 ? 'right' : 'top';

              return (
                <div
                  key={seat}
                  className={`reference-seat seat-5-${relative} ${
                    isCurrent ? 'seat-active' : ''
                  } ${isHakem ? 'seat-hakem' : ''}`}
                >
                  <div className="reference-avatar-wrap">
                    <img
                      className="reference-portrait"
                      src={characterFace(seatCharacters[seat])}
                      alt={name(seat)}
                      draggable={false}
                    />
                    {isHakem && (
                      <Crown className="reference-crown w-6 h-6 text-amber-400 filter drop-shadow animate-bounce" />
                    )}
                    <span className="reference-player-name">
                      {name(seat)} ({state.tricksWon[seat]})
                      {state.players[seat]?.kind === 'AI_BOT' && (
                        <Bot className="reference-bot-icon ml-1 inline" />
                      )}
                    </span>
                  </div>

                  {held > 0 && (
                    <div
                      className={`reference-opponent-hand fan-${fanSide}`}
                      aria-label={`${held} أوراق`}
                    >
                      <div className="fan-ring">
                        {Array.from({ length: held }, (_, i) => (
                          <span
                            key={i}
                            className="reference-mini-back"
                            style={
                              {
                                '--r': `${(i - fanMid) * 4}deg`,
                              } as React.CSSProperties
                            }
                          >
                            <img src={FAN_BACK} alt="" draggable={false} />
                            <i />
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* مقعد اللاعب المحلي (أنا) في الزاوية اليمنى السفلية */}
            <div className="reference-local-seat">
              <div className="reference-avatar-wrap">
                <img
                  className="reference-portrait"
                  src={characterFace(seatCharacters[mySeat])}
                  alt={name(mySeat)}
                  draggable={false}
                />
                {isHumanHakem && (
                  <Crown className="reference-crown w-6 h-6 text-amber-400 filter drop-shadow animate-bounce" />
                )}
                <span className="reference-player-name">
                  {name(mySeat)} ({state.tricksWon[mySeat]} أكلات)
                </span>
              </div>
            </div>

            {/* مروحة أوراق يد اللاعب المحلي بتوزيع انسيابي متناسق وعلامات النقاط */}
            <div className="reference-local-hand">
              <div
                dir="ltr"
                className="relative w-full flex items-end justify-center hand-fan-height"
              >
                {sortedHand.map((card, index) => {
                  const isLegal =
                    state.phase !== 'PLAY' || !isMyTurn || legalCardIds.has(card.id);
                  const isSelected = selectedDiscards.includes(card.id);

                  // هندسة تقوس مروحة اليد
                  const normalizedIdx = index - (handCount - 1) / 2;
                  const rotateDeg = normalizedIdx * handFanStep;
                  const translateY = Math.abs(normalizedIdx) * Math.abs(normalizedIdx) * 1.8;

                  return (
                    <div
                      key={card.id}
                      style={{
                        marginLeft: index === 0 ? 0 : '-18px',
                        transform: isSelected
                          ? 'translateY(-24px) rotate(0deg) scale(1.08)'
                          : `rotate(${rotateDeg}deg) translateY(${translateY}px)`,
                        zIndex: isSelected ? 40 : index + 10,
                        transition: 'transform 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                      }}
                      className="origin-bottom will-change-transform relative group"
                    >
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
                        className={`cursor-pointer ${
                          isSelected
                            ? 'ring-4 ring-amber-400 shadow-2xl'
                            : 'hover:-translate-y-2'
                        }`}
                      />
                      {/* علامة نقاط الورقة في وضع 187 */}
                      <span className="absolute -top-2 -right-1 text-[9px] font-black bg-black/90 text-amber-300 px-1.5 py-0.5 rounded-full border border-amber-400/50 shadow pointer-events-none">
                        {getCardPoints(card)}ن
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </div>

        {/* ===== النوافذ التفاعلية لمراحل لعبة 187 ===== */}

        {/* 1. نافذة المزايدة للمستخدم */}
        {state.phase === 'BID' && isMyTurn && (
          <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-neutral-950 border-2 border-amber-400/70 rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl">
              <h3 className="text-xl font-black text-amber-300 mb-2">دورك في المزايدة (187)</h3>
              <p className="text-xs text-white/70 mb-4">
                أعلى مزايدة حالياً: <b className="text-amber-200">{state.highBid || 'لا يوجد'}</b>
              </p>

              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  minAllowedBid,
                  minAllowedBid + 5,
                  minAllowedBid + 10,
                  minAllowedBid + 15,
                  minAllowedBid + 20,
                  minAllowedBid + 25,
                ]
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

        {/* 2. شريط توزيع الأوراق للحاكم البشري */}
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
          <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
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
                      {suit === 'S'
                        ? 'سبيد'
                        : suit === 'H'
                        ? 'هاص'
                        : suit === 'D'
                        ? 'ديمن'
                        : 'كلفس'}
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
                  className="border-neutral-500 text-white hover:bg-white/10 font-black px-6 py-2 rounded-xl text-sm"
                >
                  إنهاء وحساب النتيجة
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* 5. نافذة البلاغ عن الغش */}
        {showCheatModal && (
          <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-neutral-950 border-2 border-rose-500 rounded-3xl p-6 max-w-md w-full shadow-2xl text-white">
              <div className="flex justify-between items-center mb-4 border-b border-rose-500/30 pb-2">
                <h3 className="text-lg font-black text-rose-300 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-rose-400" />
                  <span>إبلاغ عن غش (كسر التبعية)</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCheatModal(false)}
                  className="text-white/60 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-white/70 mb-3">
                حدد اللاعب ونوع البطاقة التي غش فيها:
              </p>

              {/* اختيار اللاعب */}
              <div className="mb-4">
                <label className="text-xs font-bold text-amber-300 mb-1.5 block">
                  اللاعب المُبلّغ عنه:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {state.players.map((p) => {
                    if (p.seatIndex === mySeat) return null;
                    return (
                      <button
                        key={p.seatIndex}
                        type="button"
                        onClick={() => setSelectedCheatPlayer(p.seatIndex)}
                        className={`p-2.5 rounded-xl border text-xs font-black transition-all ${
                          selectedCheatPlayer === p.seatIndex
                            ? 'bg-rose-600 border-rose-400 text-white shadow-lg'
                            : 'bg-black/50 border-white/20 text-white/80 hover:bg-white/5'
                        }`}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* اختيار اللون */}
              <div className="mb-5">
                <label className="text-xs font-bold text-amber-300 mb-1.5 block">
                  اللون المغشوش فيه:
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['S', 'H', 'D', 'C'] as Suit187[]).map((suit) => (
                    <button
                      key={suit}
                      type="button"
                      onClick={() => setSelectedCheatSuit(suit)}
                      className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                        selectedCheatSuit === suit
                          ? 'bg-rose-600 border-rose-400 text-white shadow-lg'
                          : 'bg-black/50 border-white/20 text-white/80 hover:bg-white/5'
                      }`}
                    >
                      <SuitSvg suit={suit} className="w-5 h-5" />
                      <span className="text-[10px] font-bold">
                        {suit === 'S'
                          ? 'سبيد'
                          : suit === 'H'
                          ? 'هاص'
                          : suit === 'D'
                          ? 'ديمن'
                          : 'كلفس'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  disabled={selectedCheatPlayer === null || selectedCheatSuit === null}
                  onClick={() => {
                    playTapSound();
                    if (
                      selectedCheatPlayer !== null &&
                      selectedCheatSuit !== null &&
                      onReportCheat
                    ) {
                      onReportCheat(selectedCheatPlayer, selectedCheatSuit);
                      setShowCheatModal(false);
                    }
                  }}
                  className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-black py-2 rounded-xl text-sm"
                >
                  تأكيد البلاغ
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowCheatModal(false)}
                  className="border-neutral-600 text-white/70 hover:bg-white/10"
                >
                  إلغاء
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* 6. نافذة نهاية الجولة */}
        {state.phase === 'ROUND_END' && (
          <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-neutral-950 border-2 border-amber-500/60 rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-black mx-auto mb-2 shadow-xl">
                <Flame className="w-6 h-6 fill-current" />
              </div>

              <h2 className="text-xl font-black text-amber-300">
                نهاية الجولة {state.roundNo}
              </h2>
              <p className="text-xs text-amber-200/70 mt-0.5 font-medium">
                الحاكم: <b className="text-white">{name(state.bidderSeat ?? 0)}</b> | القيْد:{' '}
                <b className="text-amber-300">{state.highBid}</b>
              </p>

              <div className="grid grid-cols-2 gap-2 my-4">
                <div className="bg-cyan-950/80 border border-cyan-500/40 rounded-2xl p-2.5">
                  <span className="text-[10px] text-cyan-300 block font-black">نقاط الحاكم</span>
                  <span className="text-2xl font-black text-white">
                    {state.hakemPoints}
                  </span>
                </div>
                <div className="bg-rose-950/80 border border-rose-500/40 rounded-2xl p-2.5">
                  <span className="text-[10px] text-rose-300 block font-black">نقاط الخصوم</span>
                  <span className="text-2xl font-black text-white">
                    {state.opponentsPoints}
                  </span>
                </div>
              </div>

              <Button
                onClick={() => {
                  playTapSound();
                  onNextRound();
                }}
                className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-black py-2.5 rounded-2xl text-sm shadow-xl cursor-pointer flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>الجولة التالية ({state.roundNo + 1})</span>
              </Button>
            </div>
          </div>
        )}

        {/* 7. نافذة نهاية المباراة */}
        {state.phase === 'GAME_END' && (
          <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-lg flex items-center justify-center p-4">
            <div className="bg-neutral-950 border-2 border-amber-400 rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl">
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-black mx-auto mb-3 shadow-2xl">
                <Trophy className="w-8 h-8 fill-current" />
              </div>

              <h2 className="text-2xl font-black text-amber-300">
                {state.matchWinner === 'HAKEM' ? 'فاز الحاكم بالمباراة! 🏆' : 'فاز الخصوم بالمباراة! 🏆'}
              </h2>

              <div className="bg-black/60 border border-amber-400/30 rounded-2xl p-3 my-4 flex justify-around">
                <div>
                  <span className="text-[11px] text-cyan-300 block font-bold">الحاكم</span>
                  <span className="text-2xl font-black text-white">
                    {state.matchScores?.HAKEM ?? state.hakemPoints}
                  </span>
                </div>
                <span className="text-xl font-black text-amber-400/60">:</span>
                <div>
                  <span className="text-[11px] text-rose-300 block font-bold">الخصوم</span>
                  <span className="text-2xl font-black text-white">
                    {state.matchScores?.OPPONENTS ?? state.opponentsPoints}
                  </span>
                </div>
              </div>

              <Button
                onClick={() => {
                  playTapSound();
                  onExit();
                }}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 text-black font-black text-sm shadow-xl cursor-pointer flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>العودة إلى القائمة</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Table187;
