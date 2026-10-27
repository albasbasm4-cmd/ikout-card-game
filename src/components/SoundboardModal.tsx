import React from "react";
import { X, Volume2, Sparkles } from "lucide-react";
import { playTapSound } from "../utils/audio";
import { getCharacterData } from "../data/charactersData";
import { characterPortrait, loadPlayerProfile } from "../utils/playerProfile";
import { voiceSource } from "../utils/characterAudio";
import { voiceSet, type VoiceClip } from "../utils/gamePresentation";

export interface SoundboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPhrase: (phrase: string) => void;
  characterId?: string;
}

export const SoundboardModal: React.FC<SoundboardModalProps> = ({
  isOpen,
  onClose,
  onSelectPhrase,
  characterId,
}) => {
  if (!isOpen) return null;

  const activeCharId = characterId || loadPlayerProfile().characterId || "a1";
  const character = getCharacterData(activeCharId);

  // Verified clips only: every line here was transcribed from the character's
  // own restored audio, so the label always matches what is played.
  const set = voiceSet(activeCharId);
  const diwaniyaPhrases = set.chat.map((clip) => ({
    id: clip.file,
    label: clip.text,
    audioUrl: voiceSource(activeCharId, clip),
  }));
  const situations: Array<[string, VoiceClip | undefined]> = [
    ["نداء المزايدة", set.bid6], ["سبعة", set.bid7], ["ثمانية", set.bid8],
    ["طاف", set.pass], ["ملزوم", set.malzoom],
    ["أمر كلبس", set.suitC], ["أمر ديمان", set.suitD], ["أمر سبيت", set.suitS], ["أمر حس", set.suitH],
    ["الميكر", set.maker], ["الجيكر", set.joker], ["أكة", set.ace],
    ["ترحيب", set.welcome], ["فوز", set.win], ["خسارة", set.lose],
  ];
  const reactionPhrases = situations
    .filter(([, clip]) => !!clip)
    .map(([label, clip]) => ({
      id: clip!.file,
      label: `${label}: ${clip!.text}`,
      audioUrl: voiceSource(activeCharId, clip!),
    }));

  const handlePhraseClick = (phraseText: string, audioUrl: string) => {
    // Play the character's authentic voice clip immediately
    try {
      const sound = new Audio(audioUrl);
      sound.play().catch(() => {});
    } catch {
      // Audio fallback
    }
    onSelectPhrase(phraseText);
    onClose();
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 p-safe z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-neutral-900 border-2 border-amber-500/50 rounded-3xl p-4 sm:p-6 shadow-2xl text-amber-50 max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Character Identity */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img
                src={characterPortrait(activeCharId)}
                alt={character.name}
                className="w-11 h-11 rounded-2xl object-cover border-2 border-amber-400 shadow-md bg-neutral-800"
              />
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-amber-400 text-neutral-950 flex items-center justify-center">
                <Volume2 className="w-2.5 h-2.5" />
              </div>
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-amber-400 flex items-center gap-1.5">
                عبارات وأصوات {character.name}
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              </h3>
              <p className="text-[11px] text-amber-200/70">
                باقة الصوت الأصلية: {character.title} ({character.voiceBundle})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              playTapSound();
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-amber-200 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Phrases List */}
        <div className="overflow-y-auto py-3 space-y-4 pr-1 scrollbar-thin">
          {/* Diwaniya Group */}
          <div>
            <h4 className="text-[12px] font-bold text-amber-300/90 mb-2 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              حماس ولعب الديوانية
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {diwaniyaPhrases.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handlePhraseClick(item.label, item.audioUrl)}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-800/80 hover:bg-amber-600/30 border border-amber-500/20 hover:border-amber-400/60 transition-all text-right group cursor-pointer active:scale-95 shadow-sm"
                >
                  <span className="text-xs font-semibold text-neutral-100 group-hover:text-amber-300 transition-colors truncate">
                    {item.label}
                  </span>
                  <Volume2 className="w-3.5 h-3.5 text-amber-400/60 group-hover:text-amber-300 shrink-0 mr-1 transition-transform group-hover:scale-110" />
                </button>
              ))}
            </div>
          </div>

          {/* Reactions and Taunts Group */}
          <div>
            <h4 className="text-[12px] font-bold text-amber-300/90 mb-2 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              تحدي وتفاعل ونتائج
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {reactionPhrases.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handlePhraseClick(item.label, item.audioUrl)}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-800/80 hover:bg-amber-600/30 border border-amber-500/20 hover:border-amber-400/60 transition-all text-right group cursor-pointer active:scale-95 shadow-sm"
                >
                  <span className="text-xs font-semibold text-neutral-100 group-hover:text-amber-300 transition-colors truncate">
                    {item.label}
                  </span>
                  <Volume2 className="w-3.5 h-3.5 text-amber-400/60 group-hover:text-amber-300 shrink-0 mr-1 transition-transform group-hover:scale-110" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-amber-200/60 shrink-0">
          <span>أصوات باقة {character.name} مسجلة وحصرية لشخصيتك</span>
          <button
            type="button"
            onClick={onClose}
            className="text-amber-400 hover:underline font-bold text-xs cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
