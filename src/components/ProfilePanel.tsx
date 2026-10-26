import React from 'react';
import { UserCircle2 } from 'lucide-react';
import { CARD_THEMES, PORTRAITS, TABLE_THEMES, saveProfile, useProfile } from '../utils/profile';
import { Card } from './Card';

export const ProfilePanel: React.FC<{ onNameChange?: (name: string) => void }> = ({ onNameChange }) => {
  const profile = useProfile();
  return (
    <section className="profile-panel" aria-label="الملف الشخصي">
      <h2><UserCircle2 className="w-4 h-4" /> الملف الشخصي</h2>
      <label className="profile-field">
        <span>الاسم</span>
        <input value={profile.name} maxLength={16} onChange={e => { saveProfile({ name: e.target.value }); onNameChange?.(e.target.value || 'أنت'); }} />
      </label>
      <div className="profile-field"><span>الشخصية</span>
        <div className="profile-options">
          {PORTRAITS.map((src, i) => (
            <button key={src + i} type="button" aria-pressed={profile.portrait === i} aria-label={`شخصية ${i + 1}`} className="profile-portrait" onClick={() => saveProfile({ portrait: i })}><img src={src} alt="" /></button>
          ))}
        </div>
      </div>
      <div className="profile-field"><span>شكل الطاولة</span>
        <div className="profile-options">
          {TABLE_THEMES.map(t => (
            <button key={t.id} type="button" aria-pressed={profile.table === t.id} className={`profile-table-swatch table-theme-${t.id}`} onClick={() => saveProfile({ table: t.id })}>
              <span className="swatch-disc" /><small>{t.label}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="profile-field"><span>تصميم الورق</span>
        <div className="profile-options">
          {CARD_THEMES.map(t => (
            <button key={t.id} type="button" aria-pressed={profile.cards === t.id} className={`profile-card-swatch card-theme-${t.id}`} onClick={() => saveProfile({ cards: t.id })}>
              <Card card={{ id: `prev-${t.id}`, suit: 'H', rank: 14 }} size="sm" /><small>{t.label}</small>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};
export default ProfilePanel;
