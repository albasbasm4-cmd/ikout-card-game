import { playSfx } from "./gameAudioBindings";
import { stopAllAudio } from "./gameAudio";
import { stopCharacterVoice } from "./characterAudio";

export function stopReferenceAudio() {
  stopCharacterVoice();
  stopAllAudio();
}

export function playReferenceAudio(kind: "pass" | "card" | "trump") {
  if (kind === "pass") playSfx("pass", 0.8);
  else if (kind === "trump") playSfx("trump", 0.9);
  else playSfx("card", 0.55, 40);
}
