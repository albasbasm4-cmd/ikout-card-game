/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Card187, GameState187, Player187, Suit187 } from '../types';

export type Client187Packet =
  | { type: 'JOIN'; playerName: string; characterId?: string; clientToken: string }
  | { type: 'LEAVE'; clientToken: string }
  | { type: 'BID'; seat: number; bid: number }
  | { type: 'DISCARD'; seat: number; cardIds: string[] }
  | { type: 'TRUMP'; seat: number; trump: Suit187 }
  | { type: 'PLAY_CARD'; seat: number; card: Card187 }
  | { type: 'EARLY_SETTLE'; seat: number; continuePlay: boolean }
  | { type: 'CHEAT_REPORT'; reporterSeat: number; accusedSeat: number; suit: Suit187 };

export type Host187Packet =
  | { type: 'ROOM_SEATS_UPDATE'; seats: (Player187 | null)[] }
  | { type: 'GAME_START'; state: GameState187; yourSeat: number }
  | { type: 'STATE_UPDATE'; state: GameState187 }
  | { type: 'ERROR'; message: string };

export class Room187Channel {
  private channel: BroadcastChannel | null = null;
  private channelName: string;

  constructor(roomCode: string) {
    this.channelName = `ikout187_room_${roomCode.trim().toUpperCase()}`;
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(this.channelName);
    }
  }

  public send(msg: Client187Packet | Host187Packet): void {
    if (this.channel) {
      this.channel.postMessage(msg);
    }
  }

  public onMessage(handler: (msg: any) => void): () => void {
    if (!this.channel) return () => {};
    const listener = (event: MessageEvent) => {
      handler(event.data);
    };
    this.channel.addEventListener('message', listener);
    return () => {
      this.channel?.removeEventListener('message', listener);
    };
  }

  public close(): void {
    this.channel?.close();
    this.channel = null;
  }
}
