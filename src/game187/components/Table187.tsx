import { NetworkLatencyBadge } from "../../components/NetworkLatencyBadge";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, useReducedMotion } from 'motion/react';
import { Card187, GameState187, Suit187, TrickPlay187 } from '../types';
import { Card, SuitSvg } from '../../components/Card';
import { Hand } from '../../components/Hand';
import { TrumpPicker } from '../../components/TrumpPicker';
import type { Card as CardType } from '../../types/kout';
import { getLegalCards187, minAllowedBid187, TOTAL_GAME_POINTS } from '../rules';
import {
  Crown,
  ShieldAlert,
  Smartphone,
  Bot,
  X,
  Trophy,
  Flame,
  Sparkles,
  RotateCcw,
  Hand as PassHand,
  Maximize,
  Minimize,
  BookOpen,
  Volume2,
  VolumeX,
  Settings,
  Home,
  Check,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { characterFace, CHARACTER_IDS, useProfile, cardBack, tableImage } from '../../utils/profile';
import { playTapSound, playWinSound, playLoseSound } from '../../utils/audio';
import { useStageFit } from '../../hooks/use-stage-fit';
import { useSettings, type BotSpeed } from '../../store/useSettings';
import { BidSlider187 } from './BidSlider187';
import { TrickCard187 } from './TrickCard187';
import { MESSAGES_187, bubbleText187, chatClips187, chatCode187 } from '../messages';
import { play187Sound } from '../audio';
import { speak187 } from '../voices';

/** Game stage height in design units; width follows the screen's aspect ratio (same as the iKout table). */
const STAGE_H = 450;
const TOTAL_TRICKS = 8;

export interface Table187Props {
  state: GameState187;
  mySeat?: number;
  /** Cards shown on the table (holds the completed trick briefly so the last card can land). */
  displayedTrick?: TrickPlay187[];
  winningPlay?: TrickPlay187 | null;
  trickAnnouncement?: string | null;
  /** False while a completed trick is still on the table. */
  canAct?: boolean;
  onPlayCard: (card: Card187) => void;
  onBid: (bid: number) => void;
  onGiveAwayCards: (cardIds: string[]) => void;
  onDeclareTrump: (suit: Suit187) => void;
  onEarlySettleChoice: (continuePlay: boolean) => void;
  onReportCheat?: (accusedSeat: number, suit: Suit187) => void;
  onNextRound: () => void;
  onRestart?: () => void;
  onExit: () => void;
  speechBubbles?: Record<number, string>;
  onSendMessage?: (message: string) => void;
}

/** Seat positions around the table for 5 players: me (bottom right), then right, top right, top left, left. */
const SEAT_POS = ['', 'R', 'TR', 'TL', 'L'] as const;

/** Card slots on the table surface (percent of the table box), one per relative seat. */
const TRICK_SLOTS_5: Record<number, { left: number; top: number }> = {
  0: { left: 43.1, top: 56 },
  1: { left: 62.5, top: 39 },
  2: { left: 54.6, top: 8 },
  3: { left: 31.6, top: 8 },
  4: { left: 23.7, top: 39 },
};

const SUIT_NAME: Record<Suit187, string> = { S: 'سبيد', H: 'هاص', D: 'ديمن', C: 'كلفس' };
const SPEED_LABELS: { id: BotSpeed; label: string }[] = [
  { id: 'SLOW', label: 'هادئ' },
  { id: 'NORMAL', label: 'عادي' },
  { id: 'FAST', label: 'سريع' },
];

export const Table187: React.FC<Table187Props> = ({
  state,
  mySeat = 0,
  displayedTrick,
  winningPlay = null,
  trickAnnouncement = null,
  canAct = true,
  onPlayCard,
  onBid,
  onGiveAwayCards,
  onDeclareTrump,
  onEarlySettleChoice,
  onReportCheat,
  onNextRound,
  onRestart,
  onExit,
  speechBubbles = {},
  onSendMessage,
}) => {
  const profile = useProfile();
  const reducedMotion = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const { settings, updateSettings, toggleSound, setBotSpeed, toggleOrientationPreference } = useSettings();
  const orientation = settings.orientationPreference;

  const [stageW, setStageW] = useState(800);
  useEffect(() => {
    const calc = () => {
      const vw = window.visualViewport?.width ?? window.innerWidth;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const rotated = orientation === 'landscape' && vh > vw;
      const ratio = rotated ? vh / vw : vw / vh;
      setStageW(Math.round(Math.min(1050, Math.max(700, STAGE_H * ratio))));
    };
    calc();
    window.addEventListener('resize', calc);
    window.addEventListener('orientationchange', calc);
    return () => {
      window.removeEventListener('resize', calc);
      window.removeEventListener('orientationchange', calc);
    };
  }, [orientation]);
  useStageFit(stageRef, stageW, STAGE_H, orientation);

  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  const toggleFullscreen = async () => {
    playTapSound();
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
        const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
        o?.lock?.('landscape').catch(() => {});
      } else {
        await document.exitFullscreen?.();
      }
    } catch {
      // ignore
    }
  };

  const [selectedDiscards, setSelectedDiscards] = useState<string[]>([]);
  const [showCheatModal, setShowCheatModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedCheatPlayer, setSelectedCheatPlayer] = useState<number | null>(null);
  const [selectedCheatSuit, setSelectedCheatSuit] = useState<Suit187 | null>(null);

  // Stable characters per seat: my profile character, bots drawn from the rest.
  const seatCharacters = useMemo<Record<number, string>>(() => {
    const map: Record<number, string> = { [mySeat]: profile.characterId };
    const pool = CHARACTER_IDS.filter((id) => id !== profile.characterId);
    let next = 0;
    for (let s = 0; s < 5; s++) {
      if (s === mySeat) continue;
      map[s] = state.players?.[s]?.characterId || pool[next++ % pool.length];
    }
    return map;
  }, [mySeat, profile.characterId, state.players]);

  const myHand = state.hands[mySeat] || [];
  const isMyTurn = state.currentSeat === mySeat;
  const isHumanHakem = state.bidderSeat === mySeat;
  const trick = displayedTrick ?? state.currentTrick;
  const name = (seat: number) => state.players?.[seat]?.name || `لاعب ${seat + 1}`;
  const isBot = (seat: number) => state.players?.[seat]?.kind === 'AI_BOT';

  const legalCardIds = useMemo(() => {
    if (state.phase !== 'PLAY' || !isMyTurn) return new Set<string>();
    const legal = getLegalCards187(myHand, state.currentTrick, state.trump, mySeat, state.bidderSeat ?? 0, state.trickHistory.length);
    return new Set(legal.map((c) => c.id));
  }, [state.phase, isMyTurn, myHand, state.currentTrick, state.trump, mySeat, state.bidderSeat, state.trickHistory.length]);

  // Live bid draft: shown in the picker and on my seat while I drag the line.
  const minAllowedBid = minAllowedBid187(state.highBid);
  const pickingBid = state.phase === 'BID' && isMyTurn;
  const [bidDraft, setBidDraft] = useState(minAllowedBid);
  useEffect(() => {
    if (pickingBid) setBidDraft(minAllowedBid);
  }, [pickingBid, minAllowedBid]);

  useEffect(() => {
    if (state.phase !== 'DISCARD') setSelectedDiscards([]);
  }, [state.phase]);

  const toggleDiscard = (id: string) => {
    playTapSound();
    setSelectedDiscards((cur) => (cur.includes(id) ? cur.filter((c) => c !== id) : cur.length < 4 ? [...cur, id] : cur));
  };

  // Round result sound (generic win/lose effects only — no iKout character voices in 187).
  const resultPlayed = useRef<number | null>(null);
  useEffect(() => {
    if (state.phase !== 'ROUND_END' || !state.winner) return;
    if (resultPlayed.current === state.roundNo) return;
    resultPlayed.current = state.roundNo;
    const iWon = (state.winner === 'HAKEM') === isHumanHakem;
    if (iWon) playWinSound();
    else playLoseSound();
  }, [state.phase, state.winner, state.roundNo, isHumanHakem]);

  // Sides: before a hakem exists everyone plays alone; afterwards hakem vs the other four.
  const sidesKnown = state.bidderSeat !== null && state.bidderSeat !== undefined && state.phase !== 'BID';
  const sameSide = (seat: number) => {
    if (seat === mySeat) return true;
    if (!sidesKnown) return false;
    return (seat === state.bidderSeat) === isHumanHakem;
  };
  const mySidePoints = isHumanHakem ? state.hakemPoints : state.opponentsPoints;
  const otherSidePoints = isHumanHakem ? state.opponentsPoints : state.hakemPoints;
  const qayd = state.highBid;
  const hakemNeeds = qayd !== null && sidesKnown ? qayd + 1 : null;
  const oppNeeds = qayd !== null && sidesKnown ? TOTAL_GAME_POINTS - qayd : null;
  const myNeeds = isHumanHakem ? hakemNeeds : oppNeeds;
  const otherNeeds = isHumanHakem ? oppNeeds : hakemNeeds;
  const sideTricks = (mine: boolean) =>
    state.tricksWon.reduce((sum, n, seat) => (sameSide(seat) === mine ? sum + n : sum), 0);
  const myTricks = !sidesKnown ? state.tricksWon[mySeat] ?? 0 : sideTricks(true);
  const otherTricks = !sidesKnown ? 0 : sideTricks(false);
  const active = state.phase === 'TRUMP' || state.phase === 'DISCARD' ? state.bidderSeat : state.currentSeat;

  const badgeFor = (seat: number): React.ReactNode => {
    if (state.phase === 'BID') {
      if (seat === mySeat && pickingBid) return <strong className="kt187-draft">{bidDraft <= 185 ? bidDraft : '—'}</strong>;
      const seatBids = state.bids.filter((b) => b.seat === seat);
      const last = seatBids[seatBids.length - 1];
      if (!last) return null;
      return last.bid ? <strong key={`b${last.bid}`} className="kt187-pop">{last.bid}</strong> : <PassHand className="kt-badge-hand" strokeWidth={2.4} />;
    }
    if (state.bidderSeat === seat && state.highBid && state.phase !== 'GAME_END') {
      return (
        <>
          <strong>{state.highBid}</strong>
          {state.trump && <SuitSvg suit={state.trump} className="kt-badge-suit" />}
        </>
      );
    }
    return null;
  };

  const tool = 'w-8 h-8 p-0 cursor-pointer';
  const headerControls = (
    <div className="flex items-center gap-1.5 pointer-events-auto">
      <Button type="button" className={tool} onClick={() => { playTapSound(); toggleOrientationPreference(); }}
        aria-label={orientation === 'landscape' ? 'التحويل إلى الوضع العمودي' : 'التحويل إلى الوضع الأفقي'} title="اتجاه الشاشة">
        <Smartphone className={orientation === 'landscape' ? 'rotate-90' : ''} />
      </Button>
      <Button type="button" className={tool} onClick={toggleFullscreen} aria-label={isFullscreen ? 'تصغير الشاشة' : 'ملء الشاشة'} title={isFullscreen ? 'تصغير الشاشة' : 'ملء الشاشة'}>
        {isFullscreen ? <Minimize /> : <Maximize />}
      </Button>
      <Button type="button" className={tool} onClick={() => { playTapSound(); setShowRules(true); }} aria-label="قوانين 187" title="قوانين 187">
        <BookOpen />
      </Button>
      <Button type="button" className={tool} onClick={() => { playTapSound(); setShowSheet(true); }} aria-label="النشرة" title="النشرة">
        <Trophy />
      </Button>
      <Button type="button" className={tool} onClick={toggleSound} aria-label="كتم/تشغيل الصوت" title="كتم/تشغيل الصوت">
        {settings.soundEnabled ? <Volume2 /> : <VolumeX />}
      </Button>
      {state.phase === 'PLAY' && onReportCheat && (
        <Button type="button" className={tool} onClick={() => { playTapSound(); setShowCheatModal(true); }} aria-label="البلاغ عن غش" title="البلاغ عن غش">
          <ShieldAlert />
        </Button>
      )}
      <Button type="button" className={tool} onClick={() => { playTapSound(); setShowSettings(true); }} aria-label="الإعدادات" title="الإعدادات">
        <Settings />
      </Button>
      <Button type="button" className={tool} onClick={() => { playTapSound(); onExit(); }} aria-label="الخروج إلى القائمة" title="الخروج إلى القائمة">
        <Home />
      </Button>
    </div>
  );

  let centerOverlay: React.ReactNode = null;
  if (pickingBid) {
    centerOverlay = (
      <BidSlider187
        min={minAllowedBid}
        value={bidDraft}
        onChange={setBidDraft}
        onConfirm={(v) => onBid(v)}
        onPass={() => onBid(0)}
      />
    );
  } else if (state.phase === 'DISCARD' && isHumanHakem) {
    centerOverlay = (
      <div className="kt-picker kt187-give" role="group" aria-label="إعطاء الأوراق" dir="rtl">
        <span className="kt-ribbon"><span>أعطِ ٤ أوراق</span></span>
        <p>اختر ورقة لكل خصم من أوراقك ({selectedDiscards.length} / 4)</p>
        <div className="kt187-give-dots" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => <i key={i} className={i < selectedDiscards.length ? 'on' : ''} />)}
        </div>
        <button type="button" className="kt-tile kt187-give-ok" disabled={selectedDiscards.length !== 4}
          onClick={() => { playTapSound(); onGiveAwayCards(selectedDiscards); }}>
          <Check className="kt187-side-icon" strokeWidth={3} />
          <small>تأكيد التوزيع</small>
        </button>
      </div>
    );
  } else if (state.phase === 'TRUMP' && isHumanHakem) {
    centerOverlay = <TrumpPicker currentTrump={state.trump} onSelectTrump={(s) => onDeclareTrump(s as Suit187)} />;
  }

  // 187 character voices: welcome once per match, bot passes, and the round result. Only safe clips play.
  const voiceMemo = useRef({ round: 0, passed: [] as boolean[], winner: null as string | null });
  useEffect(() => {
    const memo = voiceMemo.current;
    const botSeats = [0, 1, 2, 3, 4].filter(seat => seat !== mySeat && state.players?.[seat]?.kind === 'AI_BOT');
    const pick = (seats: number[]) => seats[Math.floor(Math.random() * seats.length)];
    if (state.roundNo !== memo.round) {
      memo.round = state.roundNo; memo.passed = []; memo.winner = null;
      if (state.roundNo === 1 && botSeats.length) { const seat = pick(botSeats); speak187(seat, seatCharacters[seat], 'welcome'); }
      return;
    }
    state.passedSeats.forEach((passed, seat) => {
      if (passed && !memo.passed[seat] && botSeats.includes(seat)) speak187(seat, seatCharacters[seat], 'pass');
    });
    memo.passed = [...state.passedSeats];
    if (state.winner && !memo.winner) {
      memo.winner = state.winner;
      const hakemWon = state.winner === 'HAKEM';
      const winners = botSeats.filter(seat => (seat === state.bidderSeat) === hakemWon);
      const losers = botSeats.filter(seat => (seat === state.bidderSeat) !== hakemWon);
      if (winners.length) { const seat = pick(winners); speak187(seat, seatCharacters[seat], 'win'); }
      else if (losers.length) { const seat = pick(losers); speak187(seat, seatCharacters[seat], 'lose'); }
    }
  }, [state.roundNo, state.passedSeats, state.winner, state.bidderSeat, state.players, mySeat, seatCharacters]);

  const discarding = state.phase === 'DISCARD' && isHumanHakem;
  const myPlayTurn = state.phase === 'PLAY' && isMyTurn && canAct;

  return (
    <div dir="rtl" className="fixed inset-0 bg-black text-amber-50 select-none overflow-hidden">
      <div
        ref={stageRef}
        // useStageFit owns the centering transform; Tailwind translate utilities would double it.
        style={{
          width: `${stageW}px`,
          height: `${STAGE_H}px`,
          ['--game-h' as string]: `${STAGE_H}px`,
          ['--kt-tscale' as string]: '1',
        }}
        className="absolute top-1/2 left-1/2 overflow-hidden"
      >
        <div dir="rtl" className={`kt-root kt-187 table-theme-${profile.table} card-theme-${profile.cards} ${centerOverlay ? 'kt-picking' : ''}`}>
          <section className="kt-arena" aria-label="طاولة 187">
            <div className="kt-tools" dir="ltr">{headerControls}</div>

            <header className="kt-score" dir="ltr" aria-label="النتيجة">
              <div className="kt-score-top">
                <strong className="kt-c-team">{mySidePoints}{myNeeds !== null && <small>/{myNeeds}</small>}</strong>
                <strong className="kt-score-limit" title="القيد">{sidesKnown ? qayd : TOTAL_GAME_POINTS}</strong>
                <strong className="kt-c-opp">{otherSidePoints}{otherNeeds !== null && <small>/{otherNeeds}</small>}</strong>
              </div>
              <div className="kt-score-bottom">
                <span className="kt-c-team"><b>{myTricks}</b></span>
                <span className="kt-dots" aria-label="الأكلات">
                  {Array.from({ length: TOTAL_TRICKS }, (_, i) => {
                    const cls = i < myTricks ? 'dot-team' : i >= TOTAL_TRICKS - otherTricks ? 'dot-opp' : i === myTricks && state.phase === 'PLAY' ? 'dot-now' : '';
                    return <i key={i} className={cls} />;
                  })}
                </span>
                <span className="kt-c-opp">
                  {state.trump && <SuitSvg suit={state.trump} className="kt187-score-suit" />}
                  <b>{otherTricks}</b>
                </span>
              </div>
            </header>

            <div className="kt-table">
              <span className="kt-handle kt-handle-l" aria-hidden="true" />
              <span className="kt-handle kt-handle-r" aria-hidden="true" />
              <div className="kt-frame kt-themed" aria-hidden="true"><img className="kt-table-theme-image" src={tableImage(profile.table)} alt="" /></div>
              <span className="kt-plate kt-plate-top" aria-hidden="true" />
              <span className="kt-plate kt-plate-bottom" aria-hidden="true" />
              <div className="kt-trick" aria-label="الأوراق على الطاولة">
                <AnimatePresence>
                  {trick.map((play, i) => {
                    const relative = (play.seat - mySeat + 5) % 5;
                    const slot = TRICK_SLOTS_5[relative];
                    const winRel = ((winningPlay?.seat ?? play.seat) - mySeat + 5) % 5;
                    const winSlot = TRICK_SLOTS_5[winRel];
                    const winning = winningPlay?.card.id === play.card.id;
                    return (
                      <TrickCard187
                        key={play.card.id}
                        play={play}
                        left={slot.left}
                        top={slot.top}
                        zIndex={winning ? 50 : i + 1}
                        winning={winning}
                        exitX={(winSlot.left - slot.left) * 4.67}
                        exitY={(winSlot.top - slot.top) * 2.63}
                        reducedMotion={!!reducedMotion}
                      />
                    );
                  })}
                </AnimatePresence>
                {trickAnnouncement && <span className="kt-winner">{trickAnnouncement}</span>}
              </div>
              {centerOverlay && <div className="kt-center">{centerOverlay}</div>}
            </div>

            {Array.from({ length: 5 }, (_, seat) => {
              if (seat === mySeat) return null;
              const relative = (seat - mySeat + 5) % 5;
              const pos = SEAT_POS[relative];
              const side = pos === 'L' ? 'left' : pos === 'R' ? 'right' : 'top';
              const badge = badgeFor(seat);
              const held = state.hands[seat]?.length ?? 0;
              const fanMid = (held - 1) / 2;
              return (
                <div
                  key={seat}
                  data-seat-origin={seat}
                  className={`kt-seat kt-pos-${pos} kt-side-${side} ${sameSide(seat) ? 'kt-team' : 'kt-opp'} ${active === seat ? 'kt-active' : ''}`}
                >
                  <div className="kt-avatar"><img src={characterFace(seatCharacters[seat])} alt={name(seat)} draggable={false} /></div>
                  {state.bidderSeat === seat && state.phase !== 'BID' && <Crown className="kt-crown" />}
                  <div className="kt-name">{isBot(seat) && <Bot className="kt-bot" />}<span>{name(seat)}</span></div>
                  {held > 0 && (
                    <div className={`kt-fan kt-fan-${side}`} aria-label={`${held} أوراق`}>
                      <div className="kt-fan-ring">
                        {Array.from({ length: held }, (_, i) => (
                          <span key={i} className="kt-mini" style={{ '--r': `${(i - fanMid) * 3}deg`, '--dx': side === 'top' ? `${(i - fanMid) * 9}px` : '0px', '--dy': side === 'top' ? '0px' : `${(i - fanMid) * 7}px` } as React.CSSProperties}>
                            <img src={cardBack(profile.cards)} alt="" draggable={false} />
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {badge && <span className="kt-badge">{badge}</span>}
                  {speechBubbles[seat] && <div className="kt-speech" role="status">{bubbleText187(speechBubbles[seat], seatCharacters[seat])}</div>}
                </div>
              );
            })}

            <div className="kt-hand">
              {discarding ? (
                <DiscardFan cards={myHand} selected={selectedDiscards} onToggle={toggleDiscard} />
              ) : (
                <Hand
                  cards={myHand as CardType[]}
                  legalCardIds={state.phase === 'PLAY' ? legalCardIds : undefined}
                  isMyTurn={myPlayTurn}
                  onPlayCard={(c) => {
                    const card = myHand.find((h) => h.id === c.id);
                    if (card) onPlayCard(card);
                  }}
                  cardSize="md"
                  cardStep={37}
                />
              )}
            </div>

            <div data-seat-origin={mySeat} className={`kt-local kt-team ${active === mySeat ? 'kt-active' : ''}`}>
              <Button variant="ghost" className="kt-avatar kt-chat-trigger" aria-label="رسائل الدردشة" title="رسائل الدردشة" onClick={() => { playTapSound(); setChatOpen(v => !v); }}><img src={characterFace(seatCharacters[mySeat])} alt={name(mySeat)} draggable={false} /></Button>
              {speechBubbles[mySeat] && <div className="kt-speech" role="status">{bubbleText187(speechBubbles[mySeat], seatCharacters[mySeat])}</div>}
              {isHumanHakem && state.phase !== 'BID' && <Crown className="kt-crown" />}
              {badgeFor(mySeat) && <span className="kt-badge">{badgeFor(mySeat)}</span>}
              <div className="kt-name"><span>{name(mySeat)}</span></div>
            </div>
            {chatOpen && <div className="kt-chat" dir="rtl"><Button variant="ghost" size="icon" aria-label="إغلاق التعليقات" onClick={() => setChatOpen(false)}><X /></Button><div>{MESSAGES_187.map(message => <Button key={message} variant="ghost" onClick={() => { play187Sound('message'); onSendMessage?.(message); setChatOpen(false); }}>{message}</Button>)}{chatClips187(seatCharacters[mySeat]).map(clip => <Button key={clip.file} variant="ghost" onClick={() => { play187Sound('message'); onSendMessage?.(chatCode187(clip)); setChatOpen(false); }}>{clip.text}</Button>)}</div></div>}
          
            {/* مؤشر سرعة الاتصال (البنق) في أسفل يسار طاولة 187 */}
            <NetworkLatencyBadge
              players={Array.from({ length: 5 }, (_, idx) => ({
                seatIndex: idx,
                name: name(idx),
                isBot: isBot(idx),
              }))}
            />
</section>
        </div>

        {/* ===== 187 phase dialogs ===== */}

        {state.phase === 'EARLY_SETTLE' && (
          <Modal tone="cyan">
            <h3 className="text-xl font-black text-cyan-300 mb-2">
              {state.earlySettledWinner === 'HAKEM'
                ? isHumanHakem ? '🎉 مبروك! لقد ربحت اللعبة مبكراً' : 'لقد فاز الحاكم مبكراً'
                : isHumanHakem ? 'لقد خسرت اللعبة مبكراً' : '🎉 مبروك! لقد فاز الخصوم مبكراً'}
            </h3>
            <p className="text-sm text-white/80 mb-5">وصلت النقاط إلى حد الحسم الرسمي. هل تريد الاستمرار حتى انتهاء البطائق؟</p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => { playTapSound(); onEarlySettleChoice(true); }} className="bg-cyan-500 hover:bg-cyan-400 text-black font-black px-6 py-2 rounded-xl text-sm">نعم، استمر</Button>
              <Button variant="outline" onClick={() => { playTapSound(); onEarlySettleChoice(false); }} className="bg-neutral-900 border-neutral-500 text-white hover:bg-neutral-800 hover:text-white font-black px-6 py-2 rounded-xl text-sm">إنهاء وحساب النتيجة</Button>
            </div>
          </Modal>
        )}

        {showCheatModal && (
          <Modal tone="rose" onClose={() => setShowCheatModal(false)} title="إبلاغ عن غش (كسر التبعية)">
            <p className="text-xs text-white/70 mb-2 text-right">حدد اللاعب ونوع البطاقة التي غش فيها:</p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {state.players.map((p) =>
                p.seatIndex === mySeat ? null : (
                  <button key={p.seatIndex} type="button" onClick={() => setSelectedCheatPlayer(p.seatIndex)}
                    className={`p-2 rounded-xl border text-xs font-black transition-all ${selectedCheatPlayer === p.seatIndex ? 'bg-rose-600 border-rose-400 text-white' : 'bg-black/50 border-white/20 text-white/80 hover:bg-white/5'}`}>
                    {p.name}
                  </button>
                ),
              )}
            </div>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {(['S', 'H', 'D', 'C'] as Suit187[]).map((suit) => (
                <button key={suit} type="button" onClick={() => setSelectedCheatSuit(suit)}
                  className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition-all ${selectedCheatSuit === suit ? 'bg-rose-600 border-rose-400 text-white' : 'bg-black/50 border-white/20 text-white/80 hover:bg-white/5'}`}>
                  <SuitSvg suit={suit} className="w-5 h-5" />
                  <span className="text-[10px] font-bold">{SUIT_NAME[suit]}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button disabled={selectedCheatPlayer === null || selectedCheatSuit === null}
                onClick={() => {
                  playTapSound();
                  if (selectedCheatPlayer !== null && selectedCheatSuit !== null && onReportCheat) {
                    onReportCheat(selectedCheatPlayer, selectedCheatSuit);
                    setShowCheatModal(false);
                  }
                }}
                className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-black py-2 rounded-xl text-sm">تأكيد البلاغ</Button>
              <Button variant="outline" onClick={() => setShowCheatModal(false)} className="bg-neutral-900 border-neutral-600 text-white hover:bg-neutral-800 hover:text-white">إلغاء</Button>
            </div>
          </Modal>
        )}

        {showSettings && (
          <Modal onClose={() => setShowSettings(false)} title="إعدادات 187">
            <label className="text-xs text-amber-200/80 block mb-1.5 font-bold text-right">سرعة اللعب:</label>
            <div className="grid grid-cols-3 gap-1.5 mb-4">
              {SPEED_LABELS.map((s) => (
                <Button key={s.id} type="button" onClick={() => { playTapSound(); setBotSpeed(s.id); }}
                  className={`py-2 rounded-xl text-xs font-black border transition-all cursor-pointer ${settings.botSpeed === s.id ? 'bg-amber-400 text-black border-amber-300' : 'bg-neutral-900 text-neutral-300 border-neutral-800 hover:bg-neutral-800'}`}>
                  {s.label}
                </Button>
              ))}
            </div>
            <div className="flex items-center justify-between py-2.5 border-t border-neutral-800">
              <span className="text-xs text-amber-200/80 font-bold">المؤثرات الصوتية</span>
              <Button type="button" onClick={toggleSound} className="p-2 rounded-xl bg-neutral-900 text-amber-300 border border-neutral-700 cursor-pointer" aria-label="كتم/تشغيل الصوت">
                {settings.soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-neutral-500" />}
              </Button>
            </div>
            <div className="flex items-center justify-between py-2.5 border-t border-neutral-800">
              <span className="text-xs text-amber-200/80 font-bold">اتجاه الشاشة</span>
              <Button type="button" onClick={() => { playTapSound(); toggleOrientationPreference(); }} className="px-3 py-1.5 rounded-xl bg-neutral-900 text-amber-300 border border-neutral-700 text-xs font-black cursor-pointer">
                {orientation === 'landscape' ? 'أفقي' : 'عمودي'}
              </Button>
            </div>
            {onRestart && (
              <label className="flex items-center justify-between py-2.5" htmlFor="187-card-sound"><span>صوت إنزال البطاقات</span><input id="187-card-sound" type="checkbox" checked={settings.cardPlacementSoundEnabled} onChange={e => updateSettings({ cardPlacementSoundEnabled: e.target.checked })} /></label>
            )}
            {onRestart && (
              <div className="mt-3 pt-3 border-t border-neutral-800">
                <Button type="button" onClick={() => { playTapSound(); onRestart(); setShowSettings(false); }}
                  className="w-full py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-xs font-black text-amber-200 border border-amber-400/40 cursor-pointer">
                  إعادة تشغيل (187 - ٥ لاعبين)
                </Button>
              </div>
            )}
          </Modal>
        )}

        {showSheet && (
          <Modal onClose={() => setShowSheet(false)} title={`النشرة — الجولة ${state.roundNo}`}>
            <div className="grid grid-cols-3 gap-2 text-center mb-3">
              <div className="rounded-xl bg-black/50 border border-white/10 p-2"><span className="block text-[10px] text-amber-200/70 font-bold">الحاكم</span><b className="text-sm">{state.bidderSeat !== null ? name(state.bidderSeat) : '—'}</b></div>
              <div className="rounded-xl bg-black/50 border border-white/10 p-2"><span className="block text-[10px] text-amber-200/70 font-bold">القيد</span><b className="text-sm">{state.highBid ?? '—'}</b></div>
              <div className="rounded-xl bg-black/50 border border-white/10 p-2"><span className="block text-[10px] text-amber-200/70 font-bold">الحكم</span><b className="text-sm flex items-center justify-center gap-1">{state.trump ? <><SuitSvg suit={state.trump} className="w-4 h-4" />{SUIT_NAME[state.trump]}</> : '—'}</b></div>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="rounded-xl bg-cyan-950/70 border border-cyan-500/40 p-2 text-center"><span className="block text-[10px] text-cyan-300 font-black">نقاط الحاكم</span><b className="text-xl">{state.hakemPoints}</b>{hakemNeeds !== null && <small className="block text-[10px] text-cyan-200/80">يحتاج {hakemNeeds}</small>}</div>
              <div className="rounded-xl bg-rose-950/70 border border-rose-500/40 p-2 text-center"><span className="block text-[10px] text-rose-300 font-black">نقاط الخصوم</span><b className="text-xl">{state.opponentsPoints}</b>{oppNeeds !== null && <small className="block text-[10px] text-rose-200/80">يحتاجون {oppNeeds}</small>}</div>
            </div>
            <ul className="text-xs space-y-1">
              {state.players.map((p) => (
                <li key={p.seatIndex} className="flex justify-between rounded-lg bg-black/40 px-2 py-1">
                  <span>{p.name}{p.seatIndex === state.bidderSeat ? ' 👑' : ''}</span>
                  <span className="text-amber-200">{state.tricksWon[p.seatIndex]} أكلات</span>
                </li>
              ))}
            </ul>
          </Modal>
        )}

        {showRules && (
          <Modal onClose={() => setShowRules(false)} title="قوانين 187">
            <ul className="text-xs leading-6 text-right list-disc pr-4 text-white/85">
              <li>٥ لاعبين، لكل لاعب ٧ أوراق و٥ أوراق على الطاولة.</li>
              <li>المزايدة على القيد من ٧٥ إلى ١٨٥، وكل رفعة ٥ نقاط. إذا طاف الكل يُلزم آخر لاعب بـ ٧٥.</li>
              <li>الفائز بالمزايدة هو الحاكم: يأخذ أوراق الطاولة ويعطي كل خصم ورقة واحدة، ثم يختار الحكم.</li>
              <li>نقاط الأوراق: ٢ كلفس = ٢٥، أي ٢ = ١٠، الآكة = ١١، الشايب والبنت والولد = ٤، العشرة = ١٠. المجموع ١٨٧.</li>
              <li>ترتيب القوة: ٢ ثم الآكة ثم الشايب ثم البنت ثم الولد ثم ١٠ إلى ٦.</li>
              <li>يلزم اتباع نوع الأكلة. اللاعب على يمين الحاكم لا يقطع بالحكم في الأكلة الأولى إلا إذا كانت كل أوراقه حكماً.</li>
              <li>يفوز الخصوم الأربعة إذا جمعوا ١٨٧ ناقص القيد أو أكثر، وإلا يفوز الحاكم.</li>
            </ul>
          </Modal>
        )}

        {state.phase === 'ROUND_END' && (
          <Modal>
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-black mx-auto mb-2 shadow-xl">
              <Flame className="w-6 h-6 fill-current" />
            </div>
            <h2 className="text-lg font-black text-amber-300">
              {state.winner ? (state.winner === 'HAKEM' ? 'فاز الحاكم بالجولة' : 'فاز الخصوم بالجولة') : `نهاية الجولة ${state.roundNo}`}
            </h2>
            {state.lastCheatVerdict && <p className="text-xs text-rose-200 mt-1">{state.lastCheatVerdict.announcement}</p>}
            <p className="text-xs text-amber-200/70 mt-0.5 font-medium">
              الحاكم: <b className="text-white">{name(state.bidderSeat ?? 0)}</b> | القيد: <b className="text-amber-300">{state.highBid}</b>
            </p>
            <div className="grid grid-cols-2 gap-2 my-3">
              <div className="bg-cyan-950/80 border border-cyan-500/40 rounded-2xl p-2"><span className="text-[10px] text-cyan-300 block font-black">نقاط الحاكم</span><span className="text-2xl font-black text-white">{state.hakemPoints}</span></div>
              <div className="bg-rose-950/80 border border-rose-500/40 rounded-2xl p-2"><span className="text-[10px] text-rose-300 block font-black">نقاط الخصوم</span><span className="text-2xl font-black text-white">{state.opponentsPoints}</span></div>
            </div>
            <Button onClick={() => { playTapSound(); onNextRound(); }}
              className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-black py-2.5 rounded-2xl text-sm shadow-xl cursor-pointer flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4" />
              <span>الجولة التالية ({state.roundNo + 1})</span>
            </Button>
          </Modal>
        )}

        {state.phase === 'GAME_END' && (
          <Modal>
            <div className="w-14 h-14 rounded-3xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-black mx-auto mb-3 shadow-2xl">
              <Trophy className="w-8 h-8 fill-current" />
            </div>
            <h2 className="text-2xl font-black text-amber-300">
              {state.winner === 'HAKEM' ? 'فاز الحاكم بالمباراة! 🏆' : 'فاز الخصوم بالمباراة! 🏆'}
            </h2>
            <div className="bg-black/60 border border-amber-400/30 rounded-2xl p-3 my-4 flex justify-around">
              <div><span className="text-[11px] text-cyan-300 block font-bold">الحاكم</span><span className="text-2xl font-black text-white">{state.hakemPoints}</span></div>
              <span className="text-xl font-black text-amber-400/60">:</span>
              <div><span className="text-[11px] text-rose-300 block font-bold">الخصوم</span><span className="text-2xl font-black text-white">{state.opponentsPoints}</span></div>
            </div>
            {onRestart && <Button className="w-full mb-2" onClick={onRestart}><RotateCcw />إعادة اللعب</Button>}
            <Button onClick={() => { playTapSound(); onExit(); }}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 text-black font-black text-sm shadow-xl cursor-pointer flex items-center justify-center gap-2">
              <RotateCcw className="w-4 h-4" />
              <span>العودة إلى القائمة</span>
            </Button>
          </Modal>
        )}
      </div>
    </div>
  );
};

/** Centered dialog inside the game stage. */
function Modal({ children, onClose, title, tone = 'amber' }: { children: React.ReactNode; onClose?: () => void; title?: string; tone?: 'amber' | 'cyan' | 'rose' }) {
  const border = tone === 'cyan' ? 'border-cyan-400' : tone === 'rose' ? 'border-rose-500' : 'border-amber-500/60';
  return (
    <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3">
      <div className={`relative bg-neutral-950 border-2 ${border} rounded-3xl p-4 max-w-sm w-full max-h-[94%] overflow-y-auto text-center shadow-2xl text-amber-50`}>
        {(title || onClose) && (
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-amber-500/25">
            <h3 className="text-sm font-black text-amber-300">{title}</h3>
            {onClose && (
              <button type="button" onClick={() => { playTapSound(); onClose(); }} className="w-7 h-7 rounded-full bg-neutral-800 text-white flex items-center justify-center" aria-label="إغلاق">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/** Hakem's hand while giving away 4 cards: same fan and card look as the play hand; tap toggles a card. */
function DiscardFan({ cards, selected, onToggle }: { cards: Card187[]; selected: string[]; onToggle: (id: string) => void }) {
  const suitOrder: Record<string, number> = { S: 0, H: 1, C: 2, D: 3 };
  const sorted = [...cards].sort((a, b) => (suitOrder[a.suit] - suitOrder[b.suit]) || b.rank - a.rank);
  const count = sorted.length;
  const box = useRef<HTMLDivElement>(null);
  const [fanW, setFanW] = useState(520);
  const [cardW, setCardW] = useState(76);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      setFanW(el.clientWidth - 24);
      const c = el.querySelector<HTMLElement>('.playing-card');
      if (c) setCardW(c.offsetWidth);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [count]);
  // Spread the cards across the available hand width (same rule as the play hand) so they never stack.
  const overlap = count > 1 ? Math.min(-12, (fanW - count * cardW) / (count - 1)) : 0;
  const fanStep = count > 1 ? Math.min(2.6, 22 / (count - 1)) : 0;
  return (
    <div ref={box} dir="ltr" className="relative w-full flex flex-col items-center justify-center pt-3 pb-2 px-1 select-none overflow-visible">
      <div className="relative flex items-end justify-center hand-fan-height">
        {sorted.map((card, index) => {
          const n = index - (count - 1) / 2;
          const isSelected = selected.includes(card.id);
          return (
            <div
              key={card.id}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              aria-label={`ورقة ${index + 1}`}
              onClick={() => onToggle(card.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(card.id); } }}
              className="hand-card-slot origin-bottom will-change-transform outline-none cursor-pointer"
              style={{
                marginLeft: index === 0 ? 0 : `${overlap}px`,
                transform: isSelected ? 'translateY(-22px) rotate(0deg)' : `rotate(${n * fanStep}deg) translateY(${n * n * 1.9}px)`,
                zIndex: index + 10,
                transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <Card card={{ id: card.id, suit: card.suit, rank: card.rank }} faceUp isSelected={isSelected} size="md" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Table187;
