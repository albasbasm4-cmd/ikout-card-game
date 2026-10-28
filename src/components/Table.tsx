import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion } from 'motion/react';
import { GameState, Card as CardType, Suit, TrickPlay } from '../types/kout';
import { Card, SuitSvg, JokerSvg } from './Card';
import { Hand } from './Hand';
import { Crown, X, Hand as PassHand, Bot } from 'lucide-react';
import { CARD_FLIGHT_SECONDS, linearToScreen, peekCardLaunch } from '../utils/cardFlight';
import { Button } from './ui/button';
import { playBubbleSound, playTapSound } from '../utils/audio';
import { CHARACTER_IDS, characterFace, useProfile } from '../utils/profile';
import { playReferenceAudio, stopReferenceAudio } from '../utils/referenceAudio';
import { playCharacterVoice, playCharacterClip, subscribeCharacterVoice, preloadCharacterVoices, stopCharacterVoice } from '../utils/characterAudio';
import { characterPhrase, contextKeyForMessage, specialPlay, voiceSet, type CharacterId, type PhraseKey, type SpecialPlay } from '../utils/gamePresentation';
import { addXpForGame } from '../utils/xp';
// ظهر الأوراق في مراوح الخصوم: الأزرق المطابق للمرجع
const FAN_BACK = '/assets/ikout/cards/CardBack-BlueFlask.png';

export interface TableProps {
 state?: GameState; mySeat?: number; onPlayCard?: (card: CardType) => void; onBid?: (bid: number) => void; onDeclareTrump?: (suit: Suit) => void;
 displayedTrick?: TrickPlay[]; winningTrickPlay?: TrickPlay | null; trickWinnerAnnouncement?: string | null;
 speechBubbles?: Record<number,string>; legalCardIds?: Set<string>; onSendSpeechBubble?: (message:string)=>void; headerControls?: React.ReactNode; className?: string; localHandSeat?: number;
 /** Rendered inside the table surface (bid / trump pickers), like the reference. */
 centerOverlay?: React.ReactNode;
}

export const MOCK_TABLE_STATE: GameState = {
  variant: 'BO6',
  hands: [
    [
      { id: 'JOKER-RED', joker: 'RED' },
      { id: 'H-14', suit: 'H', rank: 14 },
      { id: 'H-13', suit: 'H', rank: 13 },
      { id: 'S-14', suit: 'S', rank: 14 },
      { id: 'D-10', suit: 'D', rank: 10 },
      { id: 'C-7', suit: 'C', rank: 7 },
    ],
    [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }, { id: 'c5' }],
    [{ id: 'c6' }, { id: 'c7' }, { id: 'c8' }, { id: 'c9' }, { id: 'c10' }],
    [{ id: 'c11' }, { id: 'c12' }, { id: 'c13' }, { id: 'c14' }, { id: 'c15' }],
    [{ id: 'c16' }, { id: 'c17' }, { id: 'c18' }, { id: 'c19' }, { id: 'c20' }],
    [{ id: 'c21' }, { id: 'c22' }, { id: 'c23' }, { id: 'c24' }, { id: 'c25' }],
  ],
  dealer: 3,
  currentSeat: 0,
  bids: [
    { seat: 4, bid: 0 },
    { seat: 5, bid: 0 },
    { seat: 0, bid: 6 },
    { seat: 1, bid: 0 },
    { seat: 2, bid: 0 },
    { seat: 3, bid: 0 },
  ],
  highBid: 6,
  bidderSeat: 0,
  trump: 'H',
  currentTrick: [
    { seat: 1, card: { id: 'H-8', suit: 'H', rank: 8 } },
    { seat: 2, card: { id: 'H-12', suit: 'H', rank: 12 } },
  ],
  trickHistory: Array.from({ length: 3 }, () => []),
  tricksWon: [2, 1],
  scores: [24, 18],
  phase: 'PLAY',
  roundNo: 2,
  targetScore: 51,
  version: 42,
  players: [
    { seatIndex: 0, kind: 'HUMAN_LOCAL', name: 'أنت', team: 0, connected: true },
    { seatIndex: 1, kind: 'AI_BOT', name: 'سالم', team: 1, connected: true },
    { seatIndex: 2, kind: 'AI_BOT', name: 'جراح (شريكك)', team: 0, connected: true },
    { seatIndex: 3, kind: 'AI_BOT', name: 'فهد', team: 1, connected: true },
    { seatIndex: 4, kind: 'AI_BOT', name: 'مبارك (شريكك)', team: 0, connected: true },
    { seatIndex: 5, kind: 'AI_BOT', name: 'طلال', team: 1, connected: true },
  ],
};

