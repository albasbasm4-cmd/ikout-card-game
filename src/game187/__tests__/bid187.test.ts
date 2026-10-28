import { describe, it, expect } from 'vitest';
import { minAllowedBid187, snapBid187 } from '../rules';

describe('187 bid line', () => {
  it('starts at 75 when nobody has bid', () => {
    expect(minAllowedBid187(null)).toBe(75);
  });

  it('starts 5 above the current high bid', () => {
    expect(minAllowedBid187(120)).toBe(125);
  });

  it('raises in steps of 5', () => {
    expect(snapBid187(77, 75)).toBe(75);
    expect(snapBid187(78, 75)).toBe(80);
  });

  it('never goes above 185', () => {
    expect(snapBid187(200, 75)).toBe(185);
  });

  it('never goes below the lowest allowed bid', () => {
    expect(snapBid187(60, 100)).toBe(100);
  });
});
