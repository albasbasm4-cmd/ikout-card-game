import React from 'react';
import { UserCircle2 } from 'lucide-react';
import { CARD_THEMES, CHARACTER_IDS, TABLE_THEMES, characterFace, saveProfile, useProfile } from '../utils/profile';

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
          {CHARACTER_IDS.map(id => (
            <button key={id} type="button" aria-pressed={profile.characterId === id} aria-label={`شخصية ${id}`} className="profile-portrait" onClick={() => saveProfile({ characterId: id })}><img src={characterFace(id)} alt="" loading="lazy" /></button>
          ))}
        </div>
      </div>
      <div className="profile-field"><span>شكل الطاولة</span>
        <div className="profile-options">
          {TABLE_THEMES.map(t => (
            <button key={t.id} type="button" aria-pressed={profile.table === t.id} className="profile-table-swatch" onClick={() => saveProfile({ table: t.id })}>
              <img src={t.image} alt="" className="swatch-disc w-9 h-9 object-cover rounded-full" /><small>{t.label}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="profile-field"><span>تصميم الورق</span>
        <div className="profile-options">
          {CARD_THEMES.map(t => (
            <button key={t.id} type="button" aria-pressed={profile.cards === t.id} className="profile-card-swatch" onClick={() => saveProfile({ cards: t.id })}>
              <img src={t.back} alt="" className="w-9 h-12 object-cover rounded-md" /><small>{t.label}</small>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};
export default ProfilePanel;