// خلايا الأوراق المنزلة: موضع ثابت لكل مقعد داخل صندوق سطح الطاولة (نسب مئوية قابلة للتعديل من مكان واحد)
// 1 أعلى اليسار، 2 أعلى الوسط، 3 أعلى اليمين، 4 أسفل اليسار، 5 أسفل الوسط (أنا)، 6 أسفل اليمين
export const TRICK_SLOTS: Record<number, { left: number; top: number }> = {
  1: { left: 26.1, top: 18.3 },
  2: { left: 43.1, top: 14 },
  3: { left: 60, top: 18.3 },
  4: { left: 26.1, top: 51.6 },
  5: { left: 43.1, top: 56 },
  6: { left: 60, top: 51.6 },
};
export const trickSlotFor = (relative: number, count: number): number => {
  if (relative === 0) return 5;
  if (count === 6) {
    if (relative === 3) return 2;
    if (relative === 4) return 1;
    if (relative === 5) return 4;
    if (relative === 2) return 3;
    return 6;
  }
  if (relative === 2) return 2;
  return relative === 3 ? 1 : 3;
};

export const Table: React.FC<TableProps> = ({ state = MOCK_TABLE_STATE, mySeat = 0, onPlayCard, displayedTrick, winningTrickPlay, trickWinnerAnnouncement, speechBubbles = {}, legalCardIds, onSendSpeechBubble, headerControls, className = '', localHandSeat, centerOverlay }) => {
 const profile = useProfile();
 // Stable per-seat characters: the human's profile character, bots drawn from the restored 36.
 const seatCharacters = useMemo<Record<number, CharacterId>>(() => {
   const map: Record<number, CharacterId> = { [mySeat]: profile.characterId };
   const pool = CHARACTER_IDS.filter(id => id !== profile.characterId);
   for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
   let next = 0;
   for (const player of state.players ?? []) {
     if (player.seatIndex === mySeat) continue;
     map[player.seatIndex] = pool[next++ % pool.length];
   }
   return map;
 }, [mySeat, profile.characterId, state.players]);
 const characterFor = (seat: number): CharacterId => seatCharacters[seat] ?? `a${(seat % CHARACTER_IDS.length) + 1}`;
 const portraitFor = (seat: number) => characterFace(characterFor(seat));
 const [chatOpen, setChatOpen] = useState(false);
 const [slam, setSlam] = useState<{ id: string; kind: SpecialPlay; suit?: Suit } | null>(null);
 const [reactions, setReactions] = useState<Record<number, string>>({});
 const [speakingSeat, setSpeakingSeat] = useState<number | null>(null);
 const reducedMotion = useReducedMotion();
 const previousSpeech = useRef<Record<number, string>>({});
 const seenPlays = useRef<Set<string>>(new Set());
 const previousRound = useRef(state.roundNo);
 const reactionTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
 const resultPlayed = useRef<string | null>(null);
 const count = state.variant === 'BO6' ? 6 : 4;
 const trick = displayedTrick ?? state.currentTrick;
 const visibleCards = useRef<Set<string>>(new Set());
 const phaseRef = useRef(state.phase);
 phaseRef.current = state.phase;
 const bubblesRef = useRef(speechBubbles);
 bubblesRef.current = speechBubbles;
 const reactionCause = useRef<Record<number, string>>({});
  const react = (seat: number, key: PhraseKey, token: string | null = null, valid: () => boolean = () => true) => {
   const message = characterPhrase(characterFor(seat), key);
   setReactions(current => ({ ...current, [seat]: message }));
   if (token) reactionCause.current[seat] = token; else delete reactionCause.current[seat];
   playCharacterVoice(characterFor(seat), key, seat, token, valid);
   const timer = setTimeout(() => {
     setReactions(current => {
       if (current[seat] !== message) return current;
       const next = { ...current }; delete next[seat]; return next;
     });
     reactionTimers.current.delete(timer);
   }, 3400);
   reactionTimers.current.add(timer);
 };
 useEffect(() => subscribeCharacterVoice(setSpeakingSeat), []);
 useEffect(() => { for (const play of trick) seenPlays.current.add(play.card.id); }, []);
 useEffect(() => { preloadCharacterVoices(profile.characterId); }, [profile.characterId]);
 // The chosen character greets the table when the first round opens.
 const welcomed = useRef(false);
 useEffect(() => {
   if (welcomed.current || state.phase !== 'BID') return;
   welcomed.current = true;
   react(mySeat, 'welcome', 'welcome', () => phaseRef.current === 'BID');
   const timer = setTimeout(() => reactionTimers.current.delete(timer), 3400);
   reactionTimers.current.add(timer);
 }, [state.phase]);
 useEffect(() => () => { stopReferenceAudio(); reactionTimers.current.forEach(clearTimeout); }, []);
 useEffect(() => {
   for (const [seat, message] of Object.entries(speechBubbles)) {
     if (message && previousSpeech.current[Number(seat)] !== message) {
       const clipCode = /^clip:(.+)$/.exec(message);
       if (clipCode) {
         const character = characterFor(Number(seat));
         const clip = voiceSet(character).chat.find(c => c.file === clipCode[1]);
         if (clip) {
           setReactions(current => ({ ...current, [Number(seat)]: clip.text }));
           reactionCause.current[Number(seat)] = `bubble-${seat}`;
           playCharacterClip(character, clip, Number(seat), `bubble-${seat}`, () => bubblesRef.current[Number(seat)] === message);
           const timer = setTimeout(() => {
             setReactions(current => { const next = { ...current }; delete next[Number(seat)]; return next; });
             reactionTimers.current.delete(timer);
           }, 3400);
           reactionTimers.current.add(timer);
         }
         continue;
       }
       const key = contextKeyForMessage(message);
       if (key) react(Number(seat), key, `bubble-${seat}`, () => bubblesRef.current[Number(seat)] === message);
     }
   }
   previousSpeech.current = speechBubbles;
 }, [speechBubbles]);
 useEffect(() => {
   if (previousRound.current !== state.roundNo || (state.phase === 'BID' && state.bids.length === 0)) {
     seenPlays.current.clear(); previousRound.current = state.roundNo;
     setReactions({}); setSlam(null); resultPlayed.current = null;
   }
   visibleCards.current = new Set(trick.map(play => play.card.id));
   // A card-triggered line must never outlive its card on the table.
   for (const [seat, token] of Object.entries(reactionCause.current)) {
     if (token.startsWith('card-') && !visibleCards.current.has(token.slice(5))) {
       stopCharacterVoice(token);
       delete reactionCause.current[Number(seat)];
       setReactions(current => { const next = { ...current }; delete next[Number(seat)]; return next; });
     }
   }
   const onTable = (id: string) => () => visibleCards.current.has(id);
   for (const play of trick) {
     if (seenPlays.current.has(play.card.id)) continue;
     seenPlays.current.add(play.card.id);
     const kind = specialPlay(play.card, state.trump);
     if (kind) {
       setSlam({ id: play.card.id, kind, suit: play.card.suit });
       playReferenceAudio('slam');
       react(play.seat, kind as PhraseKey, `card-${play.card.id}`, onTable(play.card.id));
       const timer = setTimeout(() => {
         setSlam(current => current?.id === play.card.id ? null : current);
         reactionTimers.current.delete(timer);
       }, 1100);
       reactionTimers.current.add(timer);
     }
   }
 }, [trick, state.trump, state.roundNo, state.phase]);
 useEffect(() => {
   if (state.phase !== 'ROUND_END' && state.phase !== 'GAME_END') return;
   const key = `${state.roundNo}-${state.phase}`;
   if (resultPlayed.current === key) return;
   resultPlayed.current = key;
   const bidderTeam = (state.bidderSeat ?? 0) % 2;
   const madeContract = state.tricksWon[bidderTeam] >= (state.highBid ?? 0);
   const won = state.phase === 'GAME_END'
     ? state.scores[mySeat % 2] >= state.targetScore || (state.roundNo === 1 && state.highBid === 9 && state.tricksWon[mySeat % 2] === 9)
     : (madeContract ? bidderTeam : 1 - bidderTeam) === mySeat % 2;
   const resultValid = () => phaseRef.current === 'ROUND_END' || phaseRef.current === 'GAME_END';
   if (state.phase === 'GAME_END') addXpForGame(won, state.highBid ?? 6);
   react((mySeat + 2) % count, won ? 'win' : 'lose', 'result', resultValid);
   if (!won) {
     const timer = setTimeout(() => { react((mySeat + 1) % count, 'opponent', 'result', resultValid); reactionTimers.current.delete(timer); }, 3600);
     reactionTimers.current.add(timer);
   }
 }, [state.phase, state.roundNo]);
 const bubble = (seat: number) => {
   // Bids, passes and trump calls are shown by the seat's badge (like the reference), not as text bubbles.
   const raw = speechBubbles[seat];
   const isCall = !!raw && /^(pass|bid:|trump:)/.test(raw);
   if (isCall && (!reactions[seat] || reactionCause.current[seat] === `bubble-${seat}`)) return undefined;
   if (reactions[seat]) return reactions[seat];
   const message = speechBubbles[seat];
   if (!message) return undefined;
   const clipCode = /^clip:(.+)$/.exec(message);
   if (clipCode) return voiceSet(characterFor(seat)).chat.find(c => c.file === clipCode[1])?.text ?? message;
   const key = contextKeyForMessage(message);
   return key ? characterPhrase(characterFor(seat), key) : message;
 };
 // مقعد اليد الظاهرة: افتراضاً مقعد المشاهد؛ في اللعب الجماعي (هوت سبوت) يتبع صاحب الدور
 const handSeat = localHandSeat ?? mySeat;
 const myTurn = state.currentSeat === handSeat && state.phase === 'PLAY';
 const name = (seat:number) => state.players?.[seat]?.name || `لاعب ${seat + 1}`;
 const active = state.phase === 'TRUMP' ? state.bidderSeat : state.currentSeat;

 const myTeam = mySeat % 2;
 const totalTricks = count === 6 ? 9 : 8;
 const bidderTeam = state.bidderSeat !== null && state.bidderSeat !== undefined ? state.bidderSeat % 2 : null;
 const needed = (team: number) => state.highBid && bidderTeam !== null ? (bidderTeam === team ? state.highBid : totalTricks - state.highBid + 1) : null;
 const myTricks = state.tricksWon[myTeam] ?? 0;
 const oppTricks = state.tricksWon[1 - myTeam] ?? 0;
 const seatPos = (relative: number): string => count === 6
   ? (['', 'R2', 'R1', 'T', 'L1', 'L2'][relative] ?? 'T')
   : (['', 'R', 'T', 'L'][relative] ?? 'T');
 const badgeFor = (seat: number): React.ReactNode => {
   if (state.phase === 'BID') {
     const bid = state.bids.find(b => b.seat === seat)?.bid;
     if (bid === undefined) return null;
     return bid ? <strong>{bid}</strong> : <PassHand className="kt-badge-hand" strokeWidth={2.4} />;
   }
   if (state.bidderSeat === seat && state.highBid && state.phase !== 'GAME_END') {
     return <><strong>{state.highBid}</strong>{state.trump && <SuitSvg suit={state.trump} className="kt-badge-suit" />}</>;
   }
   return null;
 };
 const isBot = (seat: number) => state.players?.[seat]?.kind === 'AI_BOT';

 return <div dir="rtl" className={`kt-root table-theme-${profile.table} card-theme-${profile.cards} ${centerOverlay ? 'kt-picking' : ''} ${className}`}>
  <section className="kt-arena" aria-label="طاولة كوت">
    <div className="kt-tools" dir="ltr">{headerControls}</div>

    <header className="kt-score" dir="ltr" aria-label="النتيجة">
      <div className="kt-score-top">
        <strong className="kt-c-team">{state.scores[myTeam]}</strong>
        <strong className="kt-score-limit" title="حد القيد">{state.targetScore}</strong>
        <strong className="kt-c-opp">{state.scores[1 - myTeam]}</strong>
      </div>
      <div className="kt-score-bottom">
        <span className="kt-c-team"><b>{myTricks}</b>{needed(myTeam) !== null && <small>/{needed(myTeam)}</small>}</span>
        <span className="kt-dots" aria-label="الأكلات">
          {Array.from({ length: totalTricks }, (_, i) => {
            const cls = i < myTricks ? 'dot-team' : i >= totalTricks - oppTricks ? 'dot-opp' : (i === myTricks && state.phase === 'PLAY') ? 'dot-now' : '';
            return <i key={i} className={cls} />;
          })}
        </span>
        <span className="kt-c-opp"><b>{oppTricks}</b>{needed(1 - myTeam) !== null && <small>/{needed(1 - myTeam)}</small>}</span>
      </div>
    </header>

    <div className="kt-table">
      <span className="kt-handle kt-handle-l" aria-hidden="true" /><span className="kt-handle kt-handle-r" aria-hidden="true" />
      <div className="kt-frame" aria-hidden="true"><div className="kt-surface" /></div>
      <span className="kt-plate kt-plate-top" aria-hidden="true" /><span className="kt-plate kt-plate-bottom" aria-hidden="true" />
      <div className="kt-trick" aria-label="الأوراق على الطاولة">
        <AnimatePresence>{trick.map((play, i) => {
          const relative = (play.seat - mySeat + count) % count;
          const slotDef = TRICK_SLOTS[trickSlotFor(relative, count)];
          const winnerRel = ((winningTrickPlay?.seat ?? play.seat) - mySeat + count) % count;
          const winSlot = TRICK_SLOTS[trickSlotFor(winnerRel, count)];
          const winning = winningTrickPlay?.card.id === play.card.id;
          return <TrickCard key={play.card.id} play={play} left={slotDef.left} top={slotDef.top} zIndex={winning ? 50 : i + 1} winning={winning}
            exitX={(winSlot.left - slotDef.left) * 4.67} exitY={(winSlot.top - slotDef.top) * 2.63} reducedMotion={!!reducedMotion} />;
        })}</AnimatePresence>
        {trickWinnerAnnouncement && <span className="kt-winner">{trickWinnerAnnouncement}</span>}
      </div>
      {centerOverlay && <div className="kt-center">{centerOverlay}</div>}
    </div>

    {Array.from({ length: count }, (_, seat) => {
      if (seat === mySeat) return null;
      const relative = (seat - mySeat + count) % count;
      const pos = seatPos(relative);
      const side = pos.startsWith('L') ? 'left' : pos.startsWith('R') ? 'right' : 'top';
      const badge = badgeFor(seat);
      const held = state.hands[seat]?.length ?? 0;
      const fanMid = (held - 1) / 2;
      return <div key={seat} data-seat-origin={seat} className={`kt-seat kt-pos-${pos} kt-side-${side} ${seat % 2 === myTeam ? 'kt-team' : 'kt-opp'} ${active === seat ? 'kt-active' : ''} ${speakingSeat === seat ? 'kt-speaking' : ''}`}>
        <div className="kt-avatar"><img src={portraitFor(seat)} alt={name(seat)} draggable={false} /></div>
        {state.bidderSeat === seat && state.phase !== 'BID' && <Crown className="kt-crown" />}
        <div className="kt-name">{isBot(seat) && <Bot className="kt-bot" />}<span>{name(seat)}</span></div>
        {held > 0 && <div className={`kt-fan kt-fan-${side}`} aria-label={`${held} أوراق`}>
          <div className="kt-fan-ring">
            {Array.from({ length: held }, (_, i) => <span key={i} className="kt-mini" style={{ '--r': `${(i - fanMid) * 3}deg` } as React.CSSProperties}><img src={FAN_BACK} alt="" draggable={false} /></span>)}
          </div>
        </div>}
        {badge && <span className="kt-badge">{badge}</span>}
        <AnimatePresence>{bubble(seat) && <motion.div key={bubble(seat)} className="kt-speech" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{bubble(seat)}</motion.div>}</AnimatePresence>
      </div>;
    })}

    <AnimatePresence>{slam && <motion.div key={slam.id} className={`reference-slam slam-${slam.kind}`} initial={reducedMotion ? false : { scale: .35, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ scale: 1.2, opacity: 0 }} transition={{ duration: reducedMotion ? 0 : .32 }}>
      <div className="reference-slam-ring" />
      <div className="reference-slam-symbol">{slam.kind === 'trump-ace' && slam.suit ? <SuitSvg suit={slam.suit} className="reference-slam-icon" /> : <JokerSvg isRed={slam.kind === 'joker'} className="reference-slam-joker" />}</div>
      <strong>{slam.kind === 'joker' ? 'الجيكر' : slam.kind === 'maker' ? 'الميكر' : 'أكة الحكم'}</strong>
    </motion.div>}</AnimatePresence>

    <div className="kt-hand"><Hand cards={(handSeat !== undefined ? state.hands[handSeat] : state.hands[mySeat]) || []} trump={state.trump} legalCardIds={state.phase === 'PLAY' ? legalCardIds : undefined} isMyTurn={myTurn} onPlayCard={onPlayCard} cardSize="md" cardStep={37} /></div>

    <div data-seat-origin={mySeat} className={`kt-local kt-team ${active === mySeat ? 'kt-active' : ''} ${speakingSeat === mySeat ? 'kt-speaking' : ''}`}>
      <AnimatePresence>{bubble(mySeat) && <motion.div key={bubble(mySeat)} className="kt-speech" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{bubble(mySeat)}</motion.div>}</AnimatePresence>
      <div className="kt-avatar kt-chat-trigger" role="button" tabIndex={0} title="رسائل الدردشة" aria-label="رسائل الدردشة" onClick={()=>{playTapSound();setChatOpen(v=>!v);}} onKeyDown={(e)=>{ if (e.key === 'Enter') { playTapSound(); setChatOpen(v=>!v); } }}><img src={portraitFor(mySeat)} alt={name(mySeat)} draggable={false} /></div>
      {state.bidderSeat === mySeat && state.phase !== 'BID' && <Crown className="kt-crown" />}
      {badgeFor(mySeat) && <span className="kt-badge">{badgeFor(mySeat)}</span>}
      <div className="kt-name">{isBot(mySeat) && <Bot className="kt-bot" />}<span>{name(mySeat)}</span></div>
    </div>

    {chatOpen && <div className="kt-chat" dir="rtl"><Button variant="ghost" size="icon" aria-label="إغلاق التعليقات" onClick={()=>setChatOpen(false)}><X/></Button><div>{voiceSet(characterFor(mySeat)).chat.filter(clip => clip.text && clip.text.trim()).map(clip => <Button key={clip.file} variant="ghost" onClick={()=>{playBubbleSound(); setReactions(current => ({ ...current, [mySeat]: clip.text })); playCharacterClip(characterFor(mySeat), clip, mySeat); onSendSpeechBubble?.(`clip:${clip.file}`); setChatOpen(false);}}>{clip.text}</Button>)}</div></div>}
  </section>
 </div>;
};

