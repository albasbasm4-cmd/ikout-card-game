import { NetworkLatencyProvider } from "../network/NetworkLatencyContext";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { GameScreen } from './GameScreen';
import { RoomScreen } from './RoomScreen';
import { HomeScreen } from './HomeScreen';
import { SetupScreen } from './SetupScreen';
import { SplashScreen } from './SplashScreen';
import { RoomConfig } from '../store/useRoom';
import { ErrorBoundary } from './ErrorBoundary';
import { loadSavedGameState } from '../utils/persist';
import { useKeepAwake } from '../store/useSettings';
import { setAppBackHandler, getAppBackHandler } from '../utils/appBackNav';
import type { GameState } from '../types/kout';
import { Room187Screen } from '../game187/components/Room187Screen';
import { Game187Screen } from '../game187/components/Game187Screen';
import type { GameState187, Player187 } from '../game187/types';
import UnoGameWrapper from './uno/UnoGameWrapper';
import JokerApp from '../joker/JokerApp';

type View = 'splash' | 'home' | 'setup' | 'game' | 'lobby' | 'join' | '187' | 'uno' | 'joker';

export default function App() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>('splash');
  // The splash stays mounted above the home menu until the boom fades out.
  const [splashVisible, setSplashVisible] = useState(true);
  const [roomConfig, setRoomConfig] = useState<RoomConfig | null>(null);
  const [resumedState, setResumedState] = useState<GameState | null>(null);

  // 187 Game State
  const [players187, setPlayers187] = useState<Player187[] | null>(null);
  const [resumedState187, setResumedState187] = useState<GameState187 | null>(null);
  const [mode187, setMode187] = useState<'single' | 'room'>('single');
  const [roomCode187, setRoomCode187] = useState<string | undefined>(undefined);

  // Keep screen awake while using the app
  useKeepAwake(true);

  // حارس الرجوع النظامي: زر رجوع الجهاز/المتصفح يوجَّه إلى منطق الرجوع الداخلي
  // بدلاً من القفز إلى مسارات راوتر قديمة في سجل التنقل (سبب فتح أونو/الجوكر/الكوت
  // فجأة بعد الانترو). على الشاشة الرئيسية يُترك السلوك الافتراضي (خروج من التطبيق).
  const router = useRouter();
  useEffect(() => {
    const pushGuard = () => { try { window.history.pushState(window.history.state, ''); } catch { /* noop */ } };
    pushGuard();
    const onPop = () => {
      const h = getAppBackHandler();
      if (h) { pushGuard(); h(); }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [router]);

  // تسجيل نقطة الرجوع لشاشات الكوت و187 (خطوة واحدة للخلف، وطاولة اللعب → الرئيسية مباشرة).
  // شاشتا أونو والجوكر تسجّلان نفسهما داخلياً (useAppBack) لأن لهما شاشات فرعية.
  useEffect(() => {
    if (view === 'uno' || view === 'joker') return;
    if (view === 'setup' || view === 'game') { setAppBackHandler(() => setView('home')); return; }
    if (view === 'lobby' || view === 'join') { setAppBackHandler(() => setView('setup')); return; }
    if (view === '187' && !players187) { setAppBackHandler(() => setView('home')); return; }
    if (view === '187') {
      setAppBackHandler(() => {
        setPlayers187(null);
        setResumedState187(null);
        setView('home');
      });
    }
  }, [view, players187]);

  const handleStartGame = (config: RoomConfig) => {
    setRoomConfig(config);
    setResumedState(null);
    setView('game');
  };

  const handleResumeGame = (state: GameState) => {
    setResumedState(state);
    setView('game');
  };

  const handleHostRoom = (config: RoomConfig) => {
    setRoomConfig(config);
    setResumedState(null);
    setView('lobby');
  };

  return (
    <NetworkLatencyProvider>
    <ErrorBoundary>
      <div className="fixed inset-0 w-full h-[100dvh] overflow-hidden bg-black select-none">
        {view === 'home' && (
          <HomeScreen
            onEnterUno={() => setView('uno')}
            onEnterJoker={() => setView('joker')}
            onEnterSetup={() => setView('setup')}
            onEnter187={() => {
              setPlayers187(null);
              setResumedState187(null);
              setView('187');
            }}
          />
        )}

        {view === 'setup' && (
          <SetupScreen
            onBack={() => setView('home')}
            onStartGame={handleStartGame}
            onResumeGame={handleResumeGame}
            onHostRoom={handleHostRoom}
            onJoinRoom={() => setView('join')}
          />
        )}

        {view === 'lobby' && (
          <RoomScreen
            mode="host"
            onStartGame={handleStartGame}
            initialConfig={roomConfig ?? undefined}
            onBack={() => setView('setup')}
          />
        )}

        {view === 'join' && (
          <RoomScreen
            mode="join"
            onStartGame={handleStartGame}
            onBack={() => setView('setup')}
          />
        )}

        {view === 'game' && (
          <GameScreen
            key={`${roomConfig?.variant}-${roomConfig?.targetScore}-${roomConfig?.botDifficulty}-${resumedState ? 'resumed' : 'new'}`}
            initialVariant={roomConfig?.variant}
            initialDifficulty={roomConfig?.botDifficulty}
            initialPlayers={roomConfig?.players}
            initialState={resumedState ?? (roomConfig ? undefined : loadSavedGameState() ?? undefined)}
            onGoHome={() => setView('home')}
          />
        )}

        {view === 'uno' && (
          <UnoGameWrapper onBack={() => setView('home')} />
        )}

        {view === 'joker' && (
          <JokerApp onBack={() => setView('home')} />
        )}

        {/* لعبة 187 منفصلة بمحركها وشاشاتها الخاصة */}
        {view === '187' && !players187 && (
          <Room187Screen
            hasSavedGame={(() => {
              try {
                return Boolean(localStorage.getItem('ikout_187_state'));
              } catch {
                return false;
              }
            })()}
            onBack={() => setView('home')}
            onStartMatch={(players, mode, roomCode) => {
              setPlayers187(players);
              setMode187(mode);
              setRoomCode187(roomCode);
              setResumedState187(null);
            }}
            onResumeMatch={() => {
              try {
                const saved = localStorage.getItem('ikout_187_state');
                if (saved) {
                  const parsed = JSON.parse(saved);
                  setResumedState187(parsed);
                  setPlayers187(parsed.players);
                  setMode187('single');
                }
              } catch {
                // ignore
              }
            }}
          />
        )}

        {view === '187' && players187 && (
          <Game187Screen
            key={resumedState187 ? '187-resumed' : '187-new'}
            players={players187}
            initialState={resumedState187 ?? undefined}
            mode={mode187}
            roomCode={roomCode187}
            onExit={() => {
              setPlayers187(null);
              setResumedState187(null);
              setView('home');
            }}
          />
        )}

        {/* The creeper intro runs above the menu; it reveals the home screen
            behind its white flash, then unmounts itself. */}
        {splashVisible && (
          <SplashScreen
            onReveal={() => setView('home')}
            onDone={() => setSplashVisible(false)}
          />
        )}
      </div>
    </ErrorBoundary>
    </NetworkLatencyProvider>
  );
}
