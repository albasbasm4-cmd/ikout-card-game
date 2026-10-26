/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { GameScreen } from './GameScreen';
import { Lobby } from './Lobby';
import { HomeScreen } from './HomeScreen';
import { SetupScreen } from './SetupScreen';
import { SplashScreen } from './SplashScreen';
import { RoomConfig } from '../store/useRoom';
import { ErrorBoundary } from './ErrorBoundary';
import { loadSavedGameState } from '../utils/persist';
import { useKeepAwake } from '../store/useSettings';
import type { GameState } from '../types/kout';

type View = 'splash' | 'home' | 'setup' | 'game' | 'lobby';

export default function App() {
  const [view, setView] = useState<View>('splash');
  const [roomConfig, setRoomConfig] = useState<RoomConfig | null>(null);
  const [resumedState, setResumedState] = useState<GameState | null>(null);

  // Keep screen awake while using the app
  useKeepAwake(true);

  const handleStartGame = (config: RoomConfig) => {
    setRoomConfig(config);
    setResumedState(null);
    setView('game');
  };

  const handleResumeGame = (state: GameState) => {
    setResumedState(state);
    setView('game');
  };

  return (
    <ErrorBoundary>
      <div className="relative w-full min-h-screen">
        {view === 'splash' && (
          <SplashScreen onDone={() => setView('home')} />
        )}

        {view === 'home' && (
          <HomeScreen onEnterSetup={() => setView('setup')} />
        )}

        {view === 'setup' && (
          <SetupScreen
            onBack={() => setView('home')}
            onStartGame={handleStartGame}
            onResumeGame={handleResumeGame}
          />
        )}

        {view === 'lobby' && (
          <Lobby
            onStartGame={handleStartGame}
            initialConfig={roomConfig ?? undefined}
          />
        )}

        {view === 'game' && (
          <GameScreen
            key={`${roomConfig?.variant}-${roomConfig?.targetScore}-${roomConfig?.botDifficulty}-${resumedState ? 'resumed' : 'new'}`}
            initialVariant={roomConfig?.variant}
            initialDifficulty={roomConfig?.botDifficulty}
            initialPlayers={roomConfig?.players}
            initialState={resumedState ?? (roomConfig ? undefined : loadSavedGameState() ?? undefined)}
            onGoToLobby={() => setView('lobby')}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
