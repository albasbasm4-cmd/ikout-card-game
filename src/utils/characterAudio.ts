import pass from '../assets/gameplay/pass-two.mp3.asset.json';
import { loadSettings } from '../store/useSettings';
import { CHARACTER_PHRASES, RESULT_LINES, SPECIAL_LINES } from './gamePresentation';

const assets = import.meta.glob<{ url: string }>('../assets/voices/*.asset.json', { eager: true, import: 'default' });
const phraseKeys = ['partner', 'play', 'ace', 'king', 'surprise', 'kout', 'pass-taunt', 'tea'];
let current: HTMLAudioElement | null = null;
let activeSeat: number | null = null;
const listeners = new Set<(seat: number | null) => void>();
function notify(seat: number | null) { activeSeat = seat; listeners.forEach(listener => listener(seat)); }
export function subscribeCharacterVoice(listener: (seat: number | null) => void) {
  listeners.add(listener);
  listener(activeSeat);
  return () => { listeners.delete(listener); };
}
export function stopCharacterVoice() {
  if (current) { current.onended = null; current.pause(); current = null; }
  notify(null);
}
export function voiceKey(message: string): string | null {
  const index = CHARACTER_PHRASES.indexOf(message);
  if (index >= 0) return phraseKeys[index];
  for (const [key, line] of Object.entries(SPECIAL_LINES)) if (message === line) return key;
  if (message === RESULT_LINES.win) return 'win';
  if (message === RESULT_LINES.lose) return 'lose';
  if (message === RESULT_LINES.opponent) return 'opponent-win';
  const bid = /^طلب ([5-9])$/.exec(message);
  if (bid) return `bid${bid[1]}`;
  if (message.startsWith('الأمر:')) {
    if (message.includes('هاص')) return 'H';
    if (message.includes('سبيت')) return 'S';
    if (message.includes('ديمن')) return 'D';
    if (message.includes('كلفس')) return 'C';
  }
  return null;
}
export function playCharacterVoice(message: string, seat: number) {
  if (typeof window === 'undefined' || !loadSettings().soundEnabled) return;
  const key = voiceKey(message);
  const src = message === 'طاف' ? pass.url : key ? assets[`../assets/voices/${key}.mp3.asset.json`]?.url : undefined;
  if (!src) return;
  stopCharacterVoice();
  const audio = new Audio(src);
  current = audio;
  audio.volume = 0.85;
  const finish = () => { if (current === audio) { current = null; notify(null); } };
  audio.onended = finish;
  audio.onerror = finish;
  audio.play().then(() => { if (current === audio) notify(seat); }).catch(finish);
}