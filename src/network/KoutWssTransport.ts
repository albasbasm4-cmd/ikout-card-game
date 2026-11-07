/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * KoutWssTransport — جسر بين بروتوكول الكوت (HostSession) وشبكة gameHub.
 * playerToken = clientId الخاص بـ gameHub.
 * الرسائل تُغلف داخل { ch: "kout", packet } لتفريقها عن قنوات الألعاب الأخرى.
 */

import type { IHostTransport, Unsubscribe } from "./ITransport";
import type { ClientPacket, HostPacket } from "./protocol";
import {
  ensureHubServer,
  registerHubChannel,
  hubSendTo,
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

  async start(): Promise<boolean> {
    const ok = await ensureHubServer(HUB_PORT);
    if (!ok) return false;
    this.unsubscribe = registerHubChannel(CH, {
      onClientMessage: (clientId, msg) => {
        const env = msg as unknown as KoutEnvelope;
        if (!env || typeof env !== "object" || !env.packet) return;
        const packet = env.packet as ClientPacket;
        for (const h of this.messageHandlers) {
          try {
            h(clientId, packet);
          } catch (err) {
            console.error("[KoutWssTransport] error handling message:", err);
          }
        }
      },
      onClientConnected: (clientId) => {
        for (const h of this.connectHandlers) {
          try {
            h(clientId);
          } catch (err) {
            console.error("[KoutWssTransport] error in onClientConnected:", err);
          }
        }
      },
      onClientDisconnected: (clientId) => {
        for (const h of this.disconnectHandlers) {
          try {
            h(clientId);
          } catch (err) {
            console.error("[KoutWssTransport] error in onClientDisconnected:", err);
          }
        }
      },
    });
    this.ready = true;
    return true;
  }

  private assertReady() {
    if (!this.ready) console.warn("[KoutWssTransport] start() لم يُستدعَ بعد أو لم يكتمل");
  }

  sendToClient(playerToken: string, packet: HostPacket): void {
    this.assertReady();
    hubSendTo(playerToken, { ch: CH, packet } as unknown as HubMessage);
  }

  broadcast(packet: HostPacket): void {
    this.assertReady();
    void packet;
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
    this.messageHandlers.clear();
    this.connectHandlers.clear();
    this.disconnectHandlers.clear();
    this.ready = false;
  }
}
