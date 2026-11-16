/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Card187, GameState187, Player187, Suit187 } from "../types";
import {
  ensureHubServer,
  hubBroadcast,
  hubSendTo,
  hubCloseClient,
  registerHubChannel,
} from "../../network/gameHub";
import { getJoinCandidateIps } from "../../network/wssBridge";
import { LocalClientSocket } from "../../network/LocalClientSocket";
import { getPersistentPlayerToken } from "../../network/playerToken";

export type Client187Packet =
  | { type: "CHAT"; seat: number; message: string; seq?: number }
  | {
      type: "JOIN";
      playerName: string;
      characterId?: string;
      clientToken: string;
      roomCode?: string;
      seq?: number;
    }
  | { type: "LEAVE"; clientToken: string }
  | { type: "BID"; seat: number; bid: number; seq?: number }
  | { type: "DISCARD"; seat: number; cardIds: string[]; seq?: number }
  | { type: "TRUMP"; seat: number; trump: Suit187; seq?: number }
  | { type: "PLAY_CARD"; seat: number; card: Card187; seq?: number }
  | { type: "EARLY_SETTLE"; seat: number; continuePlay: boolean; seq?: number }
  | {
      type: "CHEAT_REPORT";
      reporterSeat: number;
      accusedSeat: number;
      suit: Suit187;
      seq?: number;
    };

export type Host187Packet =
  | { type: "CHAT_BUBBLE"; seat: number; message: string }
  | { type: "ROOM_SEATS_UPDATE"; seats: (Player187 | null)[] }
  | { type: "GAME_START"; state: GameState187; yourSeat?: number }
  | { type: "STATE_UPDATE"; state: GameState187 }
  | { type: "WELCOME"; payload: { seat: number; code: string } }
  | { type: "JOIN_ACCEPTED"; payload: { seatIndex: number; roomCode: string } }
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

/**
 * ينشئ نسخة شبكية آمنة: أوراق صاحب المقعد فقط تبقى مكشوفة، وتُحجب أوراق بقية المقاعد.
 * وتُحذف رموز التوكن الحساسة لجميع الخصوم لمنع تسريب بيانات المصادقة.
 */
export function maskGameState187(state: GameState187, clientSeat: number): GameState187 {
  const hands = state.hands.map((hand, seat) =>
    seat === clientSeat
      ? hand
      : hand.map((_, index) => ({
          id: `masked-${seat}-${index}`,
          suit: "S" as Suit187,
          rank: 2 as const,
        })),
  );
  const players = state.players.map((p, idx) => ({
    ...p,
    clientToken: idx === clientSeat ? p.clientToken : undefined,
  }));
  return { ...state, hands, players };
}

let activeRoom187Channel: Room187Channel | null = null;

export function getActiveRoom187Channel(): Room187Channel | null {
  return activeRoom187Channel;
}

export function setActiveRoom187Channel(ch: Room187Channel | null): void {
  activeRoom187Channel = ch;
}

export class Room187Channel {
  private bc: BroadcastChannel | null = null;
  private socket: LocalClientSocket | null = null;
  private unregHost: (() => void) | null = null;
  private disposed = false;
  private role: "host" | "client" | "auto";
  private code: string;
  private targetHostIp?: string;
  /** رسائل مرسلة قبل جهوزية النقل (اتصال العميل أو تسجيل قناة المضيف). */
  private pending: (Client187Packet | Host187Packet)[] = [];
  private handlers = new Set<(msg: Client187Packet | Host187Packet) => void>();

  // خرائط المضيف الموثوقة للمقاعد والتوكنات والاتصالات
  private clientToToken = new Map<string, string>();
  private tokenToClient = new Map<string, string>();
  private tokenToSeat = new Map<string, number>();
  private seatToToken = new Map<number, string>();
  private deadClients = new Set<string>();
  private lastSeqByToken = new Map<string, number>();
  private disconnectTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private lastState: GameState187 | null = null;

  constructor(
    roomCode: string,
    role: "host" | "client" | "auto" = "auto",
    hostIp?: string,
    initialPlayers?: Player187[],
  ) {
    const code = roomCode.trim().toUpperCase();
    this.code = code;
    this.role = role;
    this.targetHostIp = hostIp;

    if (initialPlayers) {
      this.setInitialSeatBindings(initialPlayers);
    }

    if (role === "auto" && typeof BroadcastChannel !== "undefined") {
      this.bc = new BroadcastChannel(`ikout187_room_${code}`);
    }
    if (role === "host") {
      void this.startHost();
    } else if (role === "client") {
      void this.startClient(code, hostIp);
    }
  }

  public getRoomCode(): string {
    return this.code;
  }

  public isDisposed(): boolean {
    return this.disposed;
  }

  public getRole(): "host" | "client" | "auto" {
    return this.role;
  }

