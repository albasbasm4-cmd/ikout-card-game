import {
  installAudioUnlock,
  preloadBuffers,
  playBuffer,
  playTone,
  type SfxName,
} from "./gameAudio";
import cardUrl from "../assets/gameplay/card.mp3.asset.json";
import trumpUrl from "../assets/gameplay/trump.mp3.asset.json";
import passUrl from "../assets/gameplay/pass-two.mp3.asset.json";

const SFX_URLS: Record<SfxName, string> = {
  card: cardUrl.url,
  trump: trumpUrl.url,
  pass: passUrl.url,
};

let installed = false;
export function gameAudioPreloaded() {
  if (installed) return;
  installed = true;
  installAudioUnlock();
  preloadBuffers(Object.values(SFX_URLS));
}

export function playSfx(name: SfxName, volume = 0.9, throttleMs = 0) {
  gameAudioPreloaded();
  playBuffer(SFX_URLS[name], { channel: "sfx", volume, throttleMs });
}

export { playBuffer, playTone, installAudioUnlock } from "./gameAudio";
