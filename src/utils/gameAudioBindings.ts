import {
  installAudioUnlock,
  preloadBuffers,
  playBuffer,
  playTone,
  type SfxName,
} from "./gameAudio";

// Official extracted SFX assets from iKout
const SFX_URLS: Record<SfxName, string[]> = {
  card: [
    "/assets/ikout/audio/card_play.mp3",
    "/assets/ikout/audio/card_play2.mp3",
    "/assets/ikout/audio/card_play3.mp3",
    "/assets/ikout/audio/card_play4.mp3",
    "/assets/ikout/audio/card_play5.mp3",
    "/assets/ikout/audio/card_play6.mp3",
  ],
  trump: ["/assets/ikout/audio/hokum_ace.mp3"],
  pass: ["/assets/ikout/audio/pass.mp3"],
};

export const EXTRA_SFX = {
  deal: "/assets/ikout/audio/card_deal.mp3",
  win: "/assets/ikout/audio/win.mp3",
  loss: "/assets/ikout/audio/loss.mp3",
  victory_trumpet: "/assets/ikout/audio/victory_trumpet.mp3",
  losing_brass: "/assets/ikout/audio/losing_brass.mp3",
  click: "/assets/ikout/audio/click.mp3",
  bubble: "/assets/ikout/audio/bubble.mp3",
  score: "/assets/ikout/audio/score.mp3",
  malzoom: "/assets/ikout/audio/malzoom.mp3",
  challenge: "/assets/ikout/audio/challenge.mp3",
};

let installed = false;
export function gameAudioPreloaded() {
  if (installed) return;
  installed = true;
  installAudioUnlock();
  const allUrls = [
    ...SFX_URLS.card,
    ...SFX_URLS.trump,
    ...SFX_URLS.pass,
    ...Object.values(EXTRA_SFX),
  ];
  preloadBuffers(allUrls);
}

export function playSfx(name: SfxName, volume = 0.9, throttleMs = 0) {
  gameAudioPreloaded();
  const urls = SFX_URLS[name];
  if (!urls || urls.length === 0) return;
  const pickedUrl = urls[Math.floor(Math.random() * urls.length)];
  playBuffer(pickedUrl, { channel: "sfx", volume, throttleMs });
}

export function playExtraSfx(name: keyof typeof EXTRA_SFX, volume = 0.9) {
  gameAudioPreloaded();
  const url = EXTRA_SFX[name];
  if (url) playBuffer(url, { channel: "sfx", volume });
}

export { playBuffer, playTone, installAudioUnlock } from "./gameAudio";
