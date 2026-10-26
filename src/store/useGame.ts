/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GameState, Card, Bid, Suit, Difficulty, TrickPlay, PlayerSlot } from '../types/kout';
import { verifyCheatReport, type ReportedCardType } from '../rules/cheat';
import { KoutGameEngine } from '../engine/KoutGameEngine';
import { getLegalCards, trickWinner } from '../rules/cards';
import { getPlayedCards } from '../engine/KoutTricks';
import { getBotDecision } from '../ai/AIClient';
import { evaluateBid } from '../ai/BidEvaluator';
import {
  playCardSound,
  playTrickWinSound,
  playTrumpSound,
  playWinSound,
  playLoseSound,
} from '../utils/audio';
import { saveGameState } from '../utils/persist';
import { useHaptics } from './useSettings';

export interface UseGameOptions {
  variant?: 'BO6' | 'BO4';
  targetScore?: number;
  difficulty?: Difficulty;
  autoStart?: boolean;
  initialState?: GameState;
  /** تشكيلة الغرفة (من اللوبي): تحدد المقاعد البشرية مقابل البوتات. */
  players?: PlayerSlot[];
}

export interface CheatVerdict {
  confirmed: boolean;
  accusedSeat: number;
  cardType: ReportedCardType;
  reporterSeat: number | null;
  roundNo: number;
}

const MAX_CHEAT_REPORTS_PER_ROUND = 3;
const CHEAT_REPORT_COOLDOWN_MS = 8000;

const SUIT_ARABIC: Record<Suit, string> = {
  S: 'سبيت ♠',
  H: 'هاص ♥',
  D: 'ديمن ♦',
  C: 'كلفس ♣',
};

