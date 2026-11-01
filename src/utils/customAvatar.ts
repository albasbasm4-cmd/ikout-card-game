/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CustomVoiceClip {
  id: string;
  name: string; // e.g. "كفو يا شريكي"
  dataUrl: string; // base64 data audio
  durationSeconds: number; // max 3.0s
}

export interface CustomAvatarData {
  enabled: boolean;
  name: string;
  avatarImage: string; // base64 or URL
  clips: CustomVoiceClip[];
  updatedAt: number;
}

const STORAGE_KEY_CUSTOM_AVATAR = "ikout_custom_avatar_data_v1";

export const DEFAULT_CUSTOM_AVATAR: CustomAvatarData = {
  enabled: false,
  name: "شخصيتي المخصصة",
  avatarImage: "",
  clips: [],
  updatedAt: 0,
};

export function loadCustomAvatar(): CustomAvatarData {
  if (typeof window === "undefined") return DEFAULT_CUSTOM_AVATAR;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_AVATAR);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabled: Boolean(parsed.enabled),
        name: typeof parsed.name === "string" ? parsed.name : DEFAULT_CUSTOM_AVATAR.name,
        avatarImage: typeof parsed.avatarImage === "string" ? parsed.avatarImage : "",
        clips: Array.isArray(parsed.clips) ? parsed.clips.slice(0, 5) : [],
        updatedAt: Number(parsed.updatedAt) || 0,
      };
    }
  } catch (e) {
    console.warn("Failed to load custom avatar:", e);
  }
  return DEFAULT_CUSTOM_AVATAR;
}

export function saveCustomAvatar(data: Partial<CustomAvatarData>): CustomAvatarData {
  if (typeof window === "undefined") return DEFAULT_CUSTOM_AVATAR;
  const current = loadCustomAvatar();
  const next: CustomAvatarData = {
    ...current,
    ...data,
    updatedAt: Date.now(),
  };
  try {
    localStorage.setItem(STORAGE_KEY_CUSTOM_AVATAR, JSON.stringify(next));
  } catch (e) {
    console.warn("Failed to save custom avatar to localStorage:", e);
  }
  return next;
}

/** Check if player has created a custom avatar with an image */
export function hasCustomAvatar(): boolean {
  const custom = loadCustomAvatar();
  return Boolean(custom.avatarImage && custom.avatarImage.length > 0);
}
