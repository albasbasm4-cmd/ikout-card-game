import React, { useState } from 'react';
import UnoLobby from './UnoLobby';
import { Play } from '@/routes/uno.play';
import { Room } from '@/routes/uno.room';
import { Join } from '@/routes/uno.join';

type UnoScreen = 'lobby' | 'room' | 'join' | 'play';

interface UnoGameWrapperProps {
  onBack: () => void;
}

/**
 * يدير تدفق أونو كاملاً داخل الواجهة الرئيسية دون تنقل عبر الراوتر:
 * لوبي → (إنشاء/انضمام غرفة أو مباراة) → طاولة اللعب،
 * وأزرار الرجوع تعود خطوة واحدة للخلف (طاولة → لوبي → الشاشة الرئيسية)
 * دون إعادة تعيين الحالة أو فتح شاشة الجوكر أو مقدمة اللعبة.
 */
export default function UnoGameWrapper({ onBack }: UnoGameWrapperProps) {
  const [screen, setScreen] = useState<UnoScreen>('lobby');

  if (screen === 'play') {
    return (
      <div className="uno-app">
        <Play onBack={() => setScreen('lobby')} onGoHome={onBack} />
      </div>
    );
  }

  if (screen === 'room') {
    return <Room onBack={() => setScreen('lobby')} onStartPlay={() => setScreen('play')} />;
  }

  if (screen === 'join') {
    return <Join onBack={() => setScreen('lobby')} />;
  }

  return (
    <UnoLobby
      onBack={onBack}
      onStartPlay={() => setScreen('play')}
      onCreateRoom={() => setScreen('room')}
      onJoinRoom={() => setScreen('join')}
    />
  );
}
