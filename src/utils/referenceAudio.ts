import pass from '../assets/gameplay/pass-two.mp3.asset.json';
import card from '../assets/gameplay/card.mp3.asset.json';
import trump from '../assets/gameplay/trump.mp3.asset.json';
import { loadSettings } from '../store/useSettings';
import { stopCharacterVoice } from './characterAudio';

let voice: HTMLAudioElement | null = null;
const effects = new Set<HTMLAudioElement>();
export function stopReferenceAudio() {
  stopCharacterVoice();
  voice?.pause();
  voice = null;
  effects.forEach(audio => audio.pause());
  effects.clear();
}
export function playReferenceAudio(kind: 'pass' | 'card' | 'trump') {
  if (typeof window === 'undefined' || !loadSettings().soundEnabled) return;
  const src = kind === 'pass' ? pass.url : kind === 'trump' ? trump.url : card.url;
  const audio = new Audio(src);
  audio.volume = kind === 'pass' ? 0.8 : kind === 'trump' ? 0.9 : 0.55;
  if (kind === 'pass' || kind === 'trump') { voice?.pause(); voice = audio; }
  else effects.add(audio);
  audio.onended = () => effects.delete(audio);
  audio.play().catch(() => { effects.delete(audio); });
}
