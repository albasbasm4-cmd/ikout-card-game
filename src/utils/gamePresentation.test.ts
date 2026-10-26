import { describe, expect, it } from 'vitest';
import { commitsCardDrag, specialPlay } from './gamePresentation';

describe('reversible card dragging', () => {
  it('returns a card dragged short of the play boundary', () => {
    expect(commitsCardDrag(-89, true, true)).toBe(false);
  });
  it('commits a legal upward drag at the boundary', () => {
    expect(commitsCardDrag(-90, true, true)).toBe(true);
  });
  it('never commits an illegal card', () => {
    expect(commitsCardDrag(-150, false, true)).toBe(false);
  });
  it('never commits outside the player turn', () => {
    expect(commitsCardDrag(-150, true, false)).toBe(false);
  });
});
describe('special-card presentation', () => {
  it('gives the red joker its own effect', () => {
    expect(specialPlay({ id: 'JOKER-RED', joker: 'RED' }, 'H')).toBe('joker');
  });
  it('gives the black maker its own effect', () => {
    expect(specialPlay({ id: 'JOKER-BLACK', joker: 'BLACK' }, 'H')).toBe('maker');
  });
  it('shows the trump effect only for the trump ace', () => {
    expect(specialPlay({ id: 'H-14', suit: 'H', rank: 14 }, 'H')).toBe('trump-ace');
    expect(specialPlay({ id: 'S-14', suit: 'S', rank: 14 }, 'H')).toBeNull();
    expect(specialPlay({ id: 'H-13', suit: 'H', rank: 13 }, 'H')).toBeNull();
  });
});