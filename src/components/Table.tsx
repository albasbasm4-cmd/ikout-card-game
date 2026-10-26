import React, { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { GameState, Card as CardType, Suit, TrickPlay } from "../types/kout";
import { Card, SuitSvg, JokerSvg } from "./Card";
import { Hand } from "./Hand";
import { Crown, MessageSquare, X, Hand as PassHand, ShieldAlert } from "lucide-react";
import { Button } from "./ui/button";
import { playBubbleSound, playTapSound } from "../utils/audio";
import shemagh from "../assets/gameplay/shemagh-player.png.asset.json";
import elder from "../assets/gameplay/elder-player.png.asset.json";
import green from "../assets/gameplay/green-player.png.asset.json";
import stone from "../assets/gameplay/stone-clean.png.asset.json";
import { playReferenceAudio, stopReferenceAudio } from "../utils/referenceAudio";
import {
  playCharacterVoice,
  subscribeCharacterVoice,
  registerSeatCharacters,
  preloadCharacterVoices,
  stopCharacterVoice,
  playEventVoice,
  type EventVoiceKey,
} from "../utils/characterAudio";
import {
  CHARACTER_PHRASES,
  SPECIAL_LINES,
  specialPlay,
  type SpecialPlay,
} from "../utils/gamePresentation";
import { SoundboardModal } from "./SoundboardModal";
import { characterPortrait } from "../utils/playerProfile";
export interface TableProps {
  state?: GameState;
  mySeat?: number;
  onPlayCard?: (card: CardType) => void;
  onBid?: (bid: number) => void;
  onDeclareTrump?: (suit: Suit) => void;
  displayedTrick?: TrickPlay[];
  winningTrickPlay?: TrickPlay | null;
  trickWinnerAnnouncement?: string | null;
  speechBubbles?: Record<number, string>;
  legalCardIds?: Set<string>;
  onSendSpeechBubble?: (message: string) => void;
  headerControls?: React.ReactNode;
  canCheatReport?: boolean;
  onCheatReport?: (accusedSeat: number, cardType: Suit | "JOKER" | "MAKER") => void;
  className?: string;
}
const portraits = [
  "/assets/ikout/images/avatar_shayib.png",
  "/assets/ikout/images/avatar_player1.png",
  "/assets/ikout/images/avatar_player2.png",
  "/assets/ikout/images/avatar_player3.png",
  "/assets/ikout/images/avatar_player4.png",
  "/assets/ikout/images/avatar_player5.png",
];
export const KUWAITI_PHRASES = CHARACTER_PHRASES;
export const MOCK_TABLE_STATE: GameState = {
  variant: "BO6",
  hands: [
    [
      { id: "JOKER-RED", joker: "RED" },
      { id: "H-14", suit: "H", rank: 14 },
      { id: "H-13", suit: "H", rank: 13 },
      { id: "S-14", suit: "S", rank: 14 },
      { id: "D-10", suit: "D", rank: 10 },
      { id: "C-7", suit: "C", rank: 7 },
    ],
    [{ id: "c1" }, { id: "c2" }, { id: "c3" }, { id: "c4" }, { id: "c5" }],
    [{ id: "c6" }, { id: "c7" }, { id: "c8" }, { id: "c9" }, { id: "c10" }],
    [{ id: "c11" }, { id: "c12" }, { id: "c13" }, { id: "c14" }, { id: "c15" }],
    [{ id: "c16" }, { id: "c17" }, { id: "c18" }, { id: "c19" }, { id: "c20" }],
    [{ id: "c21" }, { id: "c22" }, { id: "c23" }, { id: "c24" }, { id: "c25" }],
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
  trump: "H",
  currentTrick: [
    { seat: 1, card: { id: "H-8", suit: "H", rank: 8 } },
    { seat: 2, card: { id: "H-12", suit: "H", rank: 12 } },
  ],
  trickHistory: Array.from({ length: 3 }, () => []),
  tricksWon: [2, 1],
  scores: [24, 18],
  phase: "PLAY",
  roundNo: 2,
  targetScore: 51,
  version: 42,
  players: [
    { seatIndex: 0, kind: "HUMAN_LOCAL", name: "أنت", team: 0, connected: true },
    { seatIndex: 1, kind: "AI_BOT", name: "سالم", team: 1, connected: true },
    { seatIndex: 2, kind: "AI_BOT", name: "جراح (شريكك)", team: 0, connected: true },
    { seatIndex: 3, kind: "AI_BOT", name: "فهد", team: 1, connected: true },
    { seatIndex: 4, kind: "AI_BOT", name: "مبارك (شريكك)", team: 0, connected: true },
    { seatIndex: 5, kind: "AI_BOT", name: "طلال", team: 1, connected: true },
  ],
};

export const Table: React.FC<TableProps> = ({
  state = MOCK_TABLE_STATE,
  mySeat = 0,
  onPlayCard,
  displayedTrick,
  winningTrickPlay,
  trickWinnerAnnouncement,
  speechBubbles = {},
  legalCardIds,
  onSendSpeechBubble,
  headerControls,
  canCheatReport,
  onCheatReport,
  className = "",
}) => {
  const [chatOpen, setChatOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [accused, setAccused] = useState<number | null>(null);
  const [slam, setSlam] = useState<{ id: string; kind: SpecialPlay; suit?: Suit } | null>(null);
  const [trumpSlam, setTrumpSlam] = useState<Suit | null>(null);
  const prevTrump = useRef<Suit | null>(state.trump);
  const [reactions, setReactions] = useState<Record<number, string>>({});
  const [speakingSeat, setSpeakingSeat] = useState<number | null>(null);
  const reducedMotion = useReducedMotion();
  const previousSpeech = useRef<Record<number, string>>({});
  const seenPlays = useRef<Set<string>>(new Set());
  const previousRound = useRef(state.roundNo);
  const trumpKingSpokenRound = useRef<number | null>(null);
  const reactionTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const SUIT_AR: Record<Suit | "JOKER" | "MAKER", string> = {
    S: "سبيت",
    H: "هاص",
    D: "ديمن",
    C: "كلفس",
    JOKER: "الجيكر",
    MAKER: "الميكر",
  };

  const submitReport = (t: Suit | "JOKER" | "MAKER") => {
    if (accused == null) return;
    onCheatReport?.(accused, t);
    setReportOpen(false);
    setAccused(null);
  };
  const count = state.variant === "BO6" ? 6 : 4;
  const trick = displayedTrick ?? state.currentTrick;
  const visibleCards = useRef<Set<string>>(new Set());
  const phaseRef = useRef(state.phase);
  phaseRef.current = state.phase;
  const bubblesRef = useRef(speechBubbles);
  bubblesRef.current = speechBubbles;
  const reactionCause = useRef<Record<number, string>>({});
  const react = (
    seat: number,
    message: string,
    token: string | null = null,
    valid: () => boolean = () => true,
  ) => {
    setReactions((current) => ({ ...current, [seat]: message }));
    if (token) reactionCause.current[seat] = token;
    else delete reactionCause.current[seat];
    playCharacterVoice(message, seat, token, valid);
    const timer = setTimeout(() => {
      setReactions((current) => {
        if (current[seat] !== message) return current;
        const next = { ...current };
        delete next[seat];
        return next;
      });
      reactionTimers.current.delete(timer);
    }, 3400);
    reactionTimers.current.add(timer);
  };
  useEffect(() => subscribeCharacterVoice(setSpeakingSeat), []);
  useEffect(() => {
    if (state.players && state.players.length > 0) {
      registerSeatCharacters(state.players.map((p) => p.characterId));
    }
  }, [state.players]);
  useEffect(() => {
    preloadCharacterVoices();
    for (const play of trick) seenPlays.current.add(play.card.id);
  }, []);
  useEffect(
    () => () => {
      stopReferenceAudio();
      reactionTimers.current.forEach(clearTimeout);
    },
    [],
  );
  useEffect(() => {
    for (const [seat, message] of Object.entries(speechBubbles)) {
      if (message && previousSpeech.current[Number(seat)] !== message)
        playCharacterVoice(
          message,
          Number(seat),
          `bubble-${seat}`,
          () => bubblesRef.current[Number(seat)] === message,
        );
    }
    previousSpeech.current = speechBubbles;
  }, [speechBubbles]);
  useEffect(() => {
    if (
      previousRound.current !== state.roundNo ||
      (state.phase === "BID" && state.bids.length === 0)
    ) {
      seenPlays.current.clear();
      previousRound.current = state.roundNo;
      setReactions({});
      setSlam(null);
      reactionTimers.current.forEach(clearTimeout);
      reactionTimers.current.clear();
    }
    visibleCards.current = new Set(trick.map((play) => play.card.id));
    // A card-triggered line must never outlive its card on the table.
    for (const [seat, token] of Object.entries(reactionCause.current)) {
      if (token.startsWith("card-") && !visibleCards.current.has(token.slice(5))) {
        stopCharacterVoice(token);
        delete reactionCause.current[Number(seat)];
        setReactions((current) => {
          const next = { ...current };
          delete next[Number(seat)];
          return next;
        });
      }
    }
    const onTable = (id: string) => () => visibleCards.current.has(id);

    // Contextual sound design matched with Kuwaiti gameplay:
    // 1. Strong cards (Red Joker, Black Joker, Trump Ace): play character voice (joker/maker/ace) + slam visual
    // 2. Trump King: "الشايب نزل!" strictly once per round
    for (let i = 0; i < trick.length; i++) {
      const play = trick[i];
      if (seenPlays.current.has(play.card.id)) continue;
      seenPlays.current.add(play.card.id);

      const kind = specialPlay(play.card, state.trump);
      if (kind) {
        setSlam({ id: play.card.id, kind, suit: play.card.suit });
        const ev: EventVoiceKey = kind === "joker" ? "joker" : kind === "maker" ? "maker" : "ace";
        playEventVoice(ev, {
          seat: play.seat,
          token: `card-${play.card.id}`,
          isStillValid: onTable(play.card.id),
        });
        const timer = setTimeout(() => {
          setSlam((current) => (current?.id === play.card.id ? null : current));
          reactionTimers.current.delete(timer);
        }, 1100);
        reactionTimers.current.add(timer);
      } else if (
        state.trump &&
        play.card.suit === state.trump &&
        play.card.rank === 13 &&
        !play.card.joker &&
        trumpKingSpokenRound.current !== state.roundNo
      ) {
        // Trump King played: "الشايب نزل!" - exactly once per round
        trumpKingSpokenRound.current = state.roundNo;
        react(
          play.seat,
          CHARACTER_PHRASES[3],
          `trump-king-${state.roundNo}`,
          onTable(play.card.id),
        );
      }
    }
  }, [trick, state.trump, state.roundNo, state.phase]);

  // أنيميشن وصوت إعلان الحكم (هاص/سبيت/ديمن/كلفس) — يغطي البشر والبوتات
  useEffect(() => {
    if (state.trump && state.trump !== prevTrump.current) {
      setTrumpSlam(state.trump);
      playEventVoice(state.trump, { seat: state.bidderSeat ?? 0 });
      const t = setTimeout(() => {
        setTrumpSlam(null);
        reactionTimers.current.delete(t);
      }, 1300);
      reactionTimers.current.add(t);
    }
    prevTrump.current = state.trump;
  }, [state.trump, state.bidderSeat]);
  const bubble = (seat: number) => reactions[seat] || speechBubbles[seat];
  const myTurn = state.currentSeat === mySeat && state.phase === "PLAY";
  const name = (seat: number) => state.players?.[seat]?.name || `لاعب ${seat + 1}`;
  const active = state.phase === "TRUMP" ? state.bidderSeat : state.currentSeat;
  return (
    <div dir="rtl" className={`reference-game ${className}`}>
      <header className="reference-scorebar" dir="ltr">
        <div className="reference-score team-red">
          <span>لنا</span>
          <strong>{state.scores[0]}</strong>
          <span>{state.tricksWon[0]}</span>
        </div>
        <span className="reference-round">
          iKout · {state.roundNo} / {state.targetScore}
        </span>
        <div className="reference-score team-blue">
          <span>{state.tricksWon[1]}</span>
          <strong>{state.scores[1]}</strong>
          <span>لهم</span>
        </div>
      </header>
      <section className="reference-arena table-felt" aria-label="طاولة كوت">
        <div className="reference-disc" aria-hidden="true">
          <div className="reference-rosette">
            <div className="reference-table-emblem" />
          </div>
        </div>
        <AnimatePresence>
          {trumpSlam && (
            <motion.div
              key={`trump-${state.roundNo}-${state.trump}`}
              dir="ltr"
              className="trump-slam-overlay"
              initial={{ scale: 0.3, opacity: 0, rotate: -10 }}
              animate={{ scale: [0.3, 1.25, 1], opacity: [0, 1, 1], rotate: 0 }}
              exit={{ scale: 1.5, opacity: 0 }}
              transition={{ duration: 1.2 }}
            >
              <SuitSvg suit={trumpSlam} className="w-24 h-24" />
              <strong>{state.highBid ?? ""}</strong>
            </motion.div>
          )}
        </AnimatePresence>
        {state.contractDoubled && (
          <div className="cheat-verdict-banner">
            ⚠️ اللعبة دبل — الحكم {state.highBid} يحسب {state.doubledBid} نقطة
          </div>
        )}
        <div className="reference-trump">
          {state.trump && (
            <>
              <SuitSvg suit={state.trump} className="w-5 h-5" />
              <strong>{state.highBid}</strong>
            </>
          )}
        </div>
        {Array.from({ length: count }, (_, seat) => {
          if (seat === mySeat) return null;
          const relative = (seat - mySeat + count) % count;
          const bid = state.bids.find((b) => b.seat === seat)?.bid;
          return (
            <div
              key={seat}
              className={`reference-seat seat-${count}-${relative} ${seat % 2 === mySeat % 2 ? "seat-team" : "seat-opponent"} ${active === seat ? "seat-active" : ""} ${speakingSeat === seat ? "seat-speaking" : ""}`}
            >
              <span className="reference-player-name">{name(seat)}</span>
              <div className="reference-seat-row">
                <img
                  className="reference-portrait"
                  src={
                    state.players?.[seat]?.characterId
                      ? characterPortrait(state.players[seat].characterId!)
                      : portraits[seat % portraits.length]
                  }
                  alt={name(seat)}
                />
                {bid !== undefined && state.phase === "BID" ? (
                  <span className="reference-bid-badge">{bid || <PassHand size={18} />}</span>
                ) : (
                  <div
                    className="reference-opponent-hand"
                    aria-label={`${state.hands[seat]?.length ?? 0} أوراق`}
                  >
                    {Array.from({ length: state.hands[seat]?.length ?? 0 }, (_, i) => (
                      <div
                        key={i}
                        className="reference-mini-back"
                        style={{
                          transform: `rotate(${(i - ((state.hands[seat]?.length ?? 0) - 1) / 2) * 8}deg)`,
                        }}
                      />
                    ))}
                  </div>
                )}
                {state.bidderSeat === seat && <Crown className="reference-crown w-4 h-4" />}
              </div>
              <AnimatePresence>
                {bubble(seat) && (
                  <motion.div
                    key={bubble(seat)}
                    className="reference-speech"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    {bubble(seat)}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
        <div className="reference-trick" aria-label="الأوراق على الطاولة">
          <AnimatePresence>
            {trick.map((play, i) => {
              const relative = (play.seat - mySeat + count) % count;
              const angle = (relative * Math.PI * 2) / count;
              const winnerAngle =
                ((((winningTrickPlay?.seat ?? play.seat) - mySeat + count) % count) * Math.PI * 2) /
                count;
              return (
                <motion.div
                  key={play.card.id}
                  className={`reference-trick-card ${winningTrickPlay?.card.id === play.card.id ? "trick-winning" : ""} ${play.card.joker ? "joker-slam-animate" : ""}`}
                  style={{ zIndex: i + 1 }}
                  initial={
                    reducedMotion
                      ? false
                      : {
                          x: Math.sin(angle) * 240,
                          y: Math.cos(angle) * 190,
                          scale: 1.25,
                          rotateX: 55,
                          rotate: (relative % 2 ? -1 : 1) * 25,
                          opacity: 0,
                        }
                  }
                  animate={{
                    x: Math.sin(angle) * 70,
                    y: Math.cos(angle) * 62,
                    rotateX: 18,
                    rotate: (relative % 2 ? -1 : 1) * 6,
                    scale: 1,
                    opacity: 1,
                  }}
                  exit={{
                    x: Math.sin(winnerAngle) * 260,
                    y: Math.cos(winnerAngle) * 190,
                    scale: 0.3,
                    rotateX: 40,
                    opacity: 0,
                    transition: { duration: 0.35, ease: "easeIn" },
                  }}
                  transition={
                    reducedMotion
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 460, damping: 28, mass: 0.6 }
                  }
                >
                  <Card card={play.card} size="sm" />
                </motion.div>
              );
            })}
          </AnimatePresence>
          {trickWinnerAnnouncement && (
            <span className="reference-winner">{trickWinnerAnnouncement}</span>
          )}
        </div>
        <AnimatePresence>
          {slam && (
            <motion.div
              key={slam.id}
              className={`reference-slam slam-${slam.kind}`}
              initial={reducedMotion ? false : { scale: 0.35, opacity: 0, rotate: -12 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 1.2, opacity: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.32 }}
            >
              <div className="reference-slam-ring" />
              <div className="reference-slam-symbol">
                {slam.kind === "trump-ace" && slam.suit ? (
                  <SuitSvg suit={slam.suit} className="reference-slam-icon" />
                ) : (
                  <JokerSvg isRed={slam.kind === "joker"} className="reference-slam-joker" />
                )}
              </div>
              <strong>
                {slam.kind === "joker" ? "الجيكر" : slam.kind === "maker" ? "الميكر" : "أكة الحكم"}
              </strong>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="reference-local-hand">
          <Hand
            cards={state.hands[mySeat] || []}
            trump={state.trump}
            legalCardIds={state.phase === "PLAY" ? legalCardIds : undefined}
            isMyTurn={myTurn}
            onPlayCard={onPlayCard}
            cardSize="md"
          />
        </div>
        <SoundboardModal
          isOpen={chatOpen}
          onClose={() => setChatOpen(false)}
          onSelectPhrase={(phrase) => {
            react(mySeat, phrase);
            onSendSpeechBubble?.(phrase);
          }}
          characterId={state.players?.[mySeat]?.characterId}
        />
        <AnimatePresence>
          {reportOpen && (
            <motion.div
              dir="rtl"
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-3"
              onClick={() => setReportOpen(false)}
            >
              <motion.div
                dir="rtl"
                className="w-full max-w-md bg-neutral-900 border-2 border-amber-500/50 rounded-3xl p-5 text-amber-50"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-extrabold text-amber-400">بلاغ غش</h4>
                  <button
                    type="button"
                    onClick={() => setReportOpen(false)}
                    className="text-neutral-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-xs text-amber-200/70 mb-3">
                  اختر اللاعب ونوع الورقة اللي غش فيها. إذا الاثنين صحيح، الحكم ينحسب دبل.
                </p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {state.players
                    ?.filter((p) => p.seatIndex !== mySeat && p.seatIndex % 2 !== mySeat % 2)
                    .map((p) => (
                      <button
                        key={p.seatIndex}
                        onClick={() => setAccused(p.seatIndex)}
                        className={`rounded-xl px-3 py-2 text-sm border cursor-pointer ${
                          accused === p.seatIndex
                            ? "bg-amber-500/30 border-amber-400 font-bold"
                            : "bg-white/5 border-white/10"
                        }`}
                      >
                        {p.name}
                      </button>
                    ))}
                </div>
                {accused != null && (
                  <div className="grid grid-cols-3 gap-2">
                    {(["S", "H", "D", "C"] as Suit[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => submitReport(s)}
                        className="rounded-xl px-3 py-2 text-sm bg-white/5 border border-white/10 flex items-center justify-center gap-1 cursor-pointer hover:bg-white/10"
                      >
                        <SuitSvg suit={s} className="w-4 h-4" /> {SUIT_AR[s]}
                      </button>
                    ))}
                    <button
                      onClick={() => submitReport("JOKER")}
                      className="rounded-xl px-3 py-2 text-sm bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10"
                    >
                      جيكر
                    </button>
                    <button
                      onClick={() => submitReport("MAKER")}
                      className="rounded-xl px-3 py-2 text-sm bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10"
                    >
                      ميكر
                    </button>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
      <footer className="reference-controlbar" dir="ltr">
        <div className="reference-tools">
          {headerControls}
          {canCheatReport && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="بلاغ غش"
              title="بلاغ غش"
              onClick={() => {
                playTapSound();
                setReportOpen(true);
              }}
            >
              <ShieldAlert className="w-4 h-4 text-amber-400" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label="تعليقات الشخصيات"
            title="تعليقات الشخصيات"
            onClick={() => {
              playTapSound();
              setChatOpen((v) => !v);
            }}
          >
            <MessageSquare />
          </Button>
        </div>
        {bubble(mySeat) && (
          <span className="reference-local-speech" role="status">
            {bubble(mySeat)}
          </span>
        )}
        <div className={`reference-local-player ${speakingSeat === mySeat ? "seat-speaking" : ""}`}>
          <span>{name(mySeat)}</span>
          <img
            src={
              state.players?.[mySeat]?.characterId
                ? characterPortrait(state.players[mySeat].characterId!)
                : portraits[mySeat % portraits.length]
            }
            className="reference-portrait"
            alt={name(mySeat)}
          />
        </div>
      </footer>
    </div>
  );
};
export default Table;