interface TrickCardProps { play: TrickPlay; left: number; top: number; zIndex: number; winning: boolean; exitX: number; exitY: number; reducedMotion: boolean }

/**
 * A card on the table. On mount it flies from where it came from — the exact
 * spot the local player released/tapped it, or the bot's avatar — to its slot.
 * Pure presentation: engine timing and rules are untouched.
 */
function TrickCard({ play, left, top, zIndex, winning, exitX, exitY, reducedMotion }: TrickCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const rotate = useMotionValue(0);
  const opacity = useMotionValue(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || started.current || reducedMotion) return;
    started.current = true;
    const own = el.getBoundingClientRect();
    if (!own.width) return;
    const launch = peekCardLaunch(play.card.id);
    let src: { cx: number; cy: number; w: number; rot: number; fade: boolean } | null = null;
    if (launch) {
      src = { cx: launch.rect.left + launch.rect.width / 2, cy: launch.rect.top + launch.rect.height / 2, w: launch.rect.width, rot: launch.rotate, fade: false };
    } else {
      const origin = el.closest('.kt-root')?.querySelector(`[data-seat-origin="${play.seat}"] .kt-avatar`);
      if (origin) {
        const r = origin.getBoundingClientRect();
        src = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: own.width * 0.55, rot: 0, fade: true };
      }
    }
    if (!src) return;
    const inv = linearToScreen(el.parentElement).inverse();
    const d = inv.transformPoint(new DOMPoint(src.cx - (own.left + own.width / 2), src.cy - (own.top + own.height / 2)));
    x.set(d.x); y.set(d.y); scale.set(Math.max(0.3, Math.min(2.2, src.w / own.width))); rotate.set(src.rot - 14 * Math.sign(d.x || 1));
    if (src.fade) opacity.set(0.2);
    const opts = { duration: CARD_FLIGHT_SECONDS, ease: [0.22, 1, 0.36, 1] as const };
    animate(x, 0, opts); animate(y, 0, opts); animate(scale, 1, opts); animate(rotate, 0, opts);
    if (src.fade) animate(opacity, 1, { duration: CARD_FLIGHT_SECONDS * 0.4 });
  }, []);
  return <motion.div ref={ref} className={`kt-trick-card ${winning ? 'kt-trick-winning' : ''}`}
    style={{ left: `${left}%`, top: `${top}%`, zIndex, x, y, scale, rotate, opacity }}
    exit={{ x: exitX, y: exitY, scale: .35, opacity: 0, transition: { duration: .4, ease: 'easeIn' } }}>
    <Card card={play.card} size="sm" />
  </motion.div>;
}

export default Table;
