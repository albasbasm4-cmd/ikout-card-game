/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { ProfileEditor } from './ProfileEditor';
import { Button } from './ui/button';
import { UserRound } from 'lucide-react';
import { SettingsPanel } from './SettingsPanel';
import { useProfile, characterFace } from '../utils/profile';
import { countryName, flagUrl } from '../utils/countries';
import { useXp } from '../utils/xp';
import { useSettings } from '../store/useSettings';
import { useStageFit } from '../hooks/use-stage-fit';
import { playTapSound } from '../utils/audio';

export interface HomeScreenProps {
  onEnterSetup: () => void;
  onEnter187?: () => void;
  className?: string;
}

/**
 * The home menu, ported 1:1 from the approved home.html design: a fixed
 * 1536x691 stage (rotated automatically in portrait), drifting SVG clouds,
 * the city skyline, the profile cluster, the settings gear in the top-right
 * and the four game cards rising right after the creeper intro.
 */
export const HomeScreen: React.FC<HomeScreenProps> = ({ onEnterSetup, onEnter187, className = '' }) => {
  const profile = useProfile();
  const { level, inLevel, needed } = useXp();
  const { settings } = useSettings();
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const starRef = useRef<HTMLDivElement | null>(null);
  const prevLevel = useRef(level);

  // Fit the fixed stage into the viewport; rotate when the phone is portrait.
  useStageFit(stageRef, 1536, 691, settings.orientationPreference);

  // Cards rise as soon as the menu is revealed (the intro explodes above it).
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => el.classList.add('go'));
    return () => cancelAnimationFrame(id);
  }, []);

  // Star bumps on level-up.
  useEffect(() => {
    if (level !== prevLevel.current && starRef.current) {
      prevLevel.current = level;
      const s = starRef.current;
      s.classList.remove('bump');
      void s.offsetWidth;
      s.classList.add('bump');
    }
  }, [level]);

  return (
    <div dir="rtl" className={`ik-home ${className}`}>
      <div id="st" ref={stageRef} className="ik-stage">
        {/* Drifting clouds */}
        <Clouds />

        {/* City skyline */}
        <CitySkyline />
        <div className="ik-gd" />

        {/* Profile cluster */}
        <div
          className="ik-prof"
          onClick={() => { playTapSound(); setProfileOpen(true); }}
          role="button"
          aria-label="الملف الشخصي"
        >
          <div className="ik-av">
            <img src={characterFace(profile.characterId)} alt={profile.name} />
          </div>
          <div className="ik-ls" ref={starRef}>
            <svg viewBox="0 0 40 40">
              <polygon points="20,2 25,14 38,15 28,24 31,37 20,30 9,37 12,24 2,15 15,14"
                fill="#1fa3e6" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
            </svg>
            <b>{level}</b>
          </div>
          <div className="ik-xpb" aria-label="شريط الخبرة">
            <i style={{ width: `${Math.round((inLevel / needed) * 100)}%` }} />
          </div>
          {profile.country
            ? <img className="ik-fb" src={flagUrl(profile.country) ?? undefined} alt={countryName(profile.country) ?? profile.country} style={{ width: 44, height: 30, objectFit: 'cover', borderRadius: 6, border: '2px solid #fff' }} />
            : <div className="ik-fb">🌐</div>}
          <div className="ik-un" dir="ltr">{profile.name || 'أنت'}</div>
        </div>

        {/* Game mode cards — c1: كوت, c2: 187 */}
        <ModeCard id="c1" left={236} width={346} delay={0.05} image="/assets/ikout/home/c1.webp"
          enabled label="كوت" onClick={() => { playTapSound(); onEnterSetup(); }} />
        <ModeCard id="c2" left={602} width={220} delay={0.12} image="/assets/ikout/home/c2.webp"
          enabled label="187" onClick={() => { playTapSound(); onEnter187?.(); }} />
        <ModeCard id="c3" left={842} width={220} delay={0.19} image="/assets/ikout/home/c3.webp" label="قريبا" />
        <ModeCard id="c4" left={1082} width={218} delay={0.26} image="/assets/ikout/home/c4.webp" label="قريبا" />

        <Button variant="ghost" className="pc-open" aria-label="خيارات اللاعب" title="خيارات اللاعب" onClick={() => { playTapSound(); setProfileOpen(true); }}><UserRound /></Button>

        {/* Settings gear — top-right */}
        <button
          type="button"
          className="ik-gear"
          aria-label="الإعدادات"
          title="الإعدادات"
          onClick={() => { playTapSound(); setSettingsOpen(true); }}
        >
          ⚙︎
        </button>

        {profileOpen && <ProfileEditor onClose={() => setProfileOpen(false)} />}
        {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      </div>
    </div>
  );
};

