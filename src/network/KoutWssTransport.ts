/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * KoutWssTransport — جسر بين بروتوكول الكوت (HostSession) وشبكة gameHub.
 * يترجم بين معرّف الاتصال المتغير (clientId) والتوكن الثابت (playerToken)
 * لضمان احتفاظ اللاعب بمقعده عند إعادة الاتصال.
 */

import type { IHostTransport, Unsubscribe } from "./ITransport";
import type { ClientPacket, HostPacket } from "./protocol";
import {
  ensureHubServer,
  registerHubChannel,
  hubSendTo,
  hubCloseClient,
  HUB_PORT,
  type HubMessage,
} from "./gameHub";

const CH = "kout";

interface KoutEnvelope {
  ch: string;
  packet: ClientPacket;
}

export class KoutWssTransport implements IHostTransport {
  private messageHandlers = new Set<(playerToken: string, packet: ClientPacket) => void>();
  private connectHandlers = new Set<(playerToken: string) => void>();
  private disconnectHandlers = new Set<(playerToken: string) => void>();
  private unsubscribe: (() => void) | null = null;
  private ready = false;
  private roomCode?: string;

  constructor(options?: { roomCode?: string }) {
    if (options?.roomCode) {
      this.roomCode = options.roomCode.trim().toUpperCase();
    }
  }

  public setRoomCode(code: string): void {
    this.roomCode = code.trim().toUpperCase();
  }

  private clientToToken = new Map<string, string>();
  private tokenToClient = new Map<string, string>();
  private deadClients = new Set<string>();

  private bind(clientId: string, token: string) {
    if (this.deadClients.has(clientId)) return;
    const old = this.tokenToClient.get(token);
    if (old && old !== clientId) {
      this.deadClients.add(old);
      this.clientToToken.delete(old);
      // إغلاق أي اتصال قديم لنفس اللاعب لضمان وجود اتصال نشط واحد فقط
      hubCloseClient(old);
    }
    this.tokenToClient.set(token, clientId);
    this.clientToToken.set(clientId, token);
  }

  async start(): Promise<boolean> {
    // 1. تسجيل قناة اللعبة أولاً حتى لا تضيع أي رسائل مبكرة
    this.unsubscribe = registerHubChannel(CH, {
      onClientMessage: (clientId, msg) => {
        const env = msg as unknown as KoutEnvelope;
        if (!env || typeof env !== "object" || !env.packet) return;
        const packet = env.packet as ClientPacket;
        if (this.deadClients.has(clientId)) return;

        // التحقق من رمز الغرفة قبل استبدال أي اتصال قائم
        if (packet.type === "JOIN") {
          const room = (packet.payload as { roomCode?: string })?.roomCode;
          if (
            this.roomCode &&
            String(room || "")
              .trim()
              .toUpperCase() !== this.roomCode
          ) {
            hubSendTo(clientId, {
              ch: CH,
              packet: {
                v: 1,
                type: "REJECTED",
                payload: { reason: "INVALID_ROOM", message: "Room code does not match" },
              },
            });
            return;
          }
        }

        const token = packet.type === "JOIN"
          ? packet.playerToken
          : this.clientToToken.get(clientId);
        if (typeof token !== "string" || !token.trim()) return;
        if (packet.type === "JOIN") this.bind(clientId, token);
        if (this.deadClients.has(clientId) || this.tokenToClient.get(token) !== clientId) return;
        for (const h of Array.from(this.messageHandlers)) {
          try {
            h(token, packet);
          } catch (err) {
            console.error("[KoutWssTransport] onClientMessage error:", err);
          }
        }
      },
      onClientConnected: (clientId) => {
        for (const h of Array.from(this.connectHandlers)) {
          try {
            h(clientId);
          } catch (err) {
            console.error("[KoutWssTransport] onClientConnected error:", err);
          }
        }
      },
      onClientDisconnected: (clientId) => {
        const token = this.clientToToken.get(clientId);
        this.deadClients.delete(clientId);
        this.clientToToken.delete(clientId);
        if (!token) return;
        // إذا وصل اتصال جديد لنفس التوكن قبل إغلاق القديم، لا نعتبره انقطاعاً
        if (this.tokenToClient.get(token) !== clientId) return;
        this.tokenToClient.delete(token);
        for (const h of Array.from(this.disconnectHandlers)) {
          try {
            h(token);
          } catch (err) {
            console.error("[KoutWssTransport] onClientDisconnected error:", err);
          }
        }
      },
    });

    // 2. تشغيل خادم gameHub المشترك
    const ok = await ensureHubServer(HUB_PORT);
    if (!ok) {
      this.destroy();
      return false;
    }
    this.ready = true;
    return true;
  }

  private assertReady() {
    if (!this.ready) console.warn("[KoutWssTransport] start() لم يُستدعَ بعد");
  }

  sendToClient(playerToken: string, packet: HostPacket): void {
    this.assertReady();
    const clientId = this.tokenToClient.get(playerToken) ?? playerToken;
    hubSendTo(clientId, { ch: CH, packet } as unknown as HubMessage);
  }

  broadcast(packet: HostPacket): void {
    this.assertReady();
    for (const clientId of this.tokenToClient.values()) {
      hubSendTo(clientId, { ch: CH, packet } as unknown as HubMessage);
    }
  }

  onClientMessage(handler: (playerToken: string, packet: ClientPacket) => void): Unsubscribe {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onClientConnected(handler: (playerToken: string) => void): Unsubscribe {
    this.connectHandlers.add(handler);
    return () => this.connectHandlers.delete(handler);
  }

  onClientDisconnected(handler: (playerToken: string) => void): Unsubscribe {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }

  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.clientToToken.clear();
    this.tokenToClient.clear();
    this.deadClients.clear();
    this.messageHandlers.clear();
    this.connectHandlers.clear();
    this.disconnectHandlers.clear();
    this.ready = false;
  }
}
