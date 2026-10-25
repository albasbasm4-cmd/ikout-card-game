import React from "react";
import { X, Volume2, Sparkles, MessageSquare } from "lucide-react";
import { playBubbleSound, playTapSound } from "../utils/audio";

export interface SoundboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPhrase: (phrase: string) => void;
}

interface PhraseCategory {
  title: string;
  items: { text: string; label: string; icon?: string }[];
}

const PHRASE_CATEGORIES: PhraseCategory[] = [
  {
    title: "حماس وديوانية (عبارات الفيديو)",
    items: [
      { text: "كفو عليك يا شريكي!", label: "كفو يا شريكي" },
      { text: "العب يا معوّد!", label: "العب يا معوّد!" },
      { text: "وين الأكة؟!", label: "وين الأكة؟!" },
      { text: "الشايب نزل!", label: "الشايب نزل!" },
      { text: "يا ساتر!", label: "يا ساتر!" },
      { text: "استكانة شاي", label: "استكانة شاي" },
      { text: "طاف يا رجال", label: "طاف يا رجال" },
      { text: "كوت بوستة!", label: "كوت بوستة!" },
    ],
  },
  {
    title: "الفوز والتحدي",
    items: [
      { text: "كفو يا ذيب! مبروك الفوز!", label: "كفو يا ذيب!" },
      { text: "مو مشكلة يا شريكي، نعوضها بالجولة الجاية!", label: "نعوضها بالجولة" },
      { text: "ها يا معوّد، خلّك من الورق واشرب شاي!", label: "خلّك من الورق!" },
    ],
  },
];

export const SoundboardModal: React.FC<SoundboardModalProps> = ({
  isOpen,
  onClose,
  onSelectPhrase,
}) => {
  if (!isOpen) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-neutral-900 border-2 border-amber-500/50 rounded-3xl p-4 sm:p-6 shadow-2xl text-amber-50 max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Volume2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-amber-400 flex items-center gap-1.5">
                أصوات وعبارات الديوانية
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              </h3>
              <p className="text-[11px] text-amber-200/70">
                اضغط لتشغيل الصوت وعرض الرسالة للجميع على الطاولة
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

        {/* Categories and Audio Buttons */}
        <div className="overflow-y-auto py-3 space-y-4 pr-1 scrollbar-thin">
          {PHRASE_CATEGORIES.map((category) => (
            <div key={category.title}>
              <h4 className="text-[12px] font-bold text-amber-300/90 mb-2 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                {category.title}
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {category.items.map((item) => (
                  <button
                    key={item.text}
                    type="button"
                    onClick={() => {
                      playBubbleSound();
                      onSelectPhrase(item.text);
                      onClose();
                    }}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-800/80 hover:bg-amber-600/30 border border-amber-500/20 hover:border-amber-400/60 transition-all text-right group cursor-pointer active:scale-95 shadow-sm"
                  >
                    <span className="text-xs font-semibold text-neutral-100 group-hover:text-amber-300 transition-colors">
                      {item.label}
                    </span>
                    <Volume2 className="w-3.5 h-3.5 text-amber-400/60 group-hover:text-amber-300 shrink-0 mr-1 transition-transform group-hover:scale-110" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer info */}
        <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-amber-200/60 shrink-0">
          <span>أصوات كويتية حقيقية 100% مسجلة للديوانية</span>
          <button
            type="button"
            onClick={onClose}
            className="text-amber-400 hover:underline font-bold text-xs"
          >
            تم
          </button>
        </div>
      </div>
    </div>
  );
};
