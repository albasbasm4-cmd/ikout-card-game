import React, { useState } from 'react';
import UnoLobby from './UnoLobby';
import { Play } from '@/routes/uno.play';

interface UnoGameWrapperProps {
  onBack: () => void;
}

export default function UnoGameWrapper({ onBack }: UnoGameWrapperProps) {
  const [screen, setScreen] = useState<'lobby' | 'play'>('lobby');

  if (screen === 'play') {
    return (
      <div className="uno-app">
        <Play onBack={() => setScreen('lobby')} onGoHome={onBack} />
      </div>
    );
  }

  return (
    <UnoLobby
      onBack={onBack}
      onStartPlay={() => setScreen('play')}
    />
  );
}
