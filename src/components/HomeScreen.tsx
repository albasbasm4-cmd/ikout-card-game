/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ProfileEditor } from './ProfileEditor';
import { useProfile, characterFace } from '../utils/profile';
import { countryName, flagUrl } from '../utils/countries';
import { useXp } from '../utils/xp';
import { playTapSound } from '../utils/audio';

export interface HomeScreenProps {
  onEnterSetup: () => void;
  className?: string;
}

/**
 * Main menu after the splash: a sky with drifting clouds over a city
 * silhouette (Kuwait Towers included), the player's profile cluster in the
 * top-left corner, and four mode cards. Background stays clean — no toolbar,
 * shop, currency or chat icons.
 */
export const HomeScreen: React.FC<HomeScreenProps> = ({ onEnterSetup, className = '' }) => {
  const profile = useProfile();
  const { level, inLevel, needed } = useXp();
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <div dir="rtl" className={`relative w-full min-h-[100dvh] overflow-hidden home-sky ${className}`}>
      {/* Sun glow */}
      <div aria-hidden="true" className="absolute left-1/2 top-[6%] -translate-x-1/2 w-[70vmin] h-[70vmin] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,244,214,0.55) 0%, rgba(255,244,214,0.18) 42%, transparent 68%)' }} />

      {/* Drifting clouds — the whole cluster slides to the right and loops */}
      <Clouds />

      {/* Mode cards row */}
      <main className="relative z-10 min-h-[100dvh] flex flex-col items-center justify-center px-3 sm:px-6 pb-[16vh] pt-24">
        <div className="w-full max-w-5xl grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4">
          <ModeCard color="orange" title="ترب" onClick={onEnterSetup} enabled>
            <span className="inline-flex items-center justify-center px-4 py-1.5 rounded-full bg-white text-orange-600 text-sm font-black shadow active:scale-95">ابدأ اللعب</span>
            <p className="text-[10px] font-bold text-white/85 mt-1.5 text-center">كوت بوستة · كوت بوأربعة</p>
          </ModeCard>
          <ModeCard color="blue" title="اللعب الجماعي" />
          <ModeCard color="green" title="العب مع الأصدقاء" />
          <ModeCard color="pink" title="تدريب" />
        </div>
      </main>

      {/* City silhouette on the horizon */}
      <CitySkyline />

      {/* Profile cluster — top-left corner */}
      <div className="absolute top-3 left-3 z-20 flex items-start gap-2">
        <button
          type="button"
          onClick={() => { playTapSound(); setProfileOpen(true); }}
          aria-label="الملف الشخصي"
          title="الملف الشخصي"
          className="w-12 h-12 sm:w-14 sm:h-14 rounded-full overflow-hidden border-[3px] border-white bg-neutral-300 shadow-lg active:scale-95 cursor-pointer shrink-0"
        >
          <HomeAvatar characterId={profile.characterId} name={profile.name} />
        </button>
        <div className="flex flex-col gap-1 min-w-[130px]">
          {/* Level star + XP bar */}
          <div className="flex items-center gap-1.5">
            <LevelStar level={level} />
            <div className="flex-1 h-4 rounded-full bg-slate-900/75 border border-slate-600/60 overflow-hidden shadow-inner" role="progressbar" aria-label="شريط الخبرة" aria-valuenow={inLevel} aria-valuemin={0} aria-valuemax={needed}>
              <div className="h-full rounded-full bg-gradient-to-l from-sky-300 to-sky-500 transition-[width] duration-500" style={{ width: `${Math.round((inLevel / needed) * 100)}%` }} />
            </div>
          </div>
          {/* Country flag (replaces the old rank shield) + player name */}
          <button
            type="button"
            onClick={() => { playTapSound(); setProfileOpen(true); }}
            aria-label="اختيار العلم"
            title="اختيار العلم"
            className="flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-full bg-slate-900/55 border border-slate-600/50 backdrop-blur-sm active:scale-95 cursor-pointer w-fit"
          >
            {profile.country
              ? <img src={flagUrl(profile.country)} alt="" className="w-6 h-4 rounded-[3px] border border-white/40 shadow" />
              : <GlobeIcon />}
            <span className="text-[11px] font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{profile.name || 'أنت'}</span>
          </button>
        </div>
      </div>

      {profileOpen && <ProfileEditor onClose={() => setProfileOpen(false)} />}
    </div>
  );
};


