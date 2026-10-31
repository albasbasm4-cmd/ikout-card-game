import { useEffect, useState } from "react";

/** The 36 restored authentic characters (a1..a36). */
export const CHARACTER_IDS = Array.from({ length: 36 }, (_, i) => `a${i + 1}`);

/** Full character head with facial features (eyes, nose, mouth). */
export function characterFace(characterId: string): string {
  return `/assets/ikout/characters/${characterId}-portrait.png`;
}

export type TableTheme = "classic" | "gold" | "wood" | "grass" | "outdoor";
export type CardTheme = "deck" | "authentic" | "gold" | "moon" | "kuwait" | "maze" | "squares";

export const TABLE_THEMES: { id: TableTheme; label: string; image: string }[] = [
  { id: "classic", label: "الطاولة الأصلية", image: "/assets/ikout/tables/classic-table.png" },
  { id: "gold", label: "طاولة ذهبية", image: "/assets/ikout/tables/gold-table.png" },
  { id: "wood", label: "ديوانية خشب", image: "/assets/ikout/tables/wood-table.png" },
  { id: "grass", label: "حوش العشب", image: "/assets/ikout/tables/grass-table.png" },
  { id: "outdoor", label: "في الخارج", image: "/assets/ikout/tables/outdoor-table.png" },
];

const back = (name: string) => `/assets/ikout/cards/${encodeURIComponent(name)}`;
export const CARD_THEMES: { id: CardTheme; label: string; back: string }[] = [
  { id: "deck", label: "الورق الكلاسيكي", back: "/assets/ikout/cards/deck/back.webp" },
  { id: "authentic", label: "أصلي", back: back("authentic-back.png") },
  { id: "gold", label: "ذهبي", back: back("Card Back - New - Squares Gold.png") },
  { id: "moon", label: "قمر ليلي", back: back("Card Back - New - New Moon Blue.png") },
  { id: "kuwait", label: "الكويت", back: back("CardBack-KuwaitFlagPortrait.png") },
  { id: "maze", label: "متاهة زرقاء", back: back("Card Back - New - Blue Maze.png") },
  { id: "squares", label: "مربعات حمراء", back: back("Card Back - New - Squares Red.png") },
];

/** خلفيات سطح اللعب؛ خشب هي الافتراضية دائماً. */
export type BgTheme = "wood" | "grass" | "pattern" | "pattern1" | "spotlight";
export const BG_THEMES: { id: BgTheme; label: string; image: string }[] = [
  { id: "wood", label: "خشب", image: "/assets/ikout/backgrounds/wood-bg.png" },
  { id: "grass", label: "عشب", image: "/assets/ikout/backgrounds/grass-bg.png" },
  { id: "pattern", label: "نقشة", image: "/assets/ikout/backgrounds/pattern-bg.png" },
  { id: "pattern1", label: "نقشة ٢", image: "/assets/ikout/backgrounds/pattern1-bg.png" },
  { id: "spotlight", label: "أضواء", image: "/assets/ikout/backgrounds/spotlight.png" },
];
export function backgroundImage(theme: BgTheme): string {
  return (BG_THEMES.find((b) => b.id === theme) ?? BG_THEMES[0]).image;
}

export function tableImage(theme: TableTheme): string {
  return (TABLE_THEMES.find((t) => t.id === theme) ?? TABLE_THEMES[0]).image;
}
export function cardBack(theme: CardTheme): string {
  return (CARD_THEMES.find((t) => t.id === theme) ?? CARD_THEMES[0]).back;
}

const DECK_DIR = "/assets/ikout/cards/deck";
const DECK_RANK_LABELS: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };

