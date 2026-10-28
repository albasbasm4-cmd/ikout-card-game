/** @license SPDX-License-Identifier: Apache-2.0 */
import { playCharacterClip } from '../utils/characterAudio';
import { chatClips187, clip187, voiceFileFromMessage187, type Situation187 } from './messages';

/** Speaks a filtered character clip for a 187 situation. Returns false when nothing safe exists. */
export function speak187(seat: number, characterId: string | undefined, situation: Situation187): boolean {
  const clip = clip187(characterId, situation);
  if (!characterId || !clip) return false;
  playCharacterClip(characterId, clip, seat);
  return true;
}

/** Plays the sender's chat clip for a voice line received or sent in the 187 room. */
export function playChatVoice187(characterId: string | undefined, message: string, seat: number): void {
  const file = voiceFileFromMessage187(message);
  if (!characterId || file === null) return;
  const clip = chatClips187(characterId).find(item => item.file === file);
  if (clip) playCharacterClip(characterId, clip, seat);
}
