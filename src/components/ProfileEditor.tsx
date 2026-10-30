/** @license SPDX-License-Identifier: Apache-2.0 */
import React, { useState } from 'react';
import { UserRound, Layers, RectangleHorizontal, Flag, Volume2, X, Check, IdCard } from 'lucide-react';
import { Button } from './ui/button';
import { CARD_THEMES, CHARACTER_IDS, TABLE_THEMES, characterFace, saveProfile, useProfile } from '../utils/profile';
import { MUSLIM_COUNTRIES, flagUrl, countryName } from '../utils/countries';
import { CharacterId } from '../utils/gamePresentation';
import { playRandomCharacterClip } from '../utils/characterAudio';
import { playTapSound } from '../utils/audio';

export interface ProfileEditorProps { onClose: () => void; game?: 'kout' | '187' }
type Tab = 'character' | 'cards' | 'table' | 'flag' | 'identity';
const TABS = [
  { id: 'character' as const, label: 'الشخصيات', icon: UserRound },
  { id: 'cards' as const, label: 'الأوراق', icon: Layers },
  { id: 'table' as const, label: 'الطاولات', icon: RectangleHorizontal },
  { id: 'flag' as const, label: 'الأعلام', icon: Flag },
  { id: 'identity' as const, label: 'الملف الشخصي', icon: IdCard },
];
export const ProfileEditor: React.FC<ProfileEditorProps> = ({ onClose, game = 'kout' }) => {
  const profile = useProfile();
  const [tab, setTab] = useState<Tab>('character');
  const choose = (partial: Parameters<typeof saveProfile>[0]) => { playTapSound(); saveProfile(partial); };
  return <section className="pc-catalog" dir="rtl" role="dialog" aria-modal="true" aria-label="خيارات اللاعب">
    <header className="pc-header">
      <nav className="pc-tabs" aria-label="أقسام الخيارات">
        {TABS.map(({ id, label, icon: Icon }) => <Button key={id} variant="ghost" title={label} aria-label={label} aria-pressed={tab === id} className={`pc-tab ${tab === id ? 'pc-selected' : ''}`} onClick={() => { playTapSound(); setTab(id); }}><Icon /></Button>)}
      </nav>
      <Button variant="ghost" size="icon" className="pc-close" onClick={onClose} aria-label="إغلاق"><X /></Button>
    </header>
    <h2>{TABS.find(t => t.id === tab)?.label}</h2>
    {tab === 'character' && <div className="pc-grid">
      {CHARACTER_IDS.map(id => <div key={id} className="pc-character">
        <Button variant="ghost" className={`pc-item ${profile.characterId === id ? 'pc-selected' : ''}`} aria-label={`شخصية ${id}`} aria-pressed={profile.characterId === id} onClick={() => choose({ characterId: id })}><img src={characterFace(id)} alt="" loading="lazy" /></Button>
        {game !== '187' && <Button variant="ghost" size="icon" className="pc-voice" aria-label={`استماع لشخصية ${id}`} title="استماع للصوت" onClick={() => playRandomCharacterClip(id as CharacterId, 0)}><Volume2 /></Button>}
      </div>)}
    </div>}
    {tab === 'table' && <div className="pc-grid pc-grid-table">{TABLE_THEMES.map(t => <Button key={t.id} variant="ghost" className={`pc-item ${profile.table === t.id ? 'pc-selected' : ''}`} aria-pressed={profile.table === t.id} onClick={() => choose({ table: t.id })}><img src={t.image} alt="" loading="lazy" /><span>{t.label}</span></Button>)}</div>}
    {tab === 'cards' && <div className="pc-grid pc-grid-cards">{CARD_THEMES.map(t => <Button key={t.id} variant="ghost" className={`pc-item ${profile.cards === t.id ? 'pc-selected' : ''}`} aria-pressed={profile.cards === t.id} onClick={() => choose({ cards: t.id })}><img src={t.back} alt="" loading="lazy" /><span>{t.label}</span></Button>)}</div>}
    {tab === 'flag' && <div className="pc-grid">
      <Button variant="ghost" className={`pc-item ${profile.country === null ? 'pc-selected' : ''}`} aria-pressed={profile.country === null} onClick={() => choose({ country: null })}><Flag /><span>بدون علم</span></Button>
      {MUSLIM_COUNTRIES.map(c => <Button key={c.code} variant="ghost" className={`pc-item ${profile.country === c.code ? 'pc-selected' : ''}`} aria-pressed={profile.country === c.code} onClick={() => choose({ country: c.code })}><img src={flagUrl(c.code) ?? undefined} alt="" loading="lazy" /><span>{countryName(c.code)}</span></Button>)}
    </div>}
    {tab === 'identity' && <div className="pc-identity"><img src={characterFace(profile.characterId)} alt="" /><label htmlFor="pc-name">اسم اللاعب</label><input id="pc-name" value={profile.name} maxLength={14} onChange={e => saveProfile({ name: e.target.value })} /><Button className="pc-name-done" onClick={onClose}><Check />تم</Button></div>}
  </section>;
};
export default ProfileEditor;
