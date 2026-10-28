/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameEngine187 } from '../engine';
import { Card187, GameState187, Player187, Suit187, TrickPlay187 } from '../types';
import { calculateTrickPoints, resolveTrickWinner187 } from '../rules';
import { loadSettings } from '../../store/useSettings';
import { Table187 } from './Table187';
import {
  evaluateBotBid,
  chooseBotTrump,
  chooseBotDiscards,
  chooseBotCardToPlay,
} from '../ai';
import { playCardSound, playTapSound } from '../../utils/audio';
import { Room187Channel, Client187Packet, Host187Packet } from '../network/network187';

export interface Game187ScreenProps {
  players: Player187[];
  initialState?: GameState187;
  mode?: 'single' | 'room';
  roomCode?: string;
  onExit: () => void;
}

const STORAGE_KEY_187 = 'ikout_187_state';
/** How long a completed trick stays on the table; longer than the 0.8s card flight so the last card lands first. */
export const TRICK_HOLD_MS_187 = 1500;
const speedFactor = () => {
  const s = loadSettings().botSpeed;
  return s === 'SLOW' ? 1.6 : s === 'FAST' ? 0.6 : 1;
};

export const Game187Screen: React.FC<Game187ScreenProps> = ({
  players,
  initialState,
  mode = 'single',
  roomCode,
  onExit,
}) => {
  const isHost = mode !== 'room' || players[0]?.kind === 'HUMAN_LOCAL';
  const mySeat = mode === 'room' && !isHost ? 1 : 0;

  const engineRef = useRef<GameEngine187 | null>(null);
  const channelRef = useRef<Room187Channel | null>(null);

  if (isHost && !engineRef.current) {
    if (initialState) {
      engineRef.current = new GameEngine187({}, initialState);
    } else {
      const eng = new GameEngine187({ players });
      eng.startRound();
      engineRef.current = eng;
    }
  }

  const [gameState, setGameState] = useState<GameState187>(() => {
    if (initialState) return initialState;
    if (engineRef.current) return engineRef.current.state;
    // Client placeholder before first sync
    return {
      roundNo: 1,
      dealer: 0,
      currentSeat: 1,
      hands: [[], [], [], [], []],
      tableCards: [],
      bids: [],
      passedSeats: [false, false, false, false, false],
      highBid: null,
      bidderSeat: null,
      trump: null,
      currentTrick: [],
      trickHistory: [],
      tricksWon: [0, 0, 0, 0, 0],
      capturedCards: [[], [], [], [], []],
      hakemPoints: 0,
      opponentsPoints: 0,
      earlySettled: false,
      earlySettledWinner: null,
      continueAfterEarlySettle: false,
      phase: 'DEAL',
      players,
      winner: null,
      version: 1,
    };
  });

  const syncState = useCallback(() => {
    if (!engineRef.current) return;
    const newState = { ...engineRef.current.state };
    setGameState(newState);

    if (mode === 'room' && channelRef.current) {
      channelRef.current.send({ type: 'STATE_UPDATE', state: newState });
    }

    try {
      if (newState.phase !== 'ROUND_END') {
        localStorage.setItem(STORAGE_KEY_187, JSON.stringify(newState));
      } else {
        localStorage.removeItem(STORAGE_KEY_187);
      }
    } catch {
      // ignore
    }
  }, [mode]);

  // Keep the completed trick visible briefly (presentation only; the engine has already scored it).
  const [heldTrick, setHeldTrick] = useState<{ plays: TrickPlay187[]; winner: TrickPlay187; text: string } | null>(null);
  const seenTricks = useRef(gameState.trickHistory.length);
  useEffect(() => {
    const n = gameState.trickHistory.length;
    if (n < seenTricks.current) seenTricks.current = n;
    if (n === seenTricks.current) return;
    seenTricks.current = n;
    const plays = gameState.trickHistory[n - 1];
    if (!plays || plays.length === 0) return;
    const winner = resolveTrickWinner187(plays, gameState.trump);
    const who = gameState.players[winner.seat]?.name || `لاعب ${winner.seat + 1}`;
    setHeldTrick({ plays, winner, text: `أكلة ${who} (+${calculateTrickPoints(plays)})` });
  }, [gameState.trickHistory, gameState.trump, gameState.players]);
  useEffect(() => {
    if (!heldTrick) return;
    const t = window.setTimeout(() => setHeldTrick(null), TRICK_HOLD_MS_187);
    return () => window.clearTimeout(t);
  }, [heldTrick]);

  // شبكة الغرفة المتزامنة
  useEffect(() => {
    if (mode === 'room' && roomCode) {
      const ch = new Room187Channel(roomCode);
      channelRef.current = ch;

      ch.onMessage((msg: Client187Packet | Host187Packet) => {
        if (isHost && engineRef.current) {
          const eng = engineRef.current;
          if (msg.type === 'BID') {
            eng.placeBid(msg.seat, msg.bid);
            syncState();
          } else if (msg.type === 'DISCARD') {
            eng.giveAwayCards(msg.seat, msg.cardIds);
            syncState();
          } else if (msg.type === 'TRUMP') {
            eng.declareTrump(msg.seat, msg.trump);
            syncState();
          } else if (msg.type === 'PLAY_CARD') {
            playCardSound();
            eng.playCard(msg.seat, msg.card);
            syncState();
          } else if (msg.type === 'EARLY_SETTLE') {
            eng.decideEarlyContinue(msg.continuePlay);
            syncState();
          } else if (msg.type === 'CHEAT_REPORT') {
            eng.reportCheat(msg.reporterSeat, msg.accusedSeat, msg.suit);
            syncState();
          }
        } else if (!isHost && msg.type === 'STATE_UPDATE') {
          setGameState(msg.state);
        }
      });

      return () => {
        ch.close();
      };
    }
    return undefined;
  }, [mode, roomCode, isHost, syncState]);

  // أتمتة حركات البوتات (على جهاز المضيف فقط)
  useEffect(() => {
    if (!isHost || heldTrick) return;
    const eng = engineRef.current;
    if (!eng) return;
    const k = speedFactor();

    const currentSeat = gameState.currentSeat;
    const currentPlayer = gameState.players[currentSeat];
    const isBotTurn = currentPlayer?.kind === 'AI_BOT';

    let timer: number | null = null;

    if (gameState.phase === 'BID' && isBotTurn) {
      timer = window.setTimeout(() => {
        const hand = gameState.hands[currentSeat];
        const bid = evaluateBotBid(hand, gameState.highBid);
        try {
          eng.placeBid(currentSeat, bid);
          syncState();
        } catch {
          eng.placeBid(currentSeat, 0);
          syncState();
        }
      }, 650 * k);
    } else if (gameState.phase === 'DISCARD') {
      const hakemSeat = gameState.bidderSeat ?? 0;
      const hakemPlayer = gameState.players[hakemSeat];
      if (hakemPlayer?.kind === 'AI_BOT') {
        timer = window.setTimeout(() => {
          const hand = gameState.hands[hakemSeat];
          const discards = chooseBotDiscards(hand, 'S');
          eng.giveAwayCards(hakemSeat, discards);
          syncState();
        }, 700 * k);
      }
    } else if (gameState.phase === 'TRUMP') {
      const hakemSeat = gameState.bidderSeat ?? 0;
      const hakemPlayer = gameState.players[hakemSeat];
      if (hakemPlayer?.kind === 'AI_BOT') {
        timer = window.setTimeout(() => {
          const hand = gameState.hands[hakemSeat];
          const trump = chooseBotTrump(hand);
          eng.declareTrump(hakemSeat, trump);
          syncState();
        }, 700 * k);
      }
    } else if (gameState.phase === 'PLAY' && isBotTurn) {
      timer = window.setTimeout(() => {
        try {
          const card = chooseBotCardToPlay(gameState, currentSeat);
          playCardSound();
          eng.playCard(currentSeat, card);
          syncState();
        } catch (err) {
          console.error('Bot play error:', err);
        }
      }, 750 * k);
    }

    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [isHost, gameState, syncState, heldTrick]);

  // الإجراءات
  const handleHumanPlayCard = (card: Card187) => {
    playCardSound();
    if (isHost && engineRef.current) {
      engineRef.current.playCard(mySeat, card);
      syncState();
    } else if (channelRef.current) {
      channelRef.current.send({ type: 'PLAY_CARD', seat: mySeat, card });
    }
  };

  const handleHumanBid = (bid: number) => {
    if (isHost && engineRef.current) {
      engineRef.current.placeBid(mySeat, bid);
      syncState();
    } else if (channelRef.current) {
      channelRef.current.send({ type: 'BID', seat: mySeat, bid });
    }
  };

  const handleHumanGiveAwayCards = (cardIds: string[]) => {
    if (isHost && engineRef.current) {
      engineRef.current.giveAwayCards(mySeat, cardIds);
      syncState();
    } else if (channelRef.current) {
      channelRef.current.send({ type: 'DISCARD', seat: mySeat, cardIds });
    }
  };

  const handleHumanDeclareTrump = (suit: Suit187) => {
    if (isHost && engineRef.current) {
      engineRef.current.declareTrump(mySeat, suit);
      syncState();
    } else if (channelRef.current) {
      channelRef.current.send({ type: 'TRUMP', seat: mySeat, trump: suit });
    }
  };

  const handleHumanEarlySettleChoice = (continuePlay: boolean) => {
    if (isHost && engineRef.current) {
      engineRef.current.decideEarlyContinue(continuePlay);
      syncState();
    } else if (channelRef.current) {
      channelRef.current.send({ type: 'EARLY_SETTLE', seat: mySeat, continuePlay });
    }
  };

  const handleHumanReportCheat = (accusedSeat: number, suit: Suit187) => {
    if (isHost && engineRef.current) {
      engineRef.current.reportCheat(mySeat, accusedSeat, suit);
      syncState();
    } else if (channelRef.current) {
      channelRef.current.send({ type: 'CHEAT_REPORT', reporterSeat: mySeat, accusedSeat, suit });
    }
  };

  const handleNextRound = () => {
    if (isHost && engineRef.current) {
      engineRef.current.startRound();
      syncState();
    }
  };

  const handleRestart = () => {
    if (!isHost) return;
    const eng = new GameEngine187({ players: gameState.players.length ? gameState.players : players });
    eng.startRound();
    engineRef.current = eng;
    setHeldTrick(null);
    seenTricks.current = 0;
    syncState();
  };

  const handleExitGame = () => {
    playTapSound();
    try {
      localStorage.removeItem(STORAGE_KEY_187);
    } catch {
      // ignore
    }
    onExit();
  };

  return (
    <div className="w-full h-full relative">
      <Table187
        state={gameState}
        mySeat={mySeat}
        displayedTrick={heldTrick ? heldTrick.plays : gameState.currentTrick}
        winningPlay={heldTrick?.winner ?? null}
        trickAnnouncement={heldTrick?.text ?? null}
        canAct={!heldTrick}
        onRestart={isHost && mode !== 'room' ? handleRestart : undefined}
        onPlayCard={handleHumanPlayCard}
        onBid={handleHumanBid}
        onGiveAwayCards={handleHumanGiveAwayCards}
        onDeclareTrump={handleHumanDeclareTrump}
        onEarlySettleChoice={handleHumanEarlySettleChoice}
        onReportCheat={handleHumanReportCheat}
        onNextRound={handleNextRound}
        onExit={handleExitGame}
      />
    </div>
  );
};

export default Game187Screen;
