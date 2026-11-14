/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * KoutWssTransport — maps transient WebSocket connection IDs to stable player tokens.
 * Messages are wrapped in { ch: "kout", packet } to isolate game channels.
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
  private clientIdToToken = new Map<string, string>();
  private tokenToClientId = new Map<string, string>();
  private unsubscribe: (() => void) | null = null;
  private ready = false;

  async start(): Promise<boolean> {
    const ok = await ensureHubServer(HUB_PORT);
    if (!ok) return false;
    this.unsubscribe = registerHubChannel(CH, {
      onClientMessage: (clientId, msg) => {
        const env = msg as unknown as KoutEnvelope;
        const packet = env?.packet;
        if (!packet || typeof packet !== "object") return;
        const token = typeof packet.playerToken === "string" ? packet.playerToken.trim() : "";
        if (!token || token.length > 128) return;

        // A JOIN binds the new socket ID to the player's persistent identity.
        if (packet.type === "JOIN") {
          const previousClientId = this.tokenToClientId.get(token);
          if (previousClientId && previousClientId !== clientId) {
            this.clientIdToToken.delete(previousClientId);
          }
          this.clientIdToToken.set(clientId, token);
          this.tokenToClientId.set(token, clientId);
        } else if (this.clientIdToToken.get(clientId) !== token) {
          // Do not accept actions from a socket that has not authenticated with JOIN.
          return;
        }

        for (const handler of this.messageHandlers) handler(token, packet);
      },
      onClientConnected: (clientId) => {
        // The stable token is not known until the client sends JOIN.
        void clientId;
      },
      onClientDisconnected: (clientId) => {
        const token = this.clientIdToToken.get(clientId);
        this.clientIdToToken.delete(clientId);
        if (!token) return;
        // An old socket closing after a reconnect must not evict the new socket.
        if (this.tokenToClientId.get(token) === clientId) {
          this.tokenToClientId.delete(token);
          for (const handler of this.disconnectHandlers) handler(token);
        }
      },
    });
    this.ready = true;
    return true;
  }

  private assertReady() {
    if (!this.ready) console.warn("[KoutWssTransport] start() لم يُستدعَ بعد");
  }

  sendToClient(playerToken: string, packet: HostPacket): void {
    this.assertReady();
    const clientId = this.tokenToClientId.get(playerToken);
    if (!clientId) return;
    hubSendTo(clientId, { ch: CH, packet } as unknown as HubMessage);
  }

  broadcast(_packet: HostPacket): void {
    this.assertReady();
    // HostSession sends per-seat snapshots; broadcasting would expose private hands.
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
    this.clientIdToToken.clear();
    this.tokenToClientId.clear();
    this.ready = false;
  }
}
