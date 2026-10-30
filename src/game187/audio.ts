import { loadSettings } from "../store/useSettings";

let context: AudioContext | null = null;
/** Independent, speech-free 187 sounds; no Kout recordings. */
export function play187Sound(event: "card" | "message"): void {
  if (!loadSettings().soundEnabled || typeof AudioContext === "undefined") return;
  if (event === "card" && !loadSettings().cardPlacementSoundEnabled) return;
  try {
    context ??= new AudioContext();
    void context.resume().catch(() => {});
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = event === "card" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(event === "card" ? 240 : 660, now);
    oscillator.frequency.exponentialRampToValueAtTime(event === "card" ? 100 : 880, now + 0.07);
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.11);
  } catch {
    /* Audio may be unavailable. */
  }
}