/** Blue star badge with the level number, like the reference screen. */
const LevelStar: React.FC<{ level: number }> = ({ level }) => (
  <span className="relative w-8 h-8 shrink-0 drop-shadow-[0_2px_3px_rgba(0,0,0,0.45)]" aria-label={`المستوى ${level}`}>
    <svg viewBox="0 0 40 40" className="w-full h-full">
      <defs>
        <linearGradient id="starFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6cc9ff" />
          <stop offset="100%" stopColor="#1e7fd6" />
        </linearGradient>
      </defs>
      <path d="M20 2 L25 13.5 L37.5 15 L28.5 23.8 L31 36.5 L20 30 L9 36.5 L11.5 23.8 L2.5 15 L15 13.5 Z"
        fill="url(#starFill)" stroke="#0f4f8f" strokeWidth="2" strokeLinejoin="round" />
    </svg>
    <span className="absolute inset-0 flex items-center justify-center text-white font-black text-[13px] pt-0.5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]">{level}</span>
  </span>
);

const GlobeIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 text-white/90" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" />
  </svg>
);

const CARD_COLORS: Record<string, string> = {
  orange: 'from-orange-400 to-orange-600',
  blue: 'from-sky-500 to-blue-600',
  green: 'from-emerald-500 to-green-600',
  pink: 'from-pink-400 to-fuchsia-600',
};

/** One big rounded mode card with a white crowd icon, like the reference. */
const ModeCard: React.FC<{ color: string; title: string; enabled?: boolean; onClick?: () => void; children?: React.ReactNode }> =
({ color, title, enabled = false, onClick, children }) => (
  <button
    type="button"
    onClick={enabled ? () => { playTapSound(); onClick?.(); } : undefined}
    aria-disabled={!enabled}
    className={`relative h-44 sm:h-52 rounded-[22px] overflow-hidden bg-gradient-to-b ${CARD_COLORS[color]} border-[3px] border-white/80 shadow-[0_10px_28px_rgba(0,0,0,0.25)] flex flex-col transition-transform ${enabled ? 'active:scale-[0.98] cursor-pointer hover:brightness-105' : 'cursor-default'}`}
  >
    <span className="block text-center text-white font-black text-base sm:text-lg pt-3 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">{title}</span>
    <span className="flex-1 flex flex-col items-center justify-center px-3 pb-3">
      {children ?? (
        <span className="opacity-80">
          <svg viewBox="0 0 24 24" className="w-14 h-14 text-white" fill="currentColor">
            <circle cx="9" cy="8" r="3.2" /><circle cx="15.5" cy="9" r="2.6" />
            <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5v1h-11zM15.5 15.4c2.6.3 5 2 5 4.6h-4.2c0-1.9-.7-3.4-1.9-4.4z" />
          </svg>
        </span>
      )}
    </span>
  </button>
);

/** Small avatar resolved from the player's chosen character face. */
const HomeAvatar: React.FC<{ characterId: string; name: string }> = ({ characterId, name }) => (
  <img src={characterFace(characterId)} alt={name} className="w-full h-full object-cover" />
);

/** Flat cartoon cloud used for the drifting layer. */
const CloudShape: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = '', style }) => (
  <svg viewBox="0 0 220 80" className={`ikout-cloud ${className}`} style={style} aria-hidden="true">
    <path d="M25 62 Q8 62 8 47 Q8 33 24 32 Q27 16 45 14 Q64 12 71 25 Q78 16 92 18 Q110 20 110 37 Q128 36 128 50 Q128 62 110 62 Z"
      fill="#ffffff" opacity="0.92" />
  </svg>
);

