/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Card187, GameState187, Player187, Suit187 } from "../types";
import { ensureHubServer, hubBroadcast, registerHubChannel } from "../../network/gameHub";
import { getJoinCandidateIps } from "../../network/wssBridge";
import { LocalClientSocket } from "../../network/LocalClientSocket";

export type Client187Packet =
  | { type: "CHAT"; seat: number; message: string }
  | { type: "JOIN"; playerName: string; characterId?: string; clientToken: string }
  | { type: "LEAVE"; clientToken: string }
  | { type: "BID"; seat: number; bid: number }
  | { type: "DISCARD"; seat: number; cardIds: string[] }
  | { type: "TRUMP"; seat: number; trump: Suit187 }
  | { type: "PLAY_CARD"; seat: number; card: Card187 }
  | { type: "EARLY_SETTLE"; seat: number; continuePlay: boolean }
  | { type: "CHEAT_REPORT"; reporterSeat: number; accusedSeat: number; suit: Suit187 };

export type Host187Packet =
  | { type: "CHAT_BUBBLE"; seat: number; message: string }
  | { type: "ROOM_SEATS_UPDATE"; seats: (Player187 | null)[] }
  | { type: "GAME_START"; state: GameState187; yourSeat?: number }
  | { type: "STATE_UPDATE"; state: GameState187 }
  | { type: "ERROR"; message: string };

/**
 * يجد مقعد المنضم من قائمة اللاعبين بمطابقة رمز جهازه،
 * بدل افتراض مقعد ثابت (1) لكل المنضمين.
 */
export function findMySeat187(players: Player187[] | undefined, clientToken: string): number {
  if (!players) return 1;
  const idx = players.findIndex((p) => p && p.clientToken && p.clientToken === clientToken);
  return idx === -1 ? 1 : idx;
}

export class Room187Channel {
  private bc: BroadcastChannel | null = null;
  private socket: LocalClientSocket | null = null;
  private unregHost: (() => void) | null = null;
  private disposed = false;
  private role: "host" | "client" | "auto";
  /** رسائل مرسلة قبل جهوزية النقل (اتصال العميل أو تسجيل قناة المضيف). */
  private pending: (Client187Packet | Host187Packet)[] = [];
  private handlers = new Set<(msg: Client187Packet | Host187Packet) => void>();

  /**
   * role:
   * - "host": المضيف يستقبل رسائل المنضمين عبر خادم الشبكة ويبث الحالة للجميع.
   * - "client": المنضم يبحث عن المضيف على نقطة الاتصال ويرسل/يستقبل عبره.
   * - "auto": تكرار بين تبويبات نفس الجهاز فقط (للاختبار والتجربة المحلية).
   */
  constructor(roomCode: string, role: "host" | "client" | "auto" = "auto") {
    const code = roomCode.trim().toUpperCase();
    this.role = role;
    if (typeof BroadcastChannel !== "undefined") {
      this.bc = new BroadcastChannel(`ikout187_room_${code}`);
    }
    if (role === "host") {
      void this.startHost();
    } else if (role === "client") {
      void this.startClient(code);
    }
  }

  private emit(msg: Client187Packet | Host187Packet): void {
    for (const h of this.handlers) h(msg);
  }

  private flushPending(): void {
    const q = [...this.pending];
    this.pending = [];
    for (const msg of q) this.send(msg);
  }

  private async startHost(): Promise<void> {
    await ensureHubServer();
    if (this.disposed) return;
    this.unregHost = registerHubChannel("g187", {
      onClientDisconnected() {
        /* المضيف يكتشف المغادرة عبر توقف رسائل المنضم */
      },
      onClientMessage: (_clientId, msg) => {
        const packet = (msg as Record<string, unknown>)["packet"] as
          | Client187Packet
          | Host187Packet
          | undefined;
        if (packet) this.emit(packet);
      },
    });
    this.flushPending();
  }

  private async startClient(code: string): Promise<void> {
    const candidates = await getJoinCandidateIps();
    for (const ip of candidates) {
      if (this.disposed) return;
      const ok = await this.tryConnect(ip, code);
      if (ok) return;
    }
  }

  private tryConnect(ip: string, code: string): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const socket = new LocalClientSocket({
        url: `ws://${ip}:8080`,
        playerToken: `g187_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
        playerName: "",
        maxReconnectAttempts: 0,
        initialBackoffMs: 300,
        channel: "g187",
        roomCode: code,
      });
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        if (!ok) {
          try {
            socket.disconnect();
          } catch {
            /* noop */
          }
          resolve(false);
        }
      };
      const timeout = window.setTimeout(() => finish(false), 3500);
      socket.onStatusChange((st) => {
        if (st === "CONNECTED") {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          this.socket = socket;
          socket.onMessage((packet) => {
            const p = packet as unknown as Client187Packet | Host187Packet;
            if (p && typeof p === "object" && "type" in p) this.emit(p);
          });
          this.flushPending();
          resolve(true);
        } else if (st === "HOST_DROPPED" || st === "DISCONNECTED") {
          finish(false);
        }
      });
    });
  }

  public send(msg: Client187Packet | Host187Packet): void {
    this.bc?.postMessage(msg);
    if (this.role === "auto") return;
    if (this.role === "host") {
      if (this.unregHost) {
        hubBroadcast({ ch: "g187", packet: msg });
      } else {
        this.pending.push(msg);
      }
      return;
    }
    if (this.socket) {
      this.socket.send(msg as never);
    } else {
      this.pending.push(msg);
    }
  }

  public onMessage(handler: (msg: Client187Packet | Host187Packet) => void): () => void {
    this.handlers.add(handler);
    if (this.bc) {
      const listener = (event: MessageEvent) => handler(event.data as never);
      this.bc.addEventListener("message", listener);
      return () => {
        this.handlers.delete(handler);
        this.bc?.removeEventListener("message", listener);
      };
    }
    return () => {
      this.handlers.delete(handler);
    };
  }

  public close(): void {
    this.disposed = true;
    this.handlers.clear();
    this.pending = [];
    this.bc?.close();
    this.bc = null;
    this.unregHost?.();
    this.unregHost = null;
    try {
      this.socket?.disconnect();
    } catch {
      /* noop */
    }
    this.socket = null;
  }
}
