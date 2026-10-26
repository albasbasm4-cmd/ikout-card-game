import React, { useState } from "react";
import {
  Users,
  Trophy,
  Play,
  Volume2,
  VolumeX,
  Shield,
  BookOpen,
  RotateCcw,
} from "lucide-react";
import { playTapSound } from "../utils/audio";
import { useSettings } from "../store/useSettings";
import { RulesModal } from "./RulesModal";
import { Difficulty } from "../types/kout";
import { PlayerProfile } from "../types/character";
import { ProfileSetup } from "./ProfileSetup";
import { hasPlayerProfile, loadPlayerProfile, savePlayerProfile, characterName, characterPortrait } from "../utils/playerProfile";

export interface GameLaunchConfig {
  variant: "BO6" | "BO4";
  targetScore: number;
  difficulty: Difficulty;
}

export interface StartScreenProps {
  onStartGame: (config: GameLaunchConfig) => void;
  onResumeGame?: () => void;
  hasSavedGame?: boolean;
  onOpenLobby?: () => void;
}

export const StartScreen: React.FC<StartScreenProps> = ({
  onStartGame,
  onResumeGame,
  hasSavedGame = false,
  onOpenLobby,
}) => {
  const [variant, setVariant] = useState<"BO6" | "BO4">("BO6");
  const [targetScore, setTargetScore] = useState<number>(51);
  const [difficulty, setDifficulty] = useState<Difficulty>("MEDIUM");
  const [showRules, setShowRules] = useState<boolean>(false);
  const [showProfileSetup, setShowProfileSetup] = useState(() => !hasPlayerProfile());
  const [profile, setProfile] = useState<PlayerProfile>(() => loadPlayerProfile());

  const { settings, toggleSound } = useSettings();

  const handleLaunch = () => {
    playTapSound();
    if (!hasPlayerProfile()) {
      setShowProfileSetup(true);
      return;
    }
    savePlayerProfile(profile);
    onStartGame({
      variant,
      targetScore,
      difficulty,
    });
  };

  const handleResume = () => {
    playTapSound();
    if (onResumeGame) {
      onResumeGame();
    }
  };

  return (
    <div
      dir="rtl"
      className="relative w-full h-[100dvh] flex flex-col items-center justify-between overflow-y-auto overscroll-contain p-3 sm:p-6 bg-gradient-to-b from-[#091b12] via-[#07150e] to-[#040c08] text-amber-50 select-none overflow-x-hidden"
    >
      {/* Background Ambience */}
      <div className="absolute inset-0 opacity-20 pointer-events-none bg-[radial-gradient(#d4af37_1px,transparent_1px)] [background-size:24px_24px]" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] sm:w-[500px] h-[340px] sm:h-[500px] bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header Bar */}
      <header className="relative z-10 w-full max-w-lg flex shrink-0 items-center justify-between pt-1 sm:pt-2 gap-2">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-2xl bg-amber-500/20 border border-amber-400/40 text-amber-400 flex items-center justify-center shadow-lg backdrop-blur-sm">
            <Trophy className="w-5 h-5 text-amber-300" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-100 drop-shadow">
              آي كوت الكويتية
            </h1>
            <span className="text-[10px] sm:text-[11px] font-semibold text-amber-300/80">جلسة ديوانية أصيلة</span>
          </div>
          <div className="flex items-center gap-1.5 mr-1 sm:mr-2">
            <button
              type="button"
              onClick={() => {
                playTapSound();
                toggleSound();
              }}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/10 hover:bg-white/20 border border-amber-400/30 text-amber-200 flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-md"
              title={settings.soundEnabled ? "كتم الصوت" : "تشغيل الصوت"}
              aria-label="تبديل الصوت"
            >
              {settings.soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-red-400" />}
            </button>
            <button
              type="button"
              onClick={() => {
                playTapSound();
                setShowRules(true);
              }}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/10 hover:bg-white/20 border border-amber-400/30 text-amber-200 flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-md"
              title="قوانين اللعبة"
              aria-label="قوانين اللعبة"
            >
              <BookOpen className="w-4 h-4" />
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            playTapSound();
            setShowProfileSetup(true);
          }}
          className="absolute left-0 top-1 flex items-center gap-1.5 rounded-2xl border border-amber-400/40 bg-neutral-900/90 px-2 py-1.5 shadow-lg backdrop-blur hover:bg-neutral-800 transition-all cursor-pointer active:scale-95 group max-w-[132px]"
          aria-label="معلومات الحساب"
          title="معلومات الحساب والملف الشخصي"
        >
          <img
            src={characterPortrait(profile.characterId)}
            alt={profile.nickname}
            className="w-7 h-7 rounded-xl border border-amber-300/60 object-cover bg-neutral-800 shrink-0"
          />
          <div className="text-right leading-tight min-w-0">
            <span className="block truncate text-[11px] font-black text-amber-100 group-hover:text-amber-300 transition-colors">
              {profile.nickname}
            </span>
            <span className="block text-[9px] font-medium text-amber-300/70 truncate">
              {characterName(profile.characterId)}
            </span>
          </div>
        </button>
      </header>

      {/* Main Center Area */}
      <main className="relative z-10 w-full max-w-lg my-auto shrink-0 py-3 space-y-3.5">
        {/* Main Action Buttons in the Center */}
        <section className="w-full space-y-2.5">
          {hasSavedGame && onResumeGame ? (
            <div className="space-y-2.5 p-3 rounded-3xl bg-neutral-900/60 border border-amber-400/30 backdrop-blur-md shadow-2xl">
              {/* Top Button: Resume Game */}
              <button
                type="button"
                onClick={handleResume}
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-neutral-950 font-black text-lg sm:text-xl shadow-[0_6px_25px_rgba(245,158,11,0.4)] active:scale-98 transition-all flex items-center justify-center gap-2.5 cursor-pointer border-2 border-amber-200"
              >
                <RotateCcw className="w-6 h-6 stroke-[2.5]" />
                <div className="text-center leading-tight">
                  <div>استئناف اللعبة</div>
                  <div className="text-[11px] font-semibold text-neutral-900/80">متابعة من حيث توقفت</div>
                </div>
              </button>

              {/* Bottom Button: Start New Game */}
              <button
                type="button"
                onClick={handleLaunch}
                className="w-full py-3.5 px-6 rounded-2xl bg-neutral-800/90 hover:bg-neutral-700/90 border-2 border-amber-400/50 text-amber-100 font-black text-base sm:text-lg shadow-lg active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-5 h-5 fill-amber-300 text-amber-300" />
                <div className="text-center leading-tight">
                  <div>البدء من جديد</div>
                  <div className="text-[11px] font-normal text-amber-300/70">بدء لعبة جديدة باختياراتك أدناه</div>
                </div>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleLaunch}
              className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-neutral-950 font-black text-lg sm:text-xl shadow-[0_6px_25px_rgba(245,158,11,0.4)] active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer border-2 border-amber-200"
            >
              <Play className="w-6 h-6 fill-neutral-950" />
              البدء من جديد
            </button>
          )}
        </section>

        {/* 1. Number of Players (BO6 vs BO4) */}
        <section className="bg-neutral-900/80 border border-amber-400/25 rounded-3xl p-3.5 sm:p-4 shadow-xl backdrop-blur-md">
          <label className="text-xs font-extrabold text-amber-300 flex items-center gap-1.5 mb-2 sm:mb-2.5">
            <Users className="w-4 h-4 text-amber-400" />
            اختر نظام اللعب
          </label>
          <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
            <button
              type="button"
              onClick={() => {
                playTapSound();
                setVariant("BO6");
              }}
              className={`p-3 sm:p-3.5 rounded-2xl border-2 transition-all text-center cursor-pointer flex flex-col items-center gap-1 ${
                variant === "BO6"
                  ? "bg-amber-500/25 border-amber-400 text-white shadow-lg ring-2 ring-amber-400/30 scale-[1.02]"
                  : "bg-neutral-800/60 border-white/10 text-neutral-300 hover:bg-neutral-800 hover:border-amber-400/30"
              }`}
            >
              <span className="text-sm sm:text-base font-black">كوت بو 6</span>
              <span className="text-[10px] sm:text-[11px] text-amber-300/80 font-medium">
                6 لاعبين • مع الجياكر
              </span>
              <span className="text-[9px] sm:text-[10px] text-neutral-400">9 ورقات لكل لاعب</span>
            </button>

            <button
              type="button"
              onClick={() => {
                playTapSound();
                setVariant("BO4");
              }}
              className={`p-3 sm:p-3.5 rounded-2xl border-2 transition-all text-center cursor-pointer flex flex-col items-center gap-1 ${
                variant === "BO4"
                  ? "bg-amber-500/25 border-amber-400 text-white shadow-lg ring-2 ring-amber-400/30 scale-[1.02]"
                  : "bg-neutral-800/60 border-white/10 text-neutral-300 hover:bg-neutral-800 hover:border-amber-400/30"
              }`}
            >
              <span className="text-sm sm:text-base font-black">كوت بو 4</span>
              <span className="text-[10px] sm:text-[11px] text-amber-300/80 font-medium">4 لاعبين • رتم سريع</span>
              <span className="text-[9px] sm:text-[10px] text-neutral-400">من الـ 7 إلى الأكة</span>
            </button>
          </div>
        </section>

        {/* 2. Target Score */}
        <section className="bg-neutral-900/80 border border-amber-400/25 rounded-3xl p-3.5 sm:p-4 shadow-xl backdrop-blur-md">
          <label className="text-xs font-extrabold text-amber-300 flex items-center gap-1.5 mb-2 sm:mb-2.5">
            <Trophy className="w-4 h-4 text-amber-400" />
            نقاط الفوز في اللعبة
          </label>
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            {[
              { score: 26, label: "26 نقطة", desc: "لعب سريع" },
              { score: 51, label: "51 نقطة", desc: "كلاسيكي" },
              { score: 101, label: "101 نقطة", desc: "شوط طويل" },
            ].map((item) => (
              <button
                key={item.score}
                type="button"
                onClick={() => {
                  playTapSound();
                  setTargetScore(item.score);
                }}
                className={`p-2 sm:p-2.5 rounded-2xl border-2 transition-all text-center cursor-pointer flex flex-col items-center gap-0.5 ${
                  targetScore === item.score
                    ? "bg-amber-500/25 border-amber-400 text-white shadow-lg ring-2 ring-amber-400/30 scale-[1.02]"
                    : "bg-neutral-800/60 border-white/10 text-neutral-300 hover:bg-neutral-800 hover:border-amber-400/30"
                }`}
              >
                <span className="text-xs sm:text-sm font-black">{item.label}</span>
                <span className="text-[9px] sm:text-[10px] text-amber-300/80">{item.desc}</span>
              </button>
            ))}
          </div>
        </section>

        {/* 3. Difficulty */}
        <section className="bg-neutral-900/80 border border-amber-400/25 rounded-3xl p-3.5 sm:p-4 shadow-xl backdrop-blur-md">
          <label className="text-xs font-extrabold text-amber-300 flex items-center gap-1.5 mb-2 sm:mb-2.5">
            <Shield className="w-4 h-4 text-amber-400" />
            مستوى ذكاء البوتات
          </label>
          <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
            {[
              { id: "MEDIUM", label: "عادي (ديوانية)", desc: "لعب واقعي ومتوازن" },
              { id: "EXPERT", label: "محترف (تحدي قوي)", desc: "ذكاء تكتيكي وحساب دقيق" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  playTapSound();
                  setDifficulty(item.id as Difficulty);
                }}
                className={`p-2 sm:p-2.5 rounded-2xl border-2 transition-all text-center cursor-pointer flex flex-col items-center gap-0.5 ${
                  difficulty === item.id
                    ? "bg-amber-500/25 border-amber-400 text-white shadow-lg ring-2 ring-amber-400/30 scale-[1.02]"
                    : "bg-neutral-800/60 border-white/10 text-neutral-300 hover:bg-neutral-800 hover:border-amber-400/30"
                }`}
              >
                <span className="text-xs font-black">{item.label}</span>
                <span className="text-[9px] sm:text-[10px] text-amber-300/80">{item.desc}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Lobby Option if provided */}
        {onOpenLobby && (
          <button
            type="button"
            onClick={() => {
              playTapSound();
              onOpenLobby();
            }}
            className="w-full py-2.5 px-4 rounded-xl bg-neutral-800/80 hover:bg-neutral-700/80 border border-amber-400/30 text-amber-200 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Users className="w-4 h-4" />
            اللعب الجماعي عبر الشبكة (Lobby)
          </button>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-lg shrink-0 text-center pt-2 pb-1 border-t border-white/10 text-[10px] sm:text-[11px] text-amber-200/50">
        تنسيق متوافق مع كافة الهواتف والشاشات 100% • أصوات ديوانية أصيلة
      </footer>

      <ProfileSetup
        open={showProfileSetup}
        profile={profile}
        onSave={(next) => {
          savePlayerProfile(next);
          setProfile(next);
          setShowProfileSetup(false);
        }}
        onClose={() => setShowProfileSetup(false)}
      />

      {/* Rules Modal */}
      <RulesModal isOpen={showRules} onClose={() => setShowRules(false)} />
    </div>
  );
};
export default StartScreen;
