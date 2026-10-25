import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { GameState, Card as CardType, Suit, TrickPlay } from '../types/kout';
import { Card, SuitSvg, JokerSvg } from './Card';
import { Hand } from './Hand';
import { Crown, MessageSquare, X, Hand as PassHand } from 'lucide-react';
import { Button } from './ui/button';
import { playBubbleSound, playTapSound } from '../utils/audio';
import shemagh from '../assets/gameplay/shemagh-player.png.asset.json';
import elder from '../assets/gameplay/elder-player.png.asset.json';
import green from '../assets/gameplay/green-player.png.asset.json';
import stone from '../assets/gameplay/stone-clean.png.asset.json';
import { playReferenceAudio, stopReferenceAudio } from '../utils/referenceAudio';
import { playCharacterVoice, subscribeCharacterVoice } from '../utils/characterAudio';
import { CHARACTER_PHRASES, SPECIAL_LINES, RESULT_LINES, specialPlay, type SpecialPlay } from '../utils/gamePresentation';
export interface TableProps {
 state?: GameState; mySeat?: number; onPlayCard?: (card: CardType) => void; onBid?: (bid: number) => void; onDeclareTrump?: (suit: Suit) => void;
 displayedTrick?: TrickPlay[]; winningTrickPlay?: TrickPlay | null; trickWinnerAnnouncement?: string | null;
 speechBubbles?: Record<number,string>; legalCardIds?: Set<string>; onSendSpeechBubble?: (message:string)=>void; headerControls?: React.ReactNode; className?: string;
}
const portraits = [elder.url, shemagh.url, elder.url, green.url, elder.url, shemagh.url];
export const KUWAITI_PHRASES = CHARACTER_PHRASES;
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

