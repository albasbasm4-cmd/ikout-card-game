export type CharacterCategory = "classic" | "gulf" | "comedy" | "cartoon" | "modern";

export interface CharacterPhrase {
  id: string;
  text: string;
  audioKey: string;
}

export interface CharacterPersona {
  id: string; // e.g. "a1", "a2", ... "a35"
  name: string;
  title: string;
  category: CharacterCategory;
  voicePack: string; // e.g. "Old Man", "HajiyaAR", "AzizOthman"
  welcomeQuote: string;
  welcomeAudioKey: string;
  faceAsset: string;
  restAsset?: string;
  largeAsset?: string;
  phrases: CharacterPhrase[];
}

export interface PlayerProfile {
  nickname: string;
  characterId: string;
}
