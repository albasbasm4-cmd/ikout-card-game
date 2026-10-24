import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { GameState, Card as CardType, Suit, TrickPlay } from '../types/kout';
import { Card, SuitSvg } from './Card';
import { Hand } from './Hand';
import { Crown, MessageSquare, X, Hand as PassHand } from 'lucide-react';
import { Button } from './ui/button';
import { playBubbleSound, playTapSound } from '../utils/audio';
import shemagh from '../assets/gameplay/shemagh-player.png.asset.json';
import elder from '../assets/gameplay/elder-player.png.asset.json';
import green from '../assets/gameplay/green-player.png.asset.json';
import stone from '../assets/gameplay/stone-clean.png.asset.json';
import { playReferenceAudio, stopReferenceAudio } from '../utils/referenceAudio';
export interface TableProps {
 state?: GameState; mySeat?: number; onPlayCard?: (card: CardType) => void; onBid?: (bid: number) => void; onDeclareTrump?: (suit: Suit) => void;
 displayedTrick?: TrickPlay[]; winningTrickPlay?: TrickPlay | null; trickWinnerAnnouncement?: string | null;
 speechBubbles?: Record<number,string>; legalCardIds?: Set<string>; onSendSpeechBubble?: (message:string)=>void; headerControls?: React.ReactNode; className?: string;
}
const portraits = [elder.url, shemagh.url, elder.url, green.url, elder.url, shemagh.url];
export const KUWAITI_PHRASES = ['كفو عليك يا شريكي!', 'العب يا معوّد!', 'وين الأكة؟!', 'الشايب نزل!', 'يا ساتر!', 'كوت بوستة!', 'طاف يا رجال', 'استكانة شاي'];
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
 const [trumpSlam, setTrumpSlam] = useState<{ id: string; suit: Suit } | null>(null);
 const reducedMotion = useReducedMotion();
 const previousSpeech = useRef<Record<number, string>>({});
 const seenPlays = useRef<Set<string>>(new Set());
 useEffect(() => {
   for (const [seat, message] of Object.entries(speechBubbles)) {
     if (message === 'طاف' && previousSpeech.current[Number(seat)] !== message) playReferenceAudio('pass');
   }
   previousSpeech.current = speechBubbles;
 }, [speechBubbles]);
 useEffect(() => () => stopReferenceAudio(), []);
 const count = state.variant === 'BO6' ? 6 : 4;
 const trick = displayedTrick ?? state.currentTrick;
 useEffect(() => {
   for (const play of trick) {
     if (seenPlays.current.has(play.card.id)) continue;
     seenPlays.current.add(play.card.id);
     if (state.trump && play.card.rank === 14 && play.card.suit === state.trump) {
       setTrumpSlam({ id: play.card.id, suit: state.trump });
       playReferenceAudio('trump');
       setTimeout(() => setTrumpSlam(current => (current?.id === play.card.id ? null : current)), 1500);
     }
   }
 }, [trick, state.trump]);
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
       return <div key={seat} className={`reference-seat seat-${count}-${relative} ${seat % 2 === mySeat % 2 ? 'seat-team' : 'seat-opponent'} ${active === seat ? 'seat-active' : ''}`}>
         <span className="reference-player-name">{name(seat)}</span>
         <div className="reference-seat-row">
           <img className="reference-portrait" src={portraits[seat % portraits.length]} alt={name(seat)} />
           {bid !== undefined && state.phase === 'BID' ? <span className="reference-bid-badge">{bid || <PassHand size={18}/>}</span> : <div className="reference-opponent-hand" aria-label={`${state.hands[seat]?.length ?? 0} أوراق`}>
             {Array.from({ length: state.hands[seat]?.length ?? 0 }, (_, i) => <div key={i} className="reference-mini-back" style={{ transform: `rotate(${(i - ((state.hands[seat]?.length ?? 0) - 1) / 2) * 8}deg)` }} />)}
           </div>}
           {state.bidderSeat === seat && <Crown className="reference-crown w-4 h-4" />}
         </div>
         {speechBubbles[seat] && <div className="reference-speech">{speechBubbles[seat]}</div>}
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
      <AnimatePresence>{trumpSlam && <motion.div key={trumpSlam.id} className="reference-slam" initial={reducedMotion ? false : { scale: 0.1, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ duration: reducedMotion ? 0 : .45, ease: [0.16, 1, 0.3, 1] }}><SuitSvg suit={trumpSlam.suit} className="reference-slam-icon" /></motion.div>}</AnimatePresence>
     <div className="reference-local-hand"><Hand cards={state.hands[mySeat] || []} trump={state.trump} legalCardIds={state.phase === 'PLAY' ? legalCardIds : undefined} isMyTurn={myTurn} onPlayCard={onPlayCard} cardSize="md" /></div>
     {chatOpen && <div className="reference-chat" dir="rtl"><Button variant="ghost" size="icon" aria-label="إغلاق التعليقات" onClick={()=>setChatOpen(false)}><X/></Button><div>{KUWAITI_PHRASES.map(phrase=><Button key={phrase} variant="ghost" onClick={()=>{playBubbleSound(); onSendSpeechBubble?.(phrase); setChatOpen(false);}}>{phrase}</Button>)}</div></div>}
   </section>
   <footer className="reference-controlbar" dir="ltr">
     <div className="reference-tools">{headerControls}<Button variant="ghost" size="icon" aria-label="تعليقات الشخصيات" title="تعليقات الشخصيات" onClick={()=>{playTapSound();setChatOpen(v=>!v);}}><MessageSquare/></Button></div>
     {speechBubbles[mySeat] && <span className="reference-local-speech">{speechBubbles[mySeat]}</span>}
     <div className="reference-local-player"><span>{name(mySeat)}</span><img src={portraits[mySeat % portraits.length]} className="reference-portrait" alt={name(mySeat)}/></div>
   </footer>
 </div>;
};
export default Table;