export const Table: React.FC<TableProps> = ({ state = MOCK_TABLE_STATE, mySeat = 0, onPlayCard, displayedTrick, winningTrickPlay, trickWinnerAnnouncement, speechBubbles = {}, legalCardIds, onSendSpeechBubble, headerControls, className = '' }) => {
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
 const react = (seat: number, message: string) => {
   setReactions(current => ({ ...current, [seat]: message }));
   playCharacterVoice(message, seat);
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
 useEffect(() => () => { stopReferenceAudio(); reactionTimers.current.forEach(clearTimeout); }, []);
 useEffect(() => {
   for (const [seat, message] of Object.entries(speechBubbles)) {
     if (previousSpeech.current[Number(seat)] !== message) playCharacterVoice(message, Number(seat));
   }
   previousSpeech.current = speechBubbles;
 }, [speechBubbles]);
 useEffect(() => {
   if (previousRound.current !== state.roundNo || (state.phase === 'BID' && state.bids.length === 0)) {
     seenPlays.current.clear(); previousRound.current = state.roundNo;
     setReactions({}); setSlam(null); resultPlayed.current = null;
   }
   for (const play of trick) {
     if (seenPlays.current.has(play.card.id)) continue;
     seenPlays.current.add(play.card.id);
     const kind = specialPlay(play.card, state.trump);
     if (kind) {
       setSlam({ id: play.card.id, kind, suit: play.card.suit });
       playReferenceAudio('trump');
       react(play.seat, SPECIAL_LINES[kind]);
       const timer = setTimeout(() => {
         setSlam(current => current?.id === play.card.id ? null : current);
         reactionTimers.current.delete(timer);
       }, 1100);
       reactionTimers.current.add(timer);
     } else if (play.card.rank === 13 && play.seat !== mySeat) {
       react(play.seat, CHARACTER_PHRASES[3]);
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
   react((mySeat + 2) % count, won ? RESULT_LINES.win : RESULT_LINES.lose);
   if (!won) {
     const timer = setTimeout(() => { react((mySeat + 1) % count, RESULT_LINES.opponent); reactionTimers.current.delete(timer); }, 3600);
     reactionTimers.current.add(timer);
   }
 }, [state.phase, state.roundNo]);
 const bubble = (seat: number) => reactions[seat] || speechBubbles[seat];
 const myTurn = state.currentSeat === mySeat && state.phase === 'PLAY';
 const name = (seat:number) => state.players?.[seat]?.name || `لاعب ${seat + 1}`;
 const active = state.phase === 'TRUMP' ? state.bidderSeat : state.currentSeat;
 return <div dir="rtl" className={`reference-game ${className}`}>
   <header className="reference-scorebar" dir="ltr">
     <div className="reference-score team-red"><span>لنا</span><strong>{state.scores[0]}</strong><span>{state.tricksWon[0]}</span></div>
     <span className="reference-round">iKout · {state.roundNo} / {state.targetScore}</span>
     <div className="reference-score team-blue"><span>{state.tricksWon[1]}</span><strong>{state.scores[1]}</strong><span>لهم</span></div>
   </header>
   <section className="reference-arena table-felt" aria-label="طاولة كوت" style={{ backgroundImage: `url(${stone.url})` }}>
     <div className="reference-disc" aria-hidden="true"><div className="reference-rosette" /></div>
     <div className="reference-trump">{state.trump && <><SuitSvg suit={state.trump} className="w-5 h-5" /><strong>{state.highBid}</strong></>}</div>
     {Array.from({ length: count }, (_, seat) => {
       if (seat === mySeat) return null;
       const relative = (seat - mySeat + count) % count;
       const bid = state.bids.find(b => b.seat === seat)?.bid;
       return <div key={seat} className={`reference-seat seat-${count}-${relative} ${seat % 2 === mySeat % 2 ? 'seat-team' : 'seat-opponent'} ${active === seat ? 'seat-active' : ''} ${speakingSeat === seat ? 'seat-speaking' : ''}`}>
         <span className="reference-player-name">{name(seat)}</span>
         <div className="reference-seat-row">
           <img className="reference-portrait" src={portraits[seat % portraits.length]} alt={name(seat)} />
           {bid !== undefined && state.phase === 'BID' ? <span className="reference-bid-badge">{bid || <PassHand size={18}/>}</span> : <div className="reference-opponent-hand" aria-label={`${state.hands[seat]?.length ?? 0} أوراق`}>
             {Array.from({ length: state.hands[seat]?.length ?? 0 }, (_, i) => <div key={i} className="reference-mini-back" style={{ transform: `rotate(${(i - ((state.hands[seat]?.length ?? 0) - 1) / 2) * 8}deg)` }} />)}
           </div>}
           {state.bidderSeat === seat && <Crown className="reference-crown w-4 h-4" />}
         </div>
         <AnimatePresence>{bubble(seat) && <motion.div key={bubble(seat)} className="reference-speech" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{bubble(seat)}</motion.div>}</AnimatePresence>
       </div>;
     })}
     <div className="reference-trick" aria-label="الأوراق على الطاولة">
       <AnimatePresence>{trick.map((play, i) => {
         const relative = (play.seat - mySeat + count) % count;
         const angle = relative * Math.PI * 2 / count;
         const winnerAngle = ((winningTrickPlay?.seat ?? play.seat) - mySeat + count) % count * Math.PI * 2 / count;
         return <motion.div key={play.card.id} className={`reference-trick-card ${winningTrickPlay?.card.id === play.card.id ? 'trick-winning' : ''}`} style={{ zIndex: i + 1 }} initial={reducedMotion ? false : { x: Math.sin(angle) * 240, y: Math.cos(angle) * 190, scale: .8, opacity: 0 }} animate={{ x: Math.sin(angle) * 70, y: Math.cos(angle) * 62, rotate: (relative % 2 ? -1 : 1) * 6, scale: 1, opacity: 1 }} exit={{ x: Math.sin(winnerAngle) * 260, y: Math.cos(winnerAngle) * 190, scale: .2, opacity: 0 }} transition={{ duration: reducedMotion ? 0 : .28, ease: 'easeOut' }}><Card card={play.card} size="sm" /></motion.div>;
       })}</AnimatePresence>
        {trickWinnerAnnouncement && <span className="reference-winner">{trickWinnerAnnouncement}</span>}
      </div>
             <AnimatePresence>{slam && <motion.div key={slam.id} className={`reference-slam slam-${slam.kind}`} initial={reducedMotion ? false : { scale: .35, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ scale: 1.2, opacity: 0 }} transition={{ duration: reducedMotion ? 0 : .32 }}>
         <div className="reference-slam-ring" />
         <div className="reference-slam-symbol">{slam.kind === 'trump-ace' && slam.suit ? <SuitSvg suit={slam.suit} className="reference-slam-icon" /> : <JokerSvg isRed={slam.kind === 'joker'} className="reference-slam-joker" />}</div>
         <strong>{slam.kind === 'joker' ? 'الجيكر' : slam.kind === 'maker' ? 'الميكر' : 'أكة الحكم'}</strong>
       </motion.div>}</AnimatePresence>
<div className="reference-local-hand"><Hand cards={state.hands[mySeat] || []} trump={state.trump} legalCardIds={state.phase === 'PLAY' ? legalCardIds : undefined} isMyTurn={myTurn} onPlayCard={onPlayCard} cardSize="md" /></div>
     {chatOpen && <div className="reference-chat" dir="rtl"><Button variant="ghost" size="icon" aria-label="إغلاق التعليقات" onClick={()=>setChatOpen(false)}><X/></Button><div>{KUWAITI_PHRASES.map(phrase=><Button key={phrase} variant="ghost" onClick={()=>{playBubbleSound(); react(mySeat, phrase); onSendSpeechBubble?.(phrase); setChatOpen(false);}}>{phrase}</Button>)}</div></div>}
   </section>
   <footer className="reference-controlbar" dir="ltr">
     <div className="reference-tools">{headerControls}<Button variant="ghost" size="icon" aria-label="تعليقات الشخصيات" title="تعليقات الشخصيات" onClick={()=>{playTapSound();setChatOpen(v=>!v);}}><MessageSquare/></Button></div>
     {bubble(mySeat) && <span className="reference-local-speech" role="status">{bubble(mySeat)}</span>}
     <div className={`reference-local-player ${speakingSeat === mySeat ? 'seat-speaking' : ''}`}><span>{name(mySeat)}</span><img src={portraits[mySeat % portraits.length]} className="reference-portrait" alt={name(mySeat)}/></div>
   </footer>
 </div>;
};
export default Table;
