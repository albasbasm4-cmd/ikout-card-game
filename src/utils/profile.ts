import { useEffect, useState } from 'react';
import shemagh from '../assets/gameplay/shemagh-player.png.asset.json';
import elder from '../assets/gameplay/elder-player.png.asset.json';
import green from '../assets/gameplay/green-player.png.asset.json';
import glasses from '../assets/reference/glasses.png.asset.json';

export const PORTRAITS = [elder.url, shemagh.url, green.url, glasses.url];
export type TableTheme = 'stone' | 'wood' | 'night';
export type CardTheme = 'classic' | 'royal' | 'night';
export const TABLE_THEMES: { id: TableTheme; label: string }[] = [
  { id: 'stone', label: 'حوش الحجر' }, { id: 'wood', label: 'ديوانية خشب' }, { id: 'night', label: 'سهرة ليلية' },
];
export const CARD_THEMES: { id: CardTheme; label: string }[] = [
  { id: 'classic', label: 'كلاسيك' }, { id: 'royal', label: 'ملكي ذهبي' }, { id: 'night', label: 'ليلي' },
];
export interface PlayerProfile { name: string; portrait: number; table: TableTheme; cards: CardTheme }
export const DEFAULT_PROFILE: PlayerProfile = { name: 'أنت', portrait: 0, table: 'stone', cards: 'classic' };
const KEY = 'ikout_profile_v1';
const listeners = new Set<(p: PlayerProfile) => void>();

export function loadProfile(): PlayerProfile {
  if (typeof window === 'undefined') return DEFAULT_PROFILE;
  try {
    const p = { ...DEFAULT_PROFILE, ...JSON.parse(localStorage.getItem(KEY) || '{}') } as PlayerProfile;
    if (!TABLE_THEMES.some(t => t.id === p.table)) p.table = 'stone';
    if (!CARD_THEMES.some(t => t.id === p.cards)) p.cards = 'classic';
    if (!(p.portrait >= 0 && p.portrait < PORTRAITS.length)) p.portrait = 0;
    return p;
  } catch { return DEFAULT_PROFILE; }
}
export function saveProfile(partial: Partial<PlayerProfile>): PlayerProfile {
  const next = { ...loadProfile(), ...partial };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  listeners.forEach(l => l(next));
  return next;
}
export function useProfile(): PlayerProfile {
  const [p, setP] = useState<PlayerProfile>(DEFAULT_PROFILE);
  useEffect(() => { setP(loadProfile()); listeners.add(setP); return () => { listeners.delete(setP); }; }, []);
  return p;
}
