/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ProfileEditor } from './ProfileEditor';
import { useProfile, characterFace } from '../utils/profile';
import { playTapSound } from '../utils/audio';

export interface HomeScreenProps {
  onEnterSetup: () => void;
  className?: string;
}

interface Tile {
  id: string;
  title: string;
  subtitle: string;
  enabled: boolean;
  onClick?: () => void;
  logo?: boolean;
}

/**
 * Main menu after the splash: a profile entry in the top-left corner and four
 * rectangular tiles. Only the first tile (ترب) is active for now; the rest are
 * placeholders reserved for future features.
 */
export const HomeScreen: React.FC<HomeScreenProps> = ({ onEnterSetup, className = '' }) => {
  const profile = useProfile();
  const [profileOpen, setProfileOpen] = useState(false);

  const tiles: Tile[] = [
    { id: 'terb', title: 'ترب', subtitle: 'كوت بوستة · كوت بوأربعة', enabled: true, onClick: onEnterSetup, logo: true },
    { id: 'online', title: 'تحدّي أونلاين', subtitle: 'قريباً', enabled: false },
    { id: 'tournaments', title: 'البطولات', subtitle: 'قريباً', enabled: false },
    { id: 'shop', title: 'المتجر', subtitle: 'قريباً', enabled: false },
  ];

  return (
    <div dir="rtl" className={`relative w-full min-h-[100dvh] bg-neutral-950 text-amber-50 overflow-hidden ${className}`}>
      {/* Warm arena backdrop */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,58,26,0.55),rgba(6,10,6,0.95)_75%)]" />
        <div className="absolute -bottom-24 left-1/2 -translate-x-1/2 w-[130%] h-64 bg-[radial-gradient(ellipse_at_center,rgba(251,191,36,0.10),transparent_70%)]" />
      </div>

      {/* Profile entry — top-left corner */}
      <button
        type="button"
        onClick={() => { playTapSound(); setProfileOpen(true); }}
        aria-label="تعديل الملف الشخصي"
        title="الملف الشخصي"
        className="absolute top-4 left-4 z-20 flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full bg-black/70 border border-amber-400/40 shadow-xl backdrop-blur-md active:scale-95 cursor-pointer hover:border-amber-300"
      >
        <span className="w-9 h-9 rounded-full overflow-hidden border border-amber-400/50 bg-neutral-800 shrink-0">
          <HomeAvatar characterId={profile.characterId} name={profile.name} />
        </span>
        <span className="text-[11px] font-black text-amber-200">{profile.name || 'أنت'}</span>
      </button>

      {/* Centered tile stack */}
      <main className="relative z-10 min-h-[100dvh] flex flex-col items-center justify-center px-5 py-16 gap-3.5">
        {/* iKout wordmark */}
        <div className="mb-2 text-center select-none">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight">
            <span className="text-amber-400 drop-shadow-[0_2px_10px_rgba(251,191,36,0.35)]">i</span>
            <span className="text-white drop-shadow-[0_2px_10px_rgba(255,255,255,0.15)]">Kout</span>
          </h1>
          <p className="text-[11px] text-amber-200/60 font-bold mt-1">لعبة الكوت الكويتية</p>
        </div>

        {tiles.map(tile => (
          <button
            key={tile.id}
            type="button"
            onClick={tile.enabled ? () => { playTapSound(); tile.onClick?.(); } : undefined}
            aria-disabled={!tile.enabled}
            className={`w-full max-w-md h-[74px] rounded-2xl border-2 px-4 flex items-center gap-3 transition-all ${
              tile.enabled
                ? 'bg-gradient-to-l from-amber-500/15 via-amber-400/10 to-transparent border-amber-400/70 shadow-[0_0_24px_rgba(251,191,36,0.12)] active:scale-[0.98] cursor-pointer hover:border-amber-300'
                : 'bg-neutral-900/70 border-neutral-800 opacity-60 cursor-default'
            }`}
          >
            {tile.logo && (
              <span className="w-11 h-11 rounded-xl bg-amber-400 text-black flex items-center justify-center font-black text-lg shadow-inner shrink-0">K</span>
            )}
            <span className="flex-1 text-right">
              <span className={`block text-base font-black ${tile.enabled ? 'text-amber-200' : 'text-neutral-400'}`}>{tile.title}</span>
              <span className="block text-[10px] font-bold text-amber-200/50 mt-0.5">{tile.subtitle}</span>
            </span>
            {tile.enabled && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />}
          </button>
        ))}
      </main>

      {profileOpen && <ProfileEditor onClose={() => setProfileOpen(false)} />}
    </div>
  );
};

/** Small avatar resolved from the player's chosen character face. */
const HomeAvatar: React.FC<{ characterId: string; name: string }> = ({ characterId, name }) => {
  return <img src={characterFace(characterId)} alt={name} className="w-full h-full object-cover" />;
};

export default HomeScreen;
