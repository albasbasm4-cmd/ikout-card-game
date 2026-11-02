/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CustomVoiceClip {
  id: string;
  /** Written meaning shown in the in-game chat bubble when this clip plays. */
  name: string;
  dataUrl: string;
  durationSeconds: number;
}

export interface CustomAvatarData {
  id: string;
  enabled: boolean;
  name: string;
  avatarImage: string;
  clips: CustomVoiceClip[];
  /** 5 by default; 10 after the voice upgrade (5 more rewarded ads). */
  maxClips: number;
  voiceAdsWatched: number;
  updatedAt: number;
}

export const BASE_CLIP_SLOTS = 5;
export const UPGRADED_CLIP_SLOTS = 10;
export const ADS_PER_UNLOCK = 5;

const LEGACY_KEY = "ikout_custom_avatar_data_v1";
const STORAGE_KEY = "ikout_custom_avatars_v2";

interface Store {
  avatars: CustomAvatarData[];
  activeId: string | null;
}

export function newCustomAvatar(): CustomAvatarData {
  return {
    id: `cust_${Date.now().toString(36)}`,
    enabled: false,
    name: "شخصيتي المخصصة",
    avatarImage: "",
    clips: [],
    maxClips: BASE_CLIP_SLOTS,
    voiceAdsWatched: 0,
    updatedAt: 0,
  };
}

export const DEFAULT_CUSTOM_AVATAR: CustomAvatarData = { ...newCustomAvatar(), id: "cust_default" };

function sanitize(raw: any): CustomAvatarData {
  const maxClips = raw?.maxClips === UPGRADED_CLIP_SLOTS ? UPGRADED_CLIP_SLOTS : BASE_CLIP_SLOTS;
  return {
    id: typeof raw?.id === "string" ? raw.id : "cust_default",
    enabled: Boolean(raw?.enabled),
    name: typeof raw?.name === "string" ? raw.name : DEFAULT_CUSTOM_AVATAR.name,
    avatarImage: typeof raw?.avatarImage === "string" ? raw.avatarImage : "",
    clips: Array.isArray(raw?.clips) ? raw.clips.slice(0, maxClips) : [],
    maxClips,
    voiceAdsWatched: Number(raw?.voiceAdsWatched) || 0,
    updatedAt: Number(raw?.updatedAt) || 0,
  };
}

function readStore(): Store {
  if (typeof window === "undefined") return { avatars: [], activeId: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      const avatars = Array.isArray(p.avatars) ? p.avatars.map(sanitize) : [];
      return { avatars, activeId: typeof p.activeId === "string" ? p.activeId : avatars[0]?.id ?? null };
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const a = sanitize({ ...JSON.parse(legacy), id: "cust_default" });
      return { avatars: a.avatarImage ? [a] : [], activeId: a.avatarImage ? a.id : null };
    }
  } catch (e) {
    console.warn("Failed to load custom avatars:", e);
  }
  return { avatars: [], activeId: null };
}

function writeStore(s: Store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch (e) {
    console.warn("Failed to save custom avatars:", e);
  }
}

export function listCustomAvatars(): CustomAvatarData[] {
  return readStore().avatars;
}

/** Active custom character (or a fresh draft when none exists). */
export function loadCustomAvatar(): CustomAvatarData {
  const s = readStore();
  return s.avatars.find((a) => a.id === s.activeId) ?? s.avatars[0] ?? DEFAULT_CUSTOM_AVATAR;
}

export function setActiveCustomAvatar(id: string) {
  const s = readStore();
  if (s.avatars.some((a) => a.id === id)) writeStore({ ...s, activeId: id });
}

/** Insert or update a custom character by id and make it active. */
export function saveCustomAvatar(data: CustomAvatarData): CustomAvatarData {
  if (typeof window === "undefined") return data;
  const s = readStore();
  const next = sanitize({ ...data, updatedAt: Date.now() });
  const i = s.avatars.findIndex((a) => a.id === next.id);
  const avatars = i >= 0 ? s.avatars.map((a, j) => (j === i ? next : a)) : [...s.avatars, next];
  writeStore({ avatars, activeId: next.id });
  return next;
}

export function hasCustomAvatar(): boolean {
  return Boolean(loadCustomAvatar().avatarImage);
}

/** Random recorded clip of the active custom character, with its paired text. */
export function randomCustomClip(): CustomVoiceClip | null {
  const clips = loadCustomAvatar().clips.filter((c) => c.dataUrl && c.name);
  return clips.length ? clips[Math.floor(Math.random() * clips.length)] : null;
}

let customAudio: HTMLAudioElement | null = null;
export function playCustomClip(clip: CustomVoiceClip) {
  try {
    customAudio?.pause();
    customAudio = new Audio(clip.dataUrl);
    void customAudio.play().catch(() => {});
  } catch {
    /* audio unavailable */
  }
}
