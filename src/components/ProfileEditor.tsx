/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, Save, UserCircle2 } from 'lucide-react';
import { CARD_THEMES, CHARACTER_IDS, PlayerProfile, TABLE_THEMES, characterFace, loadProfile, saveProfile, useProfile } from '../utils/profile';
import { playTapSound } from '../utils/audio';

export interface ProfileEditorProps {
  /** Called after changes are saved (or discarded) to return to the previous screen. */
  onClose: (saved: boolean) => void;
}

/**
 * Full-screen profile editor opened from the home screen.
 * Edits stay as a draft until the player presses "حفظ التعديلات";
 * the X button in the top-left corner leaves without saving.
 */
export const ProfileEditor: React.FC<ProfileEditorProps> = ({ onClose }) => {
  const saved = useProfile();
  const [draft, setDraft] = useState<PlayerProfile>(() => loadProfile());

  const apply = (partial: Partial<PlayerProfile>) => setDraft(prev => ({ ...prev, ...partial }));

  const save = () => {
    playTapSound();
    saveProfile(draft);
    onClose(true);
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4" dir="rtl">
      <div className="relative w-full max-w-md max-h-[92dvh] overflow-y-auto bg-neutral-950 border-2 border-amber-500/50 rounded-3xl p-4 sm:p-5 shadow-2xl text-amber-50 animate-in zoom-in-95 duration-200">
        {/* Exit without saving — top-left */}
        <button
          type="button"
          onClick={() => onClose(false)}
          aria-label="خروج دون حفظ"
          title="خروج دون حفظ"
          className="absolute top-4 left-4 w-8 h-8 rounded-full bg-neutral-800 text-white border border-neutral-600 flex items-center justify-center shadow-lg active:scale-95 cursor-pointer hover:bg-neutral-700"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-base font-black text-amber-300 flex items-center gap-2 justify-center mb-4 pb-2 border-b border-amber-500/25">
          <UserCircle2 className="w-5 h-5" />
          الملف الشخصي
        </h2>

        {/* الشخصية */}
        <div className="mb-4">
          <span className="text-xs font-bold text-amber-200/80 block mb-1.5">الشخصية</span>
          <div className="grid grid-cols-6 gap-2 max-h-56 overflow-y-auto pr-1">
            {CHARACTER_IDS.map(id => (
              <button
                key={id}
                type="button"
                aria-pressed={draft.characterId === id}
                title={`شخصية ${id.replace('a', '')}`}
                onClick={() => { playTapSound(); apply({ characterId: id }); }}
                className={`aspect-square rounded-2xl overflow-hidden border-2 transition-all active:scale-95 cursor-pointer ${
                  draft.characterId === id
                    ? 'border-amber-400 ring-2 ring-amber-400/40 shadow-lg'
                    : 'border-neutral-700 hover:border-amber-400/50'
                }`}
              >
                <img src={characterFace(id)} alt={`شخصية ${id}`} loading="lazy" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        {/* الاسم */}
        <label className="mb-4 block">
          <span className="text-xs font-bold text-amber-200/80 block mb-1.5">الاسم</span>
          <input
            value={draft.name}
            maxLength={16}
            onChange={e => apply({ name: e.target.value })}
            placeholder="اكتب اسمك هنا"
            className="w-full bg-black/50 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white font-semibold focus:outline-none focus:border-amber-400"
          />
        </label>

        {/* شكل الطاولة */}
        <div className="mb-4">
          <span className="text-xs font-bold text-amber-200/80 block mb-1.5">شكل طاولة اللعب</span>
          <div className="grid grid-cols-3 gap-2">
            {TABLE_THEMES.map(t => (
              <button
                key={t.id}
                type="button"
                aria-pressed={draft.table === t.id}
                onClick={() => { playTapSound(); apply({ table: t.id }); }}
                className={`rounded-xl border overflow-hidden transition-all active:scale-95 cursor-pointer ${
                  draft.table === t.id
                    ? 'border-amber-400 ring-2 ring-amber-400/40 shadow-md'
                    : 'border-neutral-700 hover:border-amber-400/50'
                }`}
              >
                <img src={t.image} alt={t.label} className="w-full h-16 object-cover" />
                <span className="block py-1 text-[10px] font-black bg-black/60 text-amber-200">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* شكل الأوراق */}
        <div className="mb-5">
          <span className="text-xs font-bold text-amber-200/80 block mb-1.5">شكل أوراق اللعب</span>
          <div className="grid grid-cols-3 gap-2">
            {CARD_THEMES.map(t => (
              <button
                key={t.id}
                type="button"
                aria-pressed={draft.cards === t.id}
                onClick={() => { playTapSound(); apply({ cards: t.id }); }}
                className={`rounded-xl border overflow-hidden transition-all active:scale-95 cursor-pointer ${
                  draft.cards === t.id
                    ? 'border-amber-400 ring-2 ring-amber-400/40 shadow-md'
                    : 'border-neutral-700 hover:border-amber-400/50'
                }`}
              >
                <img src={t.back} alt={t.label} className="w-full h-16 object-cover" />
                <span className="block py-1 text-[10px] font-black bg-black/60 text-amber-200">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* حفظ التعديلات */}
        <button
          type="button"
          onClick={save}
          className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 text-black font-black text-sm shadow-xl active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 border border-amber-200"
        >
          <Save className="w-4 h-4" />
          <span>حفظ التعديلات</span>
        </button>
      </div>
    </div>
  );
};

export default ProfileEditor;