/** Several cloud layers, each sliding to the right at its own speed. */
const Clouds: React.FC = () => {
  const clouds: { top: string; w: number; dur: number; delay: number; op: number }[] = [
    { top: '4%',  w: 190, dur: 95, delay: 0,  op: 0.95 },
    { top: '10%', w: 130, dur: 70, delay: -25, op: 0.85 },
    { top: '16%', w: 240, dur: 120, delay: -60, op: 0.9 },
    { top: '7%',  w: 100, dur: 55, delay: -40, op: 0.75 },
    { top: '22%', w: 170, dur: 85, delay: -10, op: 0.8 },
    { top: '1%',  w: 150, dur: 105, delay: -80, op: 0.7 },
    { top: '26%', w: 120, dur: 65, delay: -50, op: 0.7 },
    { top: '13%', w: 210, dur: 110, delay: -95, op: 0.85 },
  ];
  return (
    <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[45%] pointer-events-none overflow-hidden">
      {clouds.map((c, i) => (
        <CloudShape key={i} style={{
          top: c.top,
          width: c.w,
          opacity: c.op,
          animationDuration: `${c.dur}s`,
          animationDelay: `${c.delay}s`,
        }} />
      ))}
    </div>
  );
};

/**
 * The city silhouette on the horizon — rows of towers with the Kuwait Towers
 * in the middle, drawn as a single wide SVG so it scales with the screen.
 */
const CitySkyline: React.FC = () => (
  <div aria-hidden="true" className="absolute bottom-0 inset-x-0 pointer-events-none">
    {/* haze above the skyline */}
    <div className="absolute inset-x-0 -top-10 h-10 bg-gradient-to-b from-transparent to-[#c9bda9]" />
    <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className="block w-full h-auto min-h-[18vh]">
      {/* back layer — lighter, taller towers */}
      <g fill="#9b9891" opacity="0.55">
        <rect x="30" y="60" width="26" height="180" />
        <rect x="120" y="40" width="34" height="200" />
        <polygon points="250,240 250,55 267,35 284,55 284,240" />
        <rect x="380" y="70" width="30" height="170" />
        <rect x="700" y="45" width="30" height="195" />
        <polygon points="830,240 830,60 848,38 866,60 866,240" />
        <rect x="950" y="75" width="26" height="165" />
        <rect x="1080" y="50" width="34" height="190" />
        <rect x="1160" y="90" width="30" height="150" />
      </g>
      {/* front layer — the dark silhouette */}
      <g fill="#5d5a53">
        <rect x="0" y="120" width="48" height="120" />
        <rect x="55" y="95" width="40" height="145" />
        <rect x="100" y="135" width="52" height="105" />
        <rect x="160" y="105" width="34" height="135" />
        <rect x="200" y="140" width="60" height="100" />
        <rect x="268" y="115" width="44" height="125" />
        <rect x="318" y="150" width="48" height="90" />
        <rect x="372" y="100" width="38" height="140" />
        <rect x="415" y="130" width="55" height="110" />
        {/* a dome mosque */}
        <rect x="478" y="150" width="70" height="90" />
        <path d="M480 150 Q513 112 546 150 Z" />
        <rect x="509" y="106" width="3" height="16" />
        <rect x="555" y="118" width="40" height="122" />
        {/* Kuwait Towers — two stems with spheres and spires */}
        <rect x="640" y="120" width="9" height="120" />
        <circle cx="644.5" cy="112" r="17" />
        <rect x="643" y="72" width="3" height="30" />
        <rect x="668" y="150" width="7" height="90" />
        <circle cx="671.5" cy="144" r="12" />
        <rect x="670.5" y="112" width="2.5" height="22" />
        {/* more city to the right */}
        <rect x="700" y="135" width="52" height="105" />
        <rect x="758" y="108" width="36" height="132" />
        <rect x="800" y="145" width="58" height="95" />
        <rect x="864" y="118" width="42" height="122" />
        <rect x="912" y="140" width="50" height="100" />
        <rect x="968" y="102" width="38" height="138" />
        <rect x="1012" y="132" width="55" height="108" />
        <rect x="1072" y="112" width="40" height="128" />
        <rect x="1118" y="145" width="82" height="95" />
      </g>
      {/* ground strip */}
      <rect x="0" y="232" width="1200" height="8" fill="#4e4c46" />
    </svg>
  </div>
);

export default HomeScreen;
