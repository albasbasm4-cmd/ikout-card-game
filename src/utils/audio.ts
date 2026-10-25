/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { loadSettings } from "../store/useSettings";
import { playSfx, playExtraSfx, playTone } from "./gameAudioBindings";

function isSoundAllowed(override?: boolean): boolean {
  if (override !== undefined) return override;
  return loadSettings().soundEnabled;
}

let lastCardSoundAt = 0;

/**
 * Plays authentic iKout card sliding/snapping sound
 */
export function playCardSound(enabled?: boolean): void {
  if (enabled === false || !isSoundAllowed(enabled)) return;
  const t = Date.now();
  if (t - lastCardSoundAt < 35) return;
  lastCardSoundAt = t;
  playSfx("card", 0.65, 35);
}

/**
 * Plays authentic iKout card dealing sound
 */
export function playDealSound(enabled?: boolean): void {
  if (!isSoundAllowed(enabled)) return;
  playExtraSfx("deal", 0.7);
}

/**
 * Plays epic Match Win celebration sound
 */
export function playWinSound(enabled?: boolean): void {
  if (!isSoundAllowed(enabled)) return;
  playExtraSfx("win", 0.95);
}

/**
 * Plays Match Loss dramatic sound
 */
export function playLoseSound(enabled?: boolean): void {
  if (!isSoundAllowed(enabled)) return;
  playExtraSfx("loss", 0.85);
}

/**
 * Plays authentic button tap / click sound
 */
export function playTapSound(enabled?: boolean): void {
  if (!isSoundAllowed(enabled)) return;
  playExtraSfx("click", 0.5);
}

/**
 * Plays speech bubble pop / reaction chime
 */
export function playBubbleSound(enabled?: boolean): void {
  if (!isSoundAllowed(enabled)) return;
  playExtraSfx("bubble", 0.65);
}

/**
 * Plays trick collection audio chime
 */
export function playTrickWinSound(enabled?: boolean): void {
  if (!isSoundAllowed(enabled)) return;
  playTone([
    { freq: 587.33, at: 0, dur: 0.18, vol: 0.16 },
    { freq: 880, at: 0.08, dur: 0.22, vol: 0.16 },
  ]);
}

/**
 * Plays fanfare chime when Trump (Hokm) is declared
 */
export function playTrumpSound(enabled?: boolean): void {
  if (!isSoundAllowed(enabled)) return;
  playSfx("trump", 0.9);
}

/**
 * Plays Malzoom / Kout announcement sound
 */
export function playMalzoomSound(enabled?: boolean): void {
  if (!isSoundAllowed(enabled)) return;
  playExtraSfx("malzoom", 0.95);
}