  public setInitialSeatBindings(players: Player187[]): void {
    for (const p of players) {
      if (p && p.clientToken && typeof p.seatIndex === "number") {
        this.tokenToSeat.set(p.clientToken, p.seatIndex);
        this.seatToToken.set(p.seatIndex, p.clientToken);
      }
    }
  }

  public bindSeat(token: string, seat: number): void {
    this.tokenToSeat.set(token, seat);
    this.seatToToken.set(seat, token);
  }

  public getBoundSeat(token: string): number | undefined {
    return this.tokenToSeat.get(token);
  }

  private emit(msg: Client187Packet | Host187Packet): void {
    for (const h of Array.from(this.handlers)) {
      try {
        h(msg);
      } catch (err) {
        console.error("[Room187Channel] handler error:", err);
      }
    }
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
      onClientDisconnected: (clientId) => {
        const token = this.clientToToken.get(clientId);
        this.clientToToken.delete(clientId);
        this.deadClients.delete(clientId);
        if (!token) return;
        if (this.tokenToClient.get(token) !== clientId) return;
        this.tokenToClient.delete(token);

        const seat = this.tokenToSeat.get(token);
        if (seat !== undefined) {
          const oldTimer = this.disconnectTimers.get(seat);
          if (oldTimer) clearTimeout(oldTimer);
          this.disconnectTimers.set(
            seat,
            setTimeout(() => {
              this.disconnectTimers.delete(seat);
            }, 8000),
          );
        }
        this.emit({ type: "LEAVE", clientToken: token });
      },
      onClientMessage: (clientId, msg) => {
        if (this.deadClients.has(clientId)) return;

        const packet = (msg as Record<string, unknown>)["packet"] as
          Client187Packet | Host187Packet | undefined;
        if (!packet || typeof packet !== "object" || !("type" in packet)) return;

        const j = packet as Record<string, unknown> as {
          payload?: Record<string, unknown>;
          clientToken?: unknown;
          roomCode?: unknown;
          seq?: unknown;
        };

        const tokenCandidate =
          typeof j.clientToken === "string" && j.clientToken
            ? j.clientToken
            : typeof j.payload?.["playerToken"] === "string"
              ? (j.payload["playerToken"] as string)
              : null;

        if (tokenCandidate) {
          const oldClient = this.tokenToClient.get(tokenCandidate);
          if (oldClient && oldClient !== clientId) {
            this.deadClients.add(oldClient);
            this.clientToToken.delete(oldClient);
            hubCloseClient(oldClient);
          }
          this.clientToToken.set(clientId, tokenCandidate);
          this.tokenToClient.set(tokenCandidate, clientId);
        }

        const clientToken = this.clientToToken.get(clientId);

        if (packet.type === "JOIN") {
          const reject = (errMsg: string) => {
            hubSendTo(clientId, {
              ch: "g187",
              packet: { type: "ERROR", message: errMsg } as never,
            });
          };

          if (j.clientToken === undefined) {
            const room = j.payload?.["roomCode"];
            if (room === undefined || String(room).trim().toUpperCase() !== this.code) {
              reject("رمز الغرفة غير صحيح");
              return;
            }
            // إذا كان اللاعب معروفاً مسبقاً (إعادة اتصال)، نعيد له مقعده فوراً
            if (tokenCandidate && this.tokenToSeat.has(tokenCandidate)) {
              const seat = this.tokenToSeat.get(tokenCandidate)!;
              const timer = this.disconnectTimers.get(seat);
              if (timer) {
                clearTimeout(timer);
                this.disconnectTimers.delete(seat);
              }
              hubSendTo(clientId, {
                ch: "g187",
                packet: { type: "WELCOME", payload: { seat, code: this.code } },
              });
              if (this.lastState) {
                hubSendTo(clientId, {
                  ch: "g187",
                  packet: {
                    type: "STATE_UPDATE",
                    state: maskGameState187(this.lastState, seat),
                  },
                });
              }
            }
            return;
          }

          if (j.roomCode === undefined || String(j.roomCode).trim().toUpperCase() !== this.code) {
            reject("رمز الغرفة غير صحيح");
            return;
          }

          if (tokenCandidate && this.tokenToSeat.has(tokenCandidate)) {
            const seat = this.tokenToSeat.get(tokenCandidate)!;
            const timer = this.disconnectTimers.get(seat);
            if (timer) {
              clearTimeout(timer);
              this.disconnectTimers.delete(seat);
            }
            hubSendTo(clientId, {
              ch: "g187",
              packet: { type: "WELCOME", payload: { seat, code: this.code } },
            });
            if (this.lastState) {
              hubSendTo(clientId, {
                ch: "g187",
                packet: {
                  type: "STATE_UPDATE",
                  state: maskGameState187(this.lastState, seat),
                },
              });
            }
          }
        }

        // المضيف هو المرجع الحصري للحالة
        if (packet.type === "STATE_UPDATE") return;

        // التحقق من صلاحية الحركات وربط المقعد الموثوق ومنع الانتحال والتكرار
        if (
          packet.type === "BID" ||
          packet.type === "DISCARD" ||
          packet.type === "TRUMP" ||
          packet.type === "PLAY_CARD" ||
          packet.type === "EARLY_SETTLE" ||
          packet.type === "CHEAT_REPORT" ||
          packet.type === "CHAT"
        ) {
          if (!clientToken || this.tokenToClient.get(clientToken) !== clientId) return;

          const assignedSeat = this.tokenToSeat.get(clientToken);
          if (assignedSeat === undefined) return;

          const seq = Number((packet as Record<string, unknown>)["seq"]);
          if (Number.isInteger(seq) && seq > 0) {
            const lastSeq = this.lastSeqByToken.get(clientToken) ?? 0;
            if (seq <= lastSeq) return;
            this.lastSeqByToken.set(clientToken, seq);
          }

          // فرض المقعد المعتمد الموثوق ومنع انتحال أي مقعد آخر
          if (packet.type === "CHEAT_REPORT") {
            packet.reporterSeat = assignedSeat;
          } else if ("seat" in packet) {
            (packet as { seat: number }).seat = assignedSeat;
          }
        }

        this.emit(packet);
      },
    });

    this.flushPending();
  }

  private async startClient(code: string, hostIp?: string): Promise<void> {
    const candidates = await getJoinCandidateIps(hostIp ?? this.targetHostIp);
    for (const ip of candidates) {
      if (this.disposed) return;
      const ok = await this.tryConnect(ip, code);
      if (ok) return;
    }
  }

  private tryConnect(ip: string, code: string): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const token = getPersistentPlayerToken("g187");
      const socket = new LocalClientSocket({
        url: ip.includes(":") ? `ws://${ip}` : `ws://${ip}:8080`,
        playerToken: token,
        playerName: "",
        maxReconnectAttempts: 5,
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
        if (st === "CONNECTED" || st === "JOINED" || st === "READY") {
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
    if (this.role === "auto") {
      this.bc?.postMessage(msg);
      return;
    }

    if (this.role === "host") {
      if (this.unregHost) {
        if (msg.type === "STATE_UPDATE") {
          this.lastState = msg.state;
          this.sendStateUpdate(msg.state);
          return;
        }

        if (msg.type === "GAME_START") {
          this.lastState = msg.state;
          this.sendGameStart(msg.state);
          return;
        }

        if (msg.type === "ROOM_SEATS_UPDATE") {
          // تحديث خريطة المقاعد عند المضيف وحذف بيانات التوكن الخاصة قبل البث
          for (const s of msg.seats) {
            if (s && s.clientToken && typeof s.seatIndex === "number") {
              this.bindSeat(s.clientToken, s.seatIndex);
            }
          }

          // إرسال تحديث المقاعد الآمن خالياً من التوكنات للأجهزة الأخرى
          const sanitized = msg.seats.map((s) => (s ? { ...s, clientToken: undefined } : null));
          hubBroadcast({ ch: "g187", packet: { type: "ROOM_SEATS_UPDATE", seats: sanitized } });
          return;
        }

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

  /** إرسال بدء المباراة مع حجب أوراق الخصوم وحجب التوكنات وتحديد رقم المقعد لكل منضم. */
  public sendGameStart(state: GameState187): void {
    if (this.role !== "host") return;
    for (const player of state.players) {
      if (!player.clientToken) continue;
      this.bindSeat(player.clientToken, player.seatIndex);
      const clientId = this.tokenToClient.get(player.clientToken);
      if (!clientId) continue;

      hubSendTo(clientId, {
        ch: "g187",
        packet: {
          type: "GAME_START",
          state: maskGameState187(state, player.seatIndex),
          yourSeat: player.seatIndex,
        },
      });
    }
  }

  /** إرسال تحديث الحالة الموثوق والمحجوب خصيصاً لكل مقعد دون كشف أوراق الخصوم. */
  public sendStateUpdate(state: GameState187): void {
    if (this.role !== "host") return;
    for (const player of state.players) {
      if (!player.clientToken) continue;
      const clientId = this.tokenToClient.get(player.clientToken);
      if (!clientId) continue;

      hubSendTo(clientId, {
        ch: "g187",
        packet: {
          type: "STATE_UPDATE",
          state: maskGameState187(state, player.seatIndex),
        },
      });
    }
  }

  public onMessage(handler: (msg: Client187Packet | Host187Packet) => void): () => void {
    this.handlers.add(handler);
    if (this.role === "auto" && this.bc) {
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
    for (const t of this.disconnectTimers.values()) clearTimeout(t);
    this.disconnectTimers.clear();
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
    this.clientToToken.clear();
    this.tokenToClient.clear();
    this.tokenToSeat.clear();
    this.seatToToken.clear();
    this.deadClients.clear();
    this.lastSeqByToken.clear();
  }
}
