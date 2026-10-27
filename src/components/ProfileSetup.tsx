import React, { useEffect, useState, useRef } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Play,
  Square,
  UserRound,
  Volume2,
  X,
  Sparkles,
} from "lucide-react";
import type { PlayerProfile } from "../types/character";
import { CHARACTER_IDS, characterPortrait } from "../utils/playerProfile";
import { playTapSound } from "../utils/audio";
import {
  CHARACTER_CATEGORIES,
  getCharacterData,
  type CharacterCategory,
} from "../data/charactersData";

interface ProfileSetupProps {
  open: boolean;
  profile: PlayerProfile;
  onSave: (profile: PlayerProfile) => void;
  onClose: () => void;
  required?: boolean;
}

export function ProfileSetup({
  open,
  profile,
  onSave,
  onClose,
  required = false,
}: ProfileSetupProps) {
  const [nickname, setNickname] = useState(profile.nickname);
  const [characterId, setCharacterId] = useState(profile.characterId);
  const [selectedCategory, setSelectedCategory] = useState<CharacterCategory | "all">("all");
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const character = getCharacterData(characterId);
  const filteredIds =
    selectedCategory === "all"
      ? CHARACTER_IDS
      : CHARACTER_IDS.filter((id) => getCharacterData(id).category === selectedCategory);

  const selectedIndex = Math.max(
    0,
    filteredIds.indexOf(characterId as (typeof filteredIds)[number]),
  );

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setIsPlayingAudio(false);
  };

  useEffect(() => {
    if (open) {
      setNickname(profile.nickname);
      setCharacterId(profile.characterId);
    } else {
      stopAudio();
    }
    return () => {
      stopAudio();
    };
  }, [open, profile]);

  if (!open) return null;

  const move = (delta: number) => {
    stopAudio();
    const nextIdx = (selectedIndex + delta + filteredIds.length) % filteredIds.length;
    setCharacterId(filteredIds[nextIdx]);
  };

  const handleSelectCharacter = (id: string) => {
    playTapSound();
    stopAudio();
    setCharacterId(id);
  };

  const togglePreviewAudio = () => {
    if (isPlayingAudio) {
      stopAudio();
      return;
    }
    playTapSound();
    stopAudio();
    try {
      const audio = new Audio(character.welcomeAudioUrl);
      audioRef.current = audio;
      setIsPlayingAudio(true);
      audio.onended = () => setIsPlayingAudio(false);
      audio.onerror = () => setIsPlayingAudio(false);
      audio.play().catch(() => setIsPlayingAudio(false));
    } catch {
      setIsPlayingAudio(false);
    }
  };

  return (
    <div
      className="fixed inset-0 p-safe z-[100] flex items-center justify-center bg-black/80 p-3 backdrop-blur-md"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-title"
    >
      <section className="relative max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-3xl border-2 border-amber-400/40 bg-gradient-to-b from-[#10251a] via-[#0b1a13] to-[#06110b] p-5 text-amber-50 shadow-2xl scrollbar-thin">
        {!required && (
          <button
            type="button"
            onClick={() => {
              stopAudio();
              playTapSound();
              onClose();
            }}
            className="absolute left-4 top-4 rounded-full p-2 text-amber-100/70 hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="إغلاق"
          >
            <X size={20} />
          </button>
        )}

        {/* Header */}
        <div className="mb-4 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/40 bg-amber-400/10 text-amber-300 shadow-lg">
            <UserRound className="w-6 h-6" />
          </div>
          <h2
            id="profile-title"
            className="text-xl sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-100"
          >
            ملف اللاعب وشخصية الديوانية
          </h2>
          <p className="mt-1 text-xs text-amber-100/70">
            اختر اسمك المستعار وشخصيتك من بين الـ 35 شخصية الأصلية مع باقة صوتها الأصلية
          </p>
        </div>

        {/* Nickname Input */}
        <label className="mb-4 block text-xs sm:text-sm font-bold text-amber-200">
          الاسم المستعار (Nickname)
          <input
            value={nickname}
            onChange={(event) => setNickname(event.target.value.slice(0, 20))}
            maxLength={20}
            placeholder="اكتب اسمك المستعار..."
            className="mt-1.5 w-full rounded-xl border border-amber-300/30 bg-black/40 px-4 py-2.5 text-base text-white placeholder-white/30 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/50 transition-all shadow-inner"
          />
          <span className="mt-1 block text-left text-[10px] text-amber-100/40">
            {nickname.length}/20 حرفاً
          </span>
        </label>

        {/* Character Categories Filter */}
        <div className="mb-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-none">
            {CHARACTER_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  playTapSound();
                  setSelectedCategory(cat.id);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  selectedCategory === cat.id
                    ? "bg-amber-400 text-neutral-950 shadow-md font-black"
                    : "bg-white/5 hover:bg-white/10 text-amber-200/80 border border-white/5"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Selected Character Showcase */}
        <div className="mb-4 rounded-2xl border border-amber-300/25 bg-black/30 p-4 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-black text-amber-300 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              الشخصية المختارة
            </span>
            <span className="rounded-full bg-amber-400/15 border border-amber-400/30 px-2.5 py-0.5 text-[11px] font-black text-amber-200">
              {character.name} • {character.title}
            </span>
          </div>

          <div className="flex items-center justify-center gap-4 my-2">
            <button
              type="button"
              onClick={() => move(-1)}
              className="rounded-full border border-white/15 bg-white/5 p-2.5 text-amber-100 hover:bg-white/15 active:scale-95 transition cursor-pointer"
              aria-label="الشخصية السابقة"
            >
              <ChevronRight size={22} />
            </button>

            <div className="text-center group relative">
              <div className="relative mx-auto h-36 w-32 sm:h-40 sm:w-36 rounded-2xl overflow-hidden border-2 border-amber-300/60 bg-neutral-900 shadow-2xl">
                <img
                  src={characterPortrait(characterId)}
                  alt={character.name}
                  className="h-full w-full object-cover"
                />
              </div>
              <h3 className="mt-2 text-base font-black text-amber-100">
                {character.name}
                <span className="text-xs font-normal text-amber-300/80 mr-1.5">
                  ({character.title})
                </span>
              </h3>
              <p className="text-[11px] text-amber-200/70 italic mt-0.5 max-w-[260px] mx-auto">
                "{character.welcomeQuote}"
              </p>
            </div>

            <button
              type="button"
              onClick={() => move(1)}
              className="rounded-full border border-white/15 bg-white/5 p-2.5 text-amber-100 hover:bg-white/15 active:scale-95 transition cursor-pointer"
              aria-label="الشخصية التالية"
            >
              <ChevronLeft size={22} />
            </button>
          </div>

          {/* Voice Preview Button */}
          <button
            type="button"
            onClick={togglePreviewAudio}
            className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 px-4 text-xs font-bold transition-all cursor-pointer shadow-md ${
              isPlayingAudio
                ? "bg-amber-500 text-neutral-950 border-amber-400 animate-pulse font-black"
                : "bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border-amber-400/40"
            }`}
          >
            {isPlayingAudio ? (
              <>
                <Square size={14} className="fill-current" />
                <span>إيقاف المعاينة الصوتية ({character.name})</span>
              </>
            ) : (
              <>
                <Volume2 size={16} className="text-amber-300" />
                <span>استماع للترحيب الصوتي الأصلي ({character.name})</span>
              </>
            )}
          </button>
        </div>

        {/* Gallery Grid */}
        <div className="mb-4">
          <div className="text-[11px] font-bold text-amber-200/70 mb-1.5">معرض الـ 35 شخصية:</div>
          <div className="grid grid-cols-5 sm:grid-cols-7 gap-2 max-h-48 overflow-y-auto p-1 bg-black/20 rounded-2xl border border-white/10 scrollbar-thin">
            {filteredIds.map((id) => {
              const item = getCharacterData(id);
              const isSelected = id === characterId;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleSelectCharacter(id)}
                  className={`group relative aspect-square overflow-hidden rounded-xl border-2 transition-all cursor-pointer flex flex-col items-center justify-end ${
                    isSelected
                      ? "border-amber-400 ring-2 ring-amber-400/40 scale-95 shadow-md"
                      : "border-white/10 opacity-70 hover:opacity-100 hover:border-amber-300/40"
                  }`}
                  aria-label={`اختيار ${item.name}`}
                  title={`${item.name} (${item.title})`}
                >
                  <img
                    src={characterPortrait(id)}
                    alt={item.name}
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                  />
                  <div className="relative z-10 w-full bg-gradient-to-t from-black/90 to-transparent pt-3 pb-0.5 text-center">
                    <span className="block text-[9px] font-bold text-amber-100 truncate px-0.5">
                      {item.name}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Save Button */}
        <button
          type="button"
          onClick={() => {
            stopAudio();
            playTapSound();
            onSave({
              nickname: nickname.trim() || "لاعب",
              characterId,
            });
          }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-amber-400 via-amber-300 to-yellow-500 py-3.5 font-black text-neutral-950 shadow-xl shadow-amber-900/40 hover:brightness-105 active:scale-98 transition-all cursor-pointer border-2 border-amber-200 text-sm sm:text-base"
        >
          <Check size={20} className="stroke-[3]" />
          حفظ وتأكيد الملف الشخصي
        </button>
      </section>
    </div>
  );
}
