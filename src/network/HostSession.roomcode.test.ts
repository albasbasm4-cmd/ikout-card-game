import { describe, it, expect } from 'vitest';
import { LoopbackHub } from './LoopbackTransport';
import { HostSession } from './HostSession';
import { HostPacket } from './protocol';

function join(roomCode?: string, token = 't1') {
  const hub = new LoopbackHub();
  const host = new HostSession(hub.getHostTransport(), { variant: 'BO4', roomCode: 'AB12' });
  const client = hub.createClientTransport(token);
  const got: HostPacket[] = [];
  client.onMessage((p: HostPacket) => got.push(p));
  client.send({ v: 1, seq: 1, type: 'JOIN', payload: { playerName: 'x', roomCode } } as any);
  return { got, host, hub };
}

const settle = () => new Promise((r) => setTimeout(r, 30));

describe('HostSession room code', () => {
  it('accepts the matching code (case-insensitive)', async () => {
    const { got } = join('ab12');
    await settle();
    expect(got.some((p) => p.type === 'SEAT_UPDATE')).toBe(true);
    expect(got.some((p) => p.type === 'ERROR')).toBe(false);
  });
  it('rejects a wrong code', async () => {
    const { got } = join('ZZ99');
    await settle();
    expect(got.some((p) => p.type === 'ERROR' && (p.payload as any).code === 'INVALID_ROOM')).toBe(true);
    expect(got.some((p) => p.type === 'SEAT_UPDATE')).toBe(false);
  });
  it('rejects a missing code', async () => {
    const { got } = join(undefined);
    await settle();
    expect(got.some((p) => p.type === 'SEAT_UPDATE')).toBe(false);
  });
});
