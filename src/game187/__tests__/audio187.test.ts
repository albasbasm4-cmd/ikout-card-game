import { it, expect, vi } from 'vitest';
const reference = vi.hoisted(() => vi.fn());
const character = vi.hoisted(() => vi.fn());
vi.mock('../../utils/referenceAudio', () => ({ playReferenceAudio: reference }));
vi.mock('../../utils/characterAudio', () => ({ playCharacterVoice: character }));
import { play187Sound } from '../audio';

it('187 effects never play Kout recordings or character voices', () => {
  const start = vi.fn();
  const parameter = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
  vi.stubGlobal('AudioContext', class {
    currentTime = 0;
    destination = {};
    resume = () => Promise.resolve();
    createOscillator = () => ({ type: '', frequency: parameter, connect: vi.fn(), start, stop: vi.fn() });
    createGain = () => ({ gain: parameter, connect: vi.fn() });
  });
  play187Sound('card');
  play187Sound('message');
  expect(start).toHaveBeenCalledTimes(2);
  expect(reference).not.toHaveBeenCalled();
  expect(character).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});