export function useGame(options: UseGameOptions = {}) {
  const [difficulty, setDifficulty] = useState<Difficulty>(options.difficulty ?? 'MEDIUM');
  const [variant, setVariant] = useState<'BO6' | 'BO4'>(options.initialState?.variant ?? options.variant ?? 'BO6');
  const [targetScore, setTargetScore] = useState<number>(options.initialState?.targetScore ?? options.targetScore ?? 51);

  // Engine instance reference
  const engineRef = useRef<KoutGameEngine | null>(null);

  if (!engineRef.current) {
    engineRef.current = new KoutGameEngine(
      {
        variant,
        targetScore,
        initialDealer: 0,
        seed: Math.floor(Math.random() * 1000000),
      },
      options.initialState
    );
    if (!options.initialState && options.autoStart !== false) {
      engineRef.current.startRound();
    }
  }

  const [state, setState] = useState<GameState>(engineRef.current.state);

  const [isBotThinking, setIsBotThinking] = useState<boolean>(false);
  const [cheatVerdict, setCheatVerdict] = useState<CheatVerdict | null>(null);
  const cheatReportsThisRoundRef = useRef<number>(0);
  const cheatReportRoundRef = useRef<number>(state.roundNo);
  const lastCheatReportAtRef = useRef<number>(0);
  const isExecutingRef = useRef<boolean>(false);

  // المقاعد البشرية: من تشكيلة الغرفة أو من حالة اللعبة، والافتراض مقعد واحد بشري
  const humanSeats = useMemo<number[]>(() => {
    const slots = options.players ?? (state.players && state.players.length ? state.players : null);
    const humans = (slots || [])
      .filter((p) => p.kind !== 'AI_BOT')
      .map((p) => p.seatIndex);
    return humans.length > 0 ? humans : [0];
    // options.players يُقرأ مرة واحدة كإعداد أولي
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.players]);

  // اللعب الحر = يوجد بشريان أو أكثر: نزول أي ورقة مسموح، والغش يُحكم به عند البلاغ فقط
  const freePlay = humanSeats.length >= 2;

  const humanSeatsRef = useRef(humanSeats);
  humanSeatsRef.current = humanSeats;
  const freePlayRef = useRef(freePlay);
  freePlayRef.current = freePlay;

  // Smooth Trick Completion & Visual Pacing
  const [displayedTrick, setDisplayedTrick] = useState<TrickPlay[]>(state.currentTrick);
  const [winningTrickPlay, setWinningTrickPlay] = useState<TrickPlay | null>(null);
  const [trickWinnerAnnouncement, setTrickWinnerAnnouncement] = useState<string | null>(null);
  const [speechBubbles, setSpeechBubbles] = useState<Record<number, string>>({});
  const isResolvingTrickRef = useRef<boolean>(false);

  const { trigger: triggerHaptic } = useHaptics(true);

  // Keep displayed trick in sync when not in resolution
  useEffect(() => {
    if (!isResolvingTrickRef.current) {
      setDisplayedTrick(state.currentTrick);
    }
  }, [state.currentTrick]);

  // المقعد البشري الذي عليه الدور الآن (هوت سبوت: أي مقعد بشري)
  const activeHumanSeat = useMemo<number | null>(() => {
    if (isResolvingTrickRef.current) return null;
    if (state.phase === 'BID') {
      return state.currentSeat !== null && humanSeats.includes(state.currentSeat) ? state.currentSeat : null;
    }
    if (state.phase === 'TRUMP') {
      return state.bidderSeat !== null && humanSeats.includes(state.bidderSeat) ? state.bidderSeat : null;
    }
    if (state.phase === 'PLAY') {
      return state.currentSeat !== null && humanSeats.includes(state.currentSeat) ? state.currentSeat : null;
    }
    return null;
  }, [state, humanSeats]);

  const activeHumanSeatRef = useRef<number | null>(activeHumanSeat);
  activeHumanSeatRef.current = activeHumanSeat;

  // الأوراق المسموحة للبشري صاحب الدور (null = لعب حر: كل الأوراق مسموحة)
  const legalCardsForHuman = useMemo<Set<string> | null>(() => {
    if (activeHumanSeat === null || state.phase !== 'PLAY' || isResolvingTrickRef.current) {
      return new Set<string>();
    }
    if (freePlay) {
      return null; // اللعب الحر ضد البشر: أي ورقة، والغش يُحكم به عند البلاغ فقط
    }
    const myHand = state.hands[activeHumanSeat] || [];
    const played = getPlayedCards(state.trickHistory, state.currentTrick);
    const legal = getLegalCards(myHand, state.currentTrick, state.trump, {
      playedCards: played,
      highBid: state.highBid,
    });
    return new Set(legal.map((c) => c.id));
  }, [state, activeHumanSeat, freePlay]);

  // Is human turn?
  const isHumanTurn = activeHumanSeat !== null;

  // تصفير عدّاد البلاغات مع كل جولة جديدة، وإخفاء الحكم بعد ٦ ثوانٍ
  useEffect(() => {
    if (state.roundNo !== cheatReportRoundRef.current) {
      cheatReportRoundRef.current = state.roundNo;
      cheatReportsThisRoundRef.current = 0;
      setCheatVerdict(null);
    }
  }, [state.roundNo]);

  useEffect(() => {
    if (!cheatVerdict) return;
    const timer = setTimeout(() => setCheatVerdict(null), 6000);
    return () => clearTimeout(timer);
  }, [cheatVerdict]);

  // Plays a card with smooth trick completion delay
  const executePlayCardWithPacing = useCallback(
    (seat: number, card: Card, playOptions?: { allowAnyCard?: boolean }) => {
      const engine = engineRef.current;
      if (!engine) return;

      playCardSound();
      triggerHaptic('light');

      const numSeats = engine.state.variant === 'BO6' ? 6 : 4;
      const currentTrick = engine.state.currentTrick;

      // Check if this card completes the trick
      if (currentTrick.length === numSeats - 1) {
        // Complete trick: show all cards for 1100ms before advancing
        isResolvingTrickRef.current = true;
        const fullTrick = [...currentTrick, { seat, card }];
        const winner = trickWinner(fullTrick, engine.state.trump);
        const winnerName =
          engine.state.players?.[winner.seat]?.name || `لاعب ${winner.seat + 1}`;

        setDisplayedTrick(fullTrick);
        setWinningTrickPlay(winner);
        const singleHuman = (humanSeatsRef.current || [0]).length <= 1;
        const announceMsg =
          singleHuman && winner.seat === 0 ? 'أكلتها أنت! 🎉' : `أكلها ${winnerName}!`;
        setTrickWinnerAnnouncement(announceMsg);

        playTrickWinSound();
        triggerHaptic('medium');

        setTimeout(() => {
          try {
            const nextState = engine.playCard(seat, card, playOptions);
            setState({ ...nextState });
            saveGameState(nextState);

            if (nextState.phase === 'ROUND_END' || nextState.phase === 'GAME_END') {
              if (nextState.scores[0] >= nextState.scores[1]) {
                playWinSound();
              } else {
                playLoseSound();
              }
            }
          } finally {
            isResolvingTrickRef.current = false;
            setWinningTrickPlay(null);
            setTrickWinnerAnnouncement(null);
            setDisplayedTrick([]);
          }
        }, 1100);
      } else {
        // Non-final card play: instant update
        const nextState = engine.playCard(seat, card, playOptions);
        setState({ ...nextState });
        saveGameState(nextState);
      }
    },
    [triggerHaptic]
  );

  // Human Actions
  const humanPlayCard = useCallback(
    (card: Card) => {
      const engine = engineRef.current;
      const seat = activeHumanSeatRef.current;
      if (!engine || isResolvingTrickRef.current) return;
      if (engine.state.phase !== 'PLAY' || seat === null || engine.state.currentSeat !== seat) return;

      try {
        // اللعب الحر ضد البشر: أي ورقة مسموحة (يتحقق منها الحكم فقط عند البلاغ)
        executePlayCardWithPacing(seat, card, { allowAnyCard: freePlayRef.current });
      } catch (err) {
        console.error('Human playCard error:', err);
      }
    },
    [executePlayCardWithPacing]
  );

  const humanBid = useCallback((bid: Bid) => {
    const engine = engineRef.current;
    const seat = activeHumanSeatRef.current;
    if (!engine) return;
    if (engine.state.phase !== 'BID' || seat === null || engine.state.currentSeat !== seat) return;

    try {
      const bubble = bid === 0 ? 'طاف' : `طلب ${bid}`;
      setSpeechBubbles((prev) => ({ ...prev, [seat]: bubble }));

      const nextState = engine.placeBid(seat, bid);
      setState({ ...nextState });
      saveGameState(nextState);
    } catch (err) {
      console.error('Human placeBid error:', err);
    }
  }, []);

  const humanDeclareTrump = useCallback((suit: Suit) => {
    const engine = engineRef.current;
    const seat = activeHumanSeatRef.current;
    if (!engine) return;
    if (engine.state.phase !== 'TRUMP' || seat === null || engine.state.bidderSeat !== seat) return;

    try {
      playTrumpSound();
      setSpeechBubbles((prev) => ({
        ...prev,
        [seat]: `الأمر: ${SUIT_ARABIC[suit]}`,
      }));

      const nextState = engine.declareTrump(seat, suit);
      setState({ ...nextState });
      saveGameState(nextState);
    } catch (err) {
      console.error('Human declareTrump error:', err);
    }
  }, []);

  const sendSpeechBubble = useCallback((message: string, seat: number = 0) => {
    setSpeechBubbles((prev) => ({ ...prev, [seat]: message }));
    setTimeout(() => {
      setSpeechBubbles((prev) => {
        const next = { ...prev };
        delete next[seat];
        return next;
      });
    }, 2800);
  }, []);

  const startNextRound = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    setSpeechBubbles({});
    const nextState = engine.startRound();
    setState({ ...nextState });
    saveGameState(nextState);
  }, []);

  const startNewGame = useCallback(
    (newVariant?: 'BO6' | 'BO4', newTarget?: number, newDiff?: Difficulty) => {
      const v = newVariant ?? variant;
      const t = newTarget ?? targetScore;
      const d = newDiff ?? difficulty;
      setVariant(v);
      setTargetScore(t);
      setDifficulty(d);
      setSpeechBubbles({});
      setWinningTrickPlay(null);
      setTrickWinnerAnnouncement(null);

      const newEngine = new KoutGameEngine({
        variant: v,
        targetScore: t,
        initialDealer: 0,
        seed: Math.floor(Math.random() * 1000000),
      });
      engineRef.current = newEngine;
      const firstState = newEngine.startRound();
      setState({ ...firstState });
      saveGameState(firstState);
    },
    [variant, targetScore, difficulty]
  );

  // Human turn timeout handler (auto-plays legal move)
  const handleHumanTimeout = useCallback(() => {
    const engine = engineRef.current;
    const seat = activeHumanSeatRef.current;
    if (!engine || isResolvingTrickRef.current) return;
    const current = engine.state;
    if (seat === null) return;

    if (current.phase === 'BID' && current.currentSeat === seat) {
      const isDealerForced =
        current.dealer === seat &&
        current.bids.length === (current.variant === 'BO6' ? 5 : 3) &&
        current.bids.every((b) => b.bid === 0);
      const autoBid: Bid = isDealerForced ? 5 : 0;
      humanBid(autoBid);
    } else if (current.phase === 'TRUMP' && current.bidderSeat === seat) {
      const evalResult = evaluateBid(current.hands[seat], null, false, difficulty);
      humanDeclareTrump(evalResult.bestSuit);
    } else if (current.phase === 'PLAY' && current.currentSeat === seat) {
      // المهلة تشغّل دائماً ورقة قانونية حتى مع اللعب الحر — منع تعطيل اللعبة
      const hand = current.hands[seat] || [];
      const played = getPlayedCards(current.trickHistory, current.currentTrick);
      const legal = getLegalCards(hand, current.currentTrick, current.trump, {
        playedCards: played,
        highBid: current.highBid,
      });
      if (legal.length > 0) {
        humanPlayCard(legal[0]);
      }
    }
  }, [difficulty, humanBid, humanDeclareTrump, humanPlayCard]);

  // Automated bot turn execution effect
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    let isMounted = true;
    const current = state;

    if (isResolvingTrickRef.current) return;

    const isHumanSeat = (seat: number | null): boolean =>
      seat !== null && humanSeatsRef.current.includes(seat);
    const isBotTurnToBid = current.phase === 'BID' && !isHumanSeat(current.currentSeat);
    const isBotTurnToTrump = current.phase === 'TRUMP' && !isHumanSeat(current.bidderSeat);
    const isBotTurnToPlay = current.phase === 'PLAY' && !isHumanSeat(current.currentSeat);

    if (!isBotTurnToBid && !isBotTurnToTrump && !isBotTurnToPlay) {
      setIsBotThinking(false);
      return;
    }

    if (isExecutingRef.current) return;
    isExecutingRef.current = true;
    setIsBotThinking(true);

    const activeSeat = current.phase === 'TRUMP' ? current.bidderSeat : current.currentSeat;
    if (activeSeat === null) {
      isExecutingRef.current = false;
      return;
    }

    const executeBotTurn = async () => {
      try {
        const decision = await getBotDecision(current, activeSeat, difficulty);

        if (!isMounted) return;

        const currentEngineState = engine.state;
        if (currentEngineState.version !== current.version) {
          return;
        }

        if (decision.type === 'BID' && currentEngineState.phase === 'BID') {
          const bubble = decision.bid === 0 ? 'طاف' : `طلب ${decision.bid}`;
          setSpeechBubbles((prev) => ({ ...prev, [activeSeat]: bubble }));

          const next = engine.placeBid(activeSeat, decision.bid);
          setState({ ...next });
          saveGameState(next);
        } else if (decision.type === 'TRUMP' && currentEngineState.phase === 'TRUMP') {
          playTrumpSound();
          setSpeechBubbles((prev) => ({
            ...prev,
            [activeSeat]: `الأمر: ${SUIT_ARABIC[decision.suit]}`,
          }));

          const next = engine.declareTrump(activeSeat, decision.suit);
          setState({ ...next });
          saveGameState(next);
        } else if (decision.type === 'PLAY' && currentEngineState.phase === 'PLAY') {
          executePlayCardWithPacing(activeSeat, decision.card);
        }
      } catch (err) {
        console.error('Error in bot execution:', err);
      } finally {
        if (isMounted) {
          isExecutingRef.current = false;
          setIsBotThinking(false);
        }
      }
    };

    executeBotTurn();

    return () => {
      isMounted = false;
      isExecutingRef.current = false;
    };
  }, [state, difficulty, executePlayCardWithPacing]);

  // ---- نظام البلاغ (ضد لاعبين بشريين فقط) ----
  const canReportCheat =
    freePlay &&
    (state.phase === 'PLAY' || state.phase === 'ROUND_END') &&
    cheatReportsThisRoundRef.current < MAX_CHEAT_REPORTS_PER_ROUND;

  const reportCheat = useCallback((accusedSeat: number, cardType: ReportedCardType): boolean => {
    const engine = engineRef.current;
    if (!engine) return false;
    if ((humanSeatsRef.current || []).length < 2) return false; // ضد البوتات لا معنى للبلاغ
    if (engine.state.phase !== 'PLAY' && engine.state.phase !== 'ROUND_END') return false;
    if (cheatReportsThisRoundRef.current >= MAX_CHEAT_REPORTS_PER_ROUND) return false;
    const now = Date.now();
    if (now - lastCheatReportAtRef.current < CHEAT_REPORT_COOLDOWN_MS) return false;

    lastCheatReportAtRef.current = now;
    cheatReportsThisRoundRef.current += 1;

    // التحقق يجري على الحالة الكاملة (أوراق كل اللاعبين) — هذه هي الحقيقة
    const confirmed = verifyCheatReport(engine.state, accusedSeat, cardType);
    setCheatVerdict({
      confirmed,
      accusedSeat,
      cardType,
      reporterSeat: activeHumanSeatRef.current,
      roundNo: engine.state.roundNo,
    });
    return confirmed;
  }, []);

  return {
    state,
    difficulty,
    setDifficulty,
    variant,
    isHumanTurn,
    isBotThinking,
    legalCardsForHuman,
    displayedTrick,
    winningTrickPlay,
    trickWinnerAnnouncement,
    speechBubbles,
    sendSpeechBubble,
    humanPlayCard,
    humanBid,
    humanDeclareTrump,
    startNextRound,
    startNewGame,
    handleHumanTimeout,
    // اللعب الحر ضد البشر + نظام البلاغ
    humanSeats,
    freePlay,
    activeHumanSeat,
    canReportCheat,
    reportCheat,
    cheatVerdict,
  };
}

export default useGame;
