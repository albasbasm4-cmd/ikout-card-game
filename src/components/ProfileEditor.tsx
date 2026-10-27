/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  CARD_THEMES, CHARACTER_IDS, PlayerProfile, TABLE_THEMES, characterFace, loadProfile, saveProfile, useProfile,
} from '../utils/profile';
import { MUSLIM_COUNTRIES, flagUrl, countryName } from '../utils/countries';
import { CharacterId } from '../utils/gamePresentation';
import { playRandomCharacterClip } from '../utils/characterAudio';
import { playTapSound } from '../utils/audio';
import { useXp } from '../utils/xp';

export interface ProfileEditorProps {
  onClose: () => void;
}

type Tab = 'character' | 'table' | 'cards' | 'flag';

const TABS: { id: Tab; label: string }[] = [
  { id: 'character', label: 'الشخصية' },
  { id: 'table', label: 'شكل الطاولة' },
  { id: 'cards', label: 'شكل الأوراق' },
  { id: 'flag', label: 'العلم' },
];

/**
 * The profile panel, opened by tapping the profile image on the home screen.
 * Same panel look as the approved design: white border, blue gradient, gold
 * title, option grids. Tabs: all 36 characters (each tap previews that
 * character's real voice), table style, card backs and the country flag.
 * Every change applies immediately, exactly like the design.
 */
export const ProfileEditor: React.FC<ProfileEditorProps> = ({ onClose }) => {
  const { level, inLevel, needed } = useXp();
  const [profile, setProfile] = useState<PlayerProfile>(() => loadProfile());
  const [tab, setTab] = useState<Tab>('character');
  const [pop, setPop] = useState<string | null>(null);

  const apply = (partial: Partial<PlayerProfile>) => {
    const next = saveProfile(partial);
    setProfile(next);
  };

  const chooseCharacter = (id: string) => {
    playTapSound();
    apply({ characterId: id });
    // Preview: ONE random clip from the tapped character's own bundle.
    playRandomCharacterClip(id as CharacterId, 0);
  };

  const popOnce = (text: string) => {
    setPop(text);
    setTimeout(() => setPop(null), 1300);
  };

  return (
    <div className="ik-ov" onClick={e => { if (e.target === e.currentTarget) onClose(); }} dir="rtl">
      <div className="ik-pn">
        <button type="button" className="ik-x" onClick={onClose} aria-label="إغلاق">✕</button>
        <h2>الملف الشخصي</h2>
        <div className="ik-pb">
          {/* Left column: identity, level and XP */}
          <div className="ik-col l">
            <div className="ik-big">
              <img src={characterFace(profile.characterId)} alt={profile.name} />
            </div>
            <input
              className="ik-nm"
              maxLength={14}
              dir="ltr"
              value={profile.name}
              aria-label="اسم اللاعب"
              onChange={e => apply({ name: e.target.value.trim() || 'أنت' })}
            />
            <h3>المستوى <span style={{ color: '#5ed3ff' }}>{level}</span></h3>
            <div className="ik-rel">
              <div className="ik-xpbig">
                <i style={{ width: `${Math.round((inLevel / needed) * 100)}%` }} />
                <span>{inLevel} / {needed} XP</span>
              </div>
              {pop && <div className="ik-pop" style={{ top: -8 }}>{pop}</div>}
            </div>
            <div className="ik-sm">كل فوز = 30 خبرة، ومع كل فوز متتالٍ +5 إضافية</div>
          </div>

          {/* Right column: tabs + option grid */}
          <div className="ik-col">
            <div className="ik-tabs">
              {TABS.map(t => (
                <button
                  key={t.id}
                  type="button"
                  className={`ik-tab ${tab === t.id ? 'on' : ''}`}
                  onClick={() => { playTapSound(); setTab(t.id); }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'character' && (
              <div className="ik-grid" style={{ gridTemplateColumns: 'repeat(6,1fr)' }}>
                {CHARACTER_IDS.map(id => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={profile.characterId === id}
                    title={`شخصية ${id.replace('a', '')}`}
                    onClick={() => chooseCharacter(id)}
                    className={`ik-f ${profile.characterId === id ? 'on' : ''}`}
                  >
                    <img src={characterFace(id)} alt={`شخصية ${id}`} loading="lazy" />
                  </button>
                ))}
              </div>
            )}

            {tab === 'table' && (
              <div className="ik-grid">
                {TABLE_THEMES.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={profile.table === t.id}
                    title={t.label}
                    onClick={() => { playTapSound(); apply({ table: t.id }); }}
                    className={`ik-f ${profile.table === t.id ? 'on' : ''}`}
                  >
                    <img src={t.image} alt={t.label} loading="lazy" />
                    <span style={{ fontSize: 12 }}>{t.label}</span>
                  </button>
                ))}
              </div>
            )}

            {tab === 'cards' && (
              <div className="ik-grid">
                {CARD_THEMES.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={profile.cards === t.id}
                    title={t.label}
                    onClick={() => { playTapSound(); apply({ cards: t.id }); }}
                    className={`ik-f ${profile.cards === t.id ? 'on' : ''}`}
                  >
                    <img src={t.back} alt={t.label} loading="lazy" />
                    <span style={{ fontSize: 12 }}>{t.label}</span>
                  </button>
                ))}
              </div>
            )}

            {tab === 'flag' && (
              <div className="ik-grid" style={{ gridTemplateColumns: 'repeat(6,1fr)' }}>
                <button
                  type="button"
                  aria-pressed={profile.country === null}
                  aria-label="بدون علم"
                  onClick={() => { playTapSound(); apply({ country: null }); }}
                  className={`ik-f ${profile.country === null ? 'on' : ''}`}
                >
                  <span style={{ fontSize: 30 }}>🌐</span>
                  <span style={{ fontSize: 12 }}>بدون</span>
                </button>
                {MUSLIM_COUNTRIES.map(c => (
                  <button
                    key={c.code}
                    type="button"
                    aria-pressed={profile.country === c.code}
                    title={countryName(c.code) ?? c.code}
                    onClick={() => { playTapSound(); apply({ country: c.code }); popOnce(countryName(c.code) ?? ''); }}
                    className={`ik-f ${profile.country === c.code ? 'on' : ''}`}
                  >
                    <img src={flagUrl(c.code) ?? undefined} alt={c.code} loading="lazy" />
                    <span style={{ fontSize: 12 }}>{countryName(c.code)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileEditor;
