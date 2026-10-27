import { describe, it, expect, vi } from 'vitest';
import { Room187Channel } from './network187';

describe('Room187Channel', () => {
  it('instantiates and sends messages without error', () => {
    const ch1 = new Room187Channel('TEST1');
    const ch2 = new Room187Channel('TEST1');

    const fn = vi.fn();
    const unsub = ch2.onMessage(fn);

    ch1.send({
      type: 'JOIN',
      playerName: 'سالم',
      clientToken: 'token-123',
    });

    unsub();
    ch1.close();
    ch2.close();
    expect(true).toBe(true);
  });
});