/** One of the four mode cards; enabled ones open their screen. */
const ModeCard: React.FC<{
  id: string; left: number; width: number; delay: number; image: string;
  label: string; enabled?: boolean; onClick?: () => void;
}> = ({ id, left, width, delay, image, label, enabled = false, onClick }) => (
  <div
    className="ik-card"
    id={id}
    style={{ left, width, ['--i' as string]: `url(${image})`, animationDelay: `${delay}s` }}
    onClick={enabled ? onClick : undefined}
    role={enabled ? 'button' : undefined}
    aria-label={label}
    aria-disabled={!enabled}
  >
    <div className="ik-gm" />
  </div>
);

/** The five drifting cloud clusters from the design. */
const Clouds: React.FC = () => {
  const clouds = [
    { top: 95, w: 280, dur: 100, delay: -62 },
    { top: 80, w: 240, dur: 130, delay: -88 },
    { top: 118, w: 340, dur: 160, delay: -20 },
    { top: 50, w: 200, dur: 110, delay: -100 },
    { top: 150, w: 190, dur: 85, delay: -45 },
  ];
  return (
    <>
      {clouds.map((c, i) => (
        <svg key={i} className="ik-cl" viewBox="0 0 300 100"
          style={{ top: c.top, width: c.w, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }}>
          <g fill="url(#ik-cloud-g)">
            <ellipse cx="150" cy="78" rx="145" ry="20" />
            <circle cx="85" cy="58" r="30" />
            <circle cx="145" cy="42" r="40" />
            <circle cx="210" cy="56" r="32" />
          </g>
          <defs>
            <linearGradient id="ik-cloud-g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#eef2ea" />
              <stop offset="1" stopColor="#bfc9bb" />
            </linearGradient>
          </defs>
        </svg>
      ))}
    </>
  );
};

/**
 * The city silhouette — rows of towers (width, top) with the Kuwait Towers
 * in the middle, exactly as in the approved design.
 */
const BUILDINGS: [number, number, number][] = [
  [0,60,482],[60,60,512],[120,70,532],[190,60,500],[250,50,542],[300,60,490],[360,60,532],[420,50,512],[470,40,562],[505,55,440],
  [560,45,522],[600,50,578],[650,50,546],[700,45,582],[800,50,572],[850,50,536],[900,60,592],[960,60,546],[1020,50,510],[1070,40,552],
  [1110,38,468],[1148,52,522],[1200,60,562],[1260,60,536],[1320,50,502],[1370,50,546],[1420,50,486],[1470,66,530],
];
const CitySkyline: React.FC = () => (
  <svg viewBox="0 0 1536 691" style={{ position: 'absolute', inset: 0 }} aria-hidden="true">
    <g fill="#3b4247">
      {BUILDINGS.map(([x, w, t], i) => (
        <rect key={i} x={x + w / 2} y={t - 38} width={w} height={400} />
      ))}
    </g>
    <g fill="#4b5359">
      <rect x="764" y="500" width="10" height="140" />
      <ellipse cx="769" cy="494" rx="16" ry="30" />
      <rect x="767" y="430" width="4" height="64" />
    </g>
    <g fill="#25292c">
      {BUILDINGS.map(([x, w, t], i) => (
        <g key={i}>
          <rect x={x} y={t} width={w + 1} height={640 - t} />
          {t < 500 && <rect x={x + w / 2 - 1} y={t - 26} width={3} height={27} />}
        </g>
      ))}
    </g>
  </svg>
);

export default HomeScreen;
