import React, { useState } from "react";
import {
  Users,
  Trophy,
  Play,
  Sparkles,
  Volume2,
  VolumeX,
  Shield,
  BookOpen,
  RotateCcw,
} from "lucide-react";
import { playTapSound, playWinSound } from "../utils/audio";
import { useSettings } from "../store/useSettings";
import { RulesModal } from "./RulesModal";
import { Difficulty } from "../types/kout";

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

  const { settings, toggleSound } = useSettings();

  const handleLaunch = () => {
    playTapSound();
    onStartGame({
      variant,
      targetScore,
      difficulty,
    });
  };

  return (
    <div
      dir="rtl"
      className="relative w-full min-h-screen flex flex-col items-center justify-between p-4 sm:p-6 bg-gradient-to-b from-[#091b12] via-[#07150e] to-[#040c08] text-amber-50 select-none overflow-x-hidden"
    >
      {/* Background Ambience */}
      <div className="absolute inset-0 opacity-20 pointer-events-none bg-[radial-gradient(#d4af37_1px,transparent_1px)] [background-size:24px_24px]" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] sm:w-[500px] h-[340px] sm:h-[500px] bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header Bar */}
      <header className="relative z-10 w-full max-w-lg flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-2xl bg-amber-500/20 border border-amber-400/40 text-amber-400 flex items-center justify-center shadow-lg backdrop-blur-sm">
            <Trophy className="w-5 h-5 text-amber-300" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-100 drop-shadow">
              آي كوت الكويتية
            </h1>
            <span className="text-[11px] font-semibold text-amber-300/80">جلسة ديوانية أصيلة</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              playTapSound();
              toggleSound();
            }}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 border border-amber-400/30 text-amber-200 flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-md"
            title={settings.soundEnabled ? "كتم الصوت" : "تشغيل الصوت"}
            aria-label="تبديل الصوت"
          >
            {settings.soundEnabled ? (
              <Volume2 className="w-4 h-4" />
            ) : (
              <VolumeX className="w-4 h-4 text-red-400" />
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              playTapSound();
              setShowRules(true);
            }}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 border border-amber-400/30 text-amber-200 flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-md"
            title="قوانين اللعبة"
            aria-label="قوانين اللعبة"
          >
            <BookOpen className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Configuration Card */}
      <main className="relative z-10 w-full max-w-lg my-auto py-4 space-y-4">
        {/* Saved Game Banner */}
        {hasSavedGame && onResumeGame && (
          <div className="p-3.5 rounded-2xl bg-amber-500/15 border-2 border-amber-400/60 shadow-xl flex items-center justify-between backdrop-blur-md animate-pulse">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-400 text-neutral-950 flex items-center justify-center font-bold">
                <RotateCcw className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-amber-200">توجد لعبة غير مكتملة</p>
                <p className="text-[11px] text-amber-300/80">يمكنك المتابعة من حيث توقفت</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                playTapSound();
                onResumeGame();
              }}
              className="px-3.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 text-xs font-black transition-all cursor-pointer shadow-md"
            >
              استئناف
            </button>
          </div>
        )}

        {/* 1. Number of Players (BO6 vs BO4) */}
        <section className="bg-neutral-900/80 border border-amber-400/25 rounded-3xl p-4 shadow-xl backdrop-blur-md">
          <label className="text-xs font-extrabold text-amber-300 flex items-center gap-1.5 mb-2.5">
            <Users className="w-4 h-4 text-amber-400" />
            اختر نظام اللعب
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => {
                playTapSound();
                setVariant("BO6");
              }}
              className={`p-3.5 rounded-2xl border-2 transition-all text-center cursor-pointer flex flex-col items-center gap-1 ${
                variant === "BO6"
                  ? "bg-amber-500/25 border-amber-400 text-white shadow-lg ring-2 ring-amber-400/30 scale-[1.02]"
                  : "bg-neutral-800/60 border-white/10 text-neutral-300 hover:bg-neutral-800 hover:border-amber-400/30"
              }`}
            >
              <span className="text-base font-black">كوت بو 6</span>
              <span className="text-[11px] text-amber-300/80 font-medium">
                6 لاعبين • مع الجياكر
              </span>
              <span className="text-[10px] text-neutral-400">9 ورقات لكل لاعب</span>
            </button>

            <button
              type="button"
              onClick={() => {
                playTapSound();
                setVariant("BO4");
              }}
              className={`p-3.5 rounded-2xl border-2 transition-all text-center cursor-pointer flex flex-col items-center gap-1 ${
                variant === "BO4"
                  ? "bg-amber-500/25 border-amber-400 text-white shadow-lg ring-2 ring-amber-400/30 scale-[1.02]"
                  : "bg-neutral-800/60 border-white/10 text-neutral-300 hover:bg-neutral-800 hover:border-amber-400/30"
              }`}
            >
              <span className="text-base font-black">كوت بو 4</span>
              <span className="text-[11px] text-amber-300/80 font-medium">4 لاعبين • رتم سريع</span>
              <span className="text-[10px] text-neutral-400">من الـ 7 إلى الأكة</span>
            </button>
          </div>
        </section>

        {/* 2. Target Score */}
        <section className="bg-neutral-900/80 border border-amber-400/25 rounded-3xl p-4 shadow-xl backdrop-blur-md">
          <label className="text-xs font-extrabold text-amber-300 flex items-center gap-1.5 mb-2.5">
            <Trophy className="w-4 h-4 text-amber-400" />
            نقاط الفوز في اللعبة
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { score: 26, label: "26 نقطة", desc: "لعب سريع" },
              { score: 51, label: "51 نقطة", desc: "كلاسيكي (موصى به)" },
              { score: 101, label: "101 نقطة", desc: "شوط طويل" },
            ].map((item) => (
              <button
                key={item.score}
                type="button"
                onClick={() => {
                  playTapSound();
                  setTargetScore(item.score);
                }}
                className={`p-2.5 rounded-2xl border-2 transition-all text-center cursor-pointer flex flex-col items-center gap-0.5 ${
                  targetScore === item.score
                    ? "bg-amber-500/25 border-amber-400 text-white shadow-lg ring-2 ring-amber-400/30 scale-[1.02]"
                    : "bg-neutral-800/60 border-white/10 text-neutral-300 hover:bg-neutral-800 hover:border-amber-400/30"
                }`}
              >
                <span className="text-sm font-black">{item.label}</span>
                <span className="text-[10px] text-amber-300/80">{item.desc}</span>
              </button>
            ))}
          </div>
        </section>

        {/* 3. Difficulty */}
        <section className="bg-neutral-900/80 border border-amber-400/25 rounded-3xl p-4 shadow-xl backdrop-blur-md">
          <label className="text-xs font-extrabold text-amber-300 flex items-center gap-1.5 mb-2.5">
            <Shield className="w-4 h-4 text-amber-400" />
            مستوى ذكاء البوتات
          </label>
          <div className="grid grid-cols-2 gap-2.5">
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
                className={`p-2.5 rounded-2xl border-2 transition-all text-center cursor-pointer flex flex-col items-center gap-0.5 ${
                  difficulty === item.id
                    ? "bg-amber-500/25 border-amber-400 text-white shadow-lg ring-2 ring-amber-400/30 scale-[1.02]"
                    : "bg-neutral-800/60 border-white/10 text-neutral-300 hover:bg-neutral-800 hover:border-amber-400/30"
                }`}
              >
                <span className="text-xs font-black">{item.label}</span>
                <span className="text-[10px] text-amber-300/80">{item.desc}</span>
              </button>
            ))}
          </div>
        </section>

        {/* 4. Action Buttons */}
        <div className="pt-2 space-y-2.5">
          <button
            type="button"
            onClick={handleLaunch}
            className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-neutral-950 font-black text-lg sm:text-xl shadow-[0_6px_25px_rgba(245,158,11,0.4)] active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer border-2 border-amber-200"
          >
            <Play className="w-6 h-6 fill-neutral-950" />
            ابدأ اللعب الآن
          </button>

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
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-lg text-center pt-3 border-t border-white/10 text-[11px] text-amber-200/50">
        تنسيق متوافق مع كافة الهواتف والشاشات • حرية تامة في رمي الأوراق • أصوات كويتية
      </footer>

      {/* Rules Modal */}
      <RulesModal isOpen={showRules} onClose={() => setShowRules(false)} />
    </div>
  );
};
export default StartScreen;
