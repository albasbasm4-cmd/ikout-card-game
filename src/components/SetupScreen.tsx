/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { RoomConfig, createDefaultPlayers } from '../store/useRoom';
import { hasSavedGame, loadSavedGameState } from '../utils/persist';
import { loadProfile } from '../utils/profile';
import { playTapSound } from '../utils/audio';
import type { GameState } from '../types/kout';

export interface SetupScreenProps {
  onBack: () => void;
  onStartGame: (config: RoomConfig) => void;
  onResumeGame: (state: GameState) => void;
  /** Fired when the player wants a real player to join (host a room). */
  onHostRoom?: (config: RoomConfig) => void;
  className?: string;
}

const TARGETS = [51, 71, 101] as const;

function buildConfig(variant: 'BO6' | 'BO4', targetScore: number): RoomConfig {
  const players = createDefaultPlayers(variant, 'MEDIUM').map(p =>
    p.seatIndex === 0 ? { ...p, name: loadProfile().name || 'أنت' } : p
  );
  return { variant, targetScore, botDifficulty: 'MEDIUM', players };
}

/**
 * The second screen (after pressing the ikout card): resume a saved game or
 * start fresh on top, then the player count, the score limit (القيد), and
 * whether a real player may join the table or not.
 */
export const SetupScreen: React.FC<SetupScreenProps> = ({ onBack, onStartGame, onResumeGame, onHostRoom, className = '' }) => {
  const [variant, setVariant] = useState<'BO6' | 'BO4'>('BO6');
  const [targetScore, setTargetScore] = useState<number>(51);
  const [allowHuman, setAllowHuman] = useState(false);
  const canResume = hasSavedGame();

  const startNewGame = () => {
    playTapSound();
    const config = buildConfig(variant, targetScore);
    if (allowHuman && onHostRoom) onHostRoom(config);
    else onStartGame(config);
  };

  const resume = () => {
    playTapSound();
    const saved = loadSavedGameState();
    if (saved) onResumeGame(saved);
  };

  return (
    <div dir="rtl" className={`ik-home ${className}`}>
      <div className="ik-stage" style={{ background: 'radial-gradient(ellipse 560px 320px at 50% 40%,#2e4a3a,transparent 72%),linear-gradient(#243a2c,#1a2b20 55%,#141f18)' }}>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
          <div className="ik-pn" style={{ height: 'auto', width: 720 }}>
            <button type="button" className="ik-x" onClick={() => { playTapSound(); onBack(); }} aria-label="رجوع">✕</button>
            <h2>اختيار عدد اللاعبين</h2>

            <div className="flex flex-col gap-3">
              {/* Top row: resume (if any) and start new */}
              {canResume && (
                <button type="button" className="ik-btn" onClick={resume}>
                  ↩ استئناف اللعب المحفوظ
                </button>
              )}
              <button type="button" className="ik-btn" onClick={startNewGame}>
                ▶ البدء من جديد
              </button>

              {/* Player count */}
              <button
                type="button"
                className="ik-row"
                onClick={() => { playTapSound(); setVariant(v => (v === 'BO6' ? 'BO4' : 'BO6')); }}
              >
                <span className="flex-1">👥 اللاعبين</span>
                <span className="px-3 py-1.5 rounded-xl bg-[#ffd23f] text-black text-sm font-black shadow">
                  {variant === 'BO6' ? '٦ لاعبين' : '٤ لاعبين'}
                </span>
              </button>

              {/* Score limit (القيد) */}
              <div className="ik-row" style={{ cursor: 'default', flexWrap: 'wrap' }}>
                <span>🎯 القيد (نقطة الفوز)</span>
                <div className="ik-seg" style={{ maxWidth: 280 }}>
                  {TARGETS.map(t => (
                    <button
                      key={t}
                      type="button"
                      className={targetScore === t ? 'on' : ''}
                      onClick={() => { playTapSound(); setTargetScore(t); }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Allow a real player to join? */}
              <div className="ik-row" style={{ cursor: 'default', flexWrap: 'wrap' }}>
                <span style={{ flexBasis: '100%' }}>🙋 هل تريد أن ينظم إليك لاعب حقيقي؟</span>
                <div className="ik-seg" style={{ maxWidth: 280 }}>
                  <button type="button" className={allowHuman ? 'on' : ''} onClick={() => { playTapSound(); setAllowHuman(true); }}>
                    نعم، أنشئ غرفة
                  </button>
                  <button type="button" className={!allowHuman ? 'on' : ''} onClick={() => { playTapSound(); setAllowHuman(false); }}>
                    لا، بوتات فقط
                  </button>
                </div>
              </div>
              <p className="ik-sm text-center">
                {allowHuman
                  ? 'عند البدء تُفتح غرفة على شبكتك المحلية ويمكن للاعب حقيقي الانضمام برمز الغرفة أو رمز QR.'
                  : 'ستلعب مباشرة ضد بوتات ذكية على الطاولة.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SetupScreen;