/** وجه البطاقة في نمط الورق الكلاسيكي؛ يُرجع null إن لم تتوفر له صورة. */
export function deckCardFace(card: {
  suit?: unknown;
  rank?: unknown;
  joker?: unknown;
}): string | null {
  if (card.joker === "RED") return `${DECK_DIR}/JR.webp`;
  if (card.joker === "BLACK") return `${DECK_DIR}/JB.webp`;
  if (typeof card.suit !== "string" || typeof card.rank !== "number") return null;
  if (!(["S", "H", "D", "C"] as string[]).includes(card.suit)) return null;
  const rank =
    DECK_RANK_LABELS[card.rank] ?? (card.rank >= 2 && card.rank <= 10 ? String(card.rank) : null);
  if (!rank) return null;
  return `${DECK_DIR}/${card.suit}${rank}.webp`;
}

export interface PlayerProfile {
  name: string;
  characterId: string;
  table: TableTheme;
  cards: CardTheme;
  background: BgTheme;
  country: string | null;
}
export const DEFAULT_PROFILE: PlayerProfile = {
  name: "أنت",
  characterId: "a1",
  table: "wood",
  cards: "deck",
  background: "wood",
  country: "kw",
};
const KEY = "ikout_profile_v2";
const LEGACY_KEY = "ikout_profile_v1";
const listeners = new Set<(p: PlayerProfile) => void>();

const LEGACY_TABLE: Record<string, TableTheme> = {
  stone: "wood",
  wood: "wood",
  night: "gold",
  classic: "classic",
  gold: "gold",
  grass: "grass",
  outdoor: "outdoor",
};
const LEGACY_CARDS: Record<string, CardTheme> = {
  deck: "deck",
  classic: "authentic",
  royal: "gold",
  night: "moon",
  authentic: "authentic",
  gold: "gold",
  moon: "moon",
  kuwait: "kuwait",
  maze: "maze",
  squares: "squares",
};

export function loadProfile(): PlayerProfile {
  if (typeof window === "undefined") return DEFAULT_PROFILE;
  try {
    let raw = JSON.parse(localStorage.getItem(KEY) || "null") as
      (Partial<PlayerProfile> & { portrait?: number }) | null;
    if (!raw || typeof raw !== "object") {
      // ترقية لمرة واحدة من الملف القديم: الافتراضي الأصلي يصبح الورق الكلاسيكي الجديد
      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || "null") as
        (Partial<PlayerProfile> & { portrait?: number }) | null;
      if (legacy && typeof legacy === "object") {
        const migrated = LEGACY_CARDS[legacy.cards ?? ""] ?? DEFAULT_PROFILE.cards;
        raw = { ...legacy, cards: migrated === "authentic" ? "deck" : migrated };
      }
    }
    raw = raw ?? {};
    // Migrate the pre-restoration profile (portrait index + old theme ids).
    const characterId =
      typeof raw.characterId === "string" && CHARACTER_IDS.includes(raw.characterId)
        ? raw.characterId
        : typeof raw.portrait === "number" && raw.portrait >= 0 && raw.portrait <= 3
          ? `a${raw.portrait + 1}`
          : DEFAULT_PROFILE.characterId;
    const p: PlayerProfile = {
      name: typeof raw.name === "string" ? raw.name : DEFAULT_PROFILE.name,
      characterId,
      table: LEGACY_TABLE[raw.table ?? ""] ?? DEFAULT_PROFILE.table,
      cards: LEGACY_CARDS[raw.cards ?? ""] ?? DEFAULT_PROFILE.cards,
      background:
        typeof raw.background === "string" &&
        BG_THEMES.some((b) => b.id === raw.background)
          ? (raw.background as BgTheme)
          : DEFAULT_PROFILE.background,
      country:
        typeof raw.country === "string"
          ? raw.country
          : raw.country === null
            ? null
            : DEFAULT_PROFILE.country,
    };
    return p;
  } catch {
    return DEFAULT_PROFILE;
  }
}
export function saveProfile(partial: Partial<PlayerProfile>): PlayerProfile {
  const next = { ...loadProfile(), ...partial };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l(next));
  return next;
}
export function useProfile(): PlayerProfile {
  const [p, setP] = useState<PlayerProfile>(DEFAULT_PROFILE);
  useEffect(() => {
    setP(loadProfile());
    listeners.add(setP);
    return () => {
      listeners.delete(setP);
    };
  }, []);
  return p;
}
