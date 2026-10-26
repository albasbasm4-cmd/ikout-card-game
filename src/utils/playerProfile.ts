import type { PlayerProfile } from "../types/character";
import { getCharacterData } from "../data/charactersData";

export const PLAYER_PROFILE_KEY = "ikout_player_profile_v1";
export const DEFAULT_PLAYER_PROFILE: PlayerProfile = { nickname: "لاعب", characterId: "a1" };

export function loadPlayerProfile(): PlayerProfile {
  if (typeof window === "undefined") return DEFAULT_PLAYER_PROFILE;
  try {
    const value = JSON.parse(localStorage.getItem(PLAYER_PROFILE_KEY) || "null");
    if (
      value &&
      typeof value.nickname === "string" &&
      /^a([1-9]|[12]\d|3[0-6])$/.test(value.characterId)
    ) {
      return { nickname: value.nickname.slice(0, 20), characterId: value.characterId };
    }
  } catch (error) {
    console.warn("Failed to load player profile:", error);
  }
  return DEFAULT_PLAYER_PROFILE;
}

export function hasPlayerProfile(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(PLAYER_PROFILE_KEY) !== null;
}

export function savePlayerProfile(profile: PlayerProfile): void {
  if (typeof window === "undefined") return;
  const clean = {
    nickname: profile.nickname.trim().slice(0, 20) || "لاعب",
    characterId: profile.characterId,
  };
  localStorage.setItem(PLAYER_PROFILE_KEY, JSON.stringify(clean));
}

export const CHARACTER_IDS = Array.from({ length: 36 }, (_, index) => `a${index + 1}`);

export function characterPortrait(characterId: string): string {
  return `/assets/ikout/characters/${characterId}-face.png`;
}

export function characterName(characterId: string): string {
  return getCharacterData(characterId).name;
}

export function assignBotCharacters<
  T extends {
    seatIndex: number;
    kind: string;
    characterId?: string;
    voicePack?: string;
    name?: string;
  },
>(players: T[], humanCharacterId: string): T[] {
  const available = CHARACTER_IDS.filter((id) => id !== humanCharacterId);
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }
  let next = 0;
  return players.map((player) => {
    if (player.kind === "AI_BOT") {
      const assignedId = available[next++ % available.length];
      const charData = getCharacterData(assignedId);
      return {
        ...player,
        characterId: assignedId,
        voicePack: charData.voiceBundle,
        name: player.name?.startsWith("بوت") ? `${charData.name} (بوت)` : player.name,
      };
    }
    return player;
  });
}
