/** @license SPDX-License-Identifier: Apache-2.0 */
import { CHARACTER_VOICES, type VoiceClip } from '../data/characterVoiceManifest';

export const MESSAGES_187 = ['السلام عليكم', 'بالتوفيق', 'لعب جميل', 'ركزوا يا شباب', 'كفو عليكم', 'حظ أوفر', 'خلونا نكمل', 'شكراً'] as const;

/** Chat lines that play a character clip carry only the clip's file name after this prefix. */
export const CHAT_VOICE_PREFIX_187 = 'voice187:';
export type Situation187 = 'welcome' | 'pass' | 'win' | 'lose';

/** Kout-only vocabulary: bid numbers 5-9, pass calls, Joker, Maker and Malzoom, with common spellings. 187 never speaks them. */
const KOUT_TOKENS_187 = new Set([
  'ملزوم', 'ملزم', 'جوكر', 'جيكر', 'جكر', 'جاكر', 'ماكر', 'مكر', 'طاف', 'طافي',
  'خمس', 'خمسة', 'خمسه', 'ستة', 'سته', 'ست', 'سبع', 'سبعة', 'سبعه', 'سبا',
  'ثمان', 'ثمانية', 'ثمانيه', 'تمن', 'تمانية', 'تسع', 'تسعة', 'تسعه',
]);

const stripArticle = (token: string) => token.replace(/^(و|ب|ل|ف|ك)?(ال)?/, '');

/** A clip is usable in 187 when its transcript has no Kout-only word or 5-9 digit. */
export function isSafe187(clip: VoiceClip): boolean {
  if (/[5-9٥-٩]/.test(clip.text)) return false;
  return !clip.text.split(/[\s،,.!?؟:;()"'\-]+/).some(token => KOUT_TOKENS_187.has(stripArticle(token)));
}

/** The character's clip for a 187 situation, or undefined when none is safe to play. */
export function clip187(characterId: string | undefined, situation: Situation187): VoiceClip | undefined {
  const clip = characterId ? CHARACTER_VOICES[characterId]?.[situation] : undefined;
  return clip && isSafe187(clip) ? clip : undefined;
}

/** Safe table-talk clips for a character, shown in the chat panel. */
export function chatClips187(characterId: string | undefined): VoiceClip[] {
  return (characterId ? CHARACTER_VOICES[characterId]?.chat ?? [] : []).filter(isSafe187);
}

export function chatCode187(clip: VoiceClip): string {
  return CHAT_VOICE_PREFIX_187 + clip.file;
}

const SAFE_CHAT_FILES_187 = new Set(
  Object.values(CHARACTER_VOICES).flatMap(voices => voices.chat).filter(isSafe187).map(clip => clip.file),
);

/** File name of a voice chat line, or null for a plain text line. */
export function voiceFileFromMessage187(message: string): string | null {
  return message.startsWith(CHAT_VOICE_PREFIX_187) ? message.slice(CHAT_VOICE_PREFIX_187.length) : null;
}

/** A voice line is valid only for the sender's own character when that character is known. */
export function isMessage187(message: unknown, characterId?: string): message is string {
  if (typeof message !== 'string') return false;
  const file = voiceFileFromMessage187(message);
  if (file !== null) {
    return characterId ? chatClips187(characterId).some(clip => clip.file === file) : SAFE_CHAT_FILES_187.has(file);
  }
  return MESSAGES_187.some(value => value === message);
}

/** Text shown in a speech bubble: the transcript of a voice line, or the plain message. */
export function bubbleText187(message: string, characterId: string | undefined): string {
  const file = voiceFileFromMessage187(message);
  if (file === null) return message;
  return chatClips187(characterId).find(clip => clip.file === file)?.text ?? '…';
}
