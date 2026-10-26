import React, { StrictMode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useGame } from './useGame';
vi.mock('../ai/AIClient', () => ({ getBotDecision: vi.fn(async () => ({ type: 'BID', bid: 0, bestSuit: 'S' })) }));
vi.mock('../utils/audio', () => ({ playCardSound: vi.fn(), playTrickWinSound: vi.fn(), playTrumpSound: vi.fn(), playWinSound: vi.fn(), playLoseSound: vi.fn() }));
describe('Game startup', () => {
 it('advances bot bidding to the human turn under StrictMode', async () => {
  const { result, unmount } = renderHook(() => useGame({ variant: 'BO4', autoStart: true }), { wrapper: ({ children }) => <StrictMode>{children}</StrictMode> });
  await waitFor(() => expect(result.current.state.currentSeat).toBe(0));
  expect(result.current.state.bids).toHaveLength(3);
  expect(result.current.state.phase).toBe('BID');
  unmount();
 });
});
