/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RoomPeerInfo, SupportedGameType, UniversalRoomState } from "./multiplayerHub";
import { MultiplayerMessage } from "./multiplayerClient";

/**
 * Manages hosting a local multiplayer room on Android / Capacitor or browser.
 * Integrates with Android native WebSocket server or WebView bridge if available,
 * otherwise provides loopback & in-memory room management.
 */
export class HotspotHostServer {
  private gameType: SupportedGameType;
  private roomCode: string;
  private hostIp: string;
  private port: number;
  private maxPlayers: number;
  private peers: Map<string, RoomPeerInfo> = new Map();
  private messageListeners = new Set<(clientToken: string, msg: MultiplayerMessage) => void>();
  private peerChangeListeners = new Set<(peers: RoomPeerInfo[]) => void>();

  constructor(
    gameType: SupportedGameType,
    roomCode: string,
    hostIp: string,
    port = 8080,
    maxPlayers = 6,
  ) {
    this.gameType = gameType;
    this.roomCode = roomCode;
    this.hostIp = hostIp;
    this.port = port;
    this.maxPlayers = maxPlayers;

    // Check if running on Android with Native WebSocket Server plugin
    this.initNativeServer();
  }

  private initNativeServer(): void {
    if (typeof window === "undefined") return;
    const win = window as any;
    if (win.Capacitor?.Plugins?.WebSocketServer?.start) {
      try {
        win.Capacitor.Plugins.WebSocketServer.start({ port: this.port });
        win.Capacitor.Plugins.WebSocketServer.addListener("message", (evt: any) => {
          this.handleIncomingRaw(evt.connectionId, evt.message);
        });
      } catch {
        // Native server start error
      }
    } else if (win.AndroidWsServer?.start) {
      try {
        win.AndroidWsServer.start(this.port);
      } catch {
        // ignore
      }
    }
  }

  public registerHost(hostToken: string, hostName: string, characterId?: string): void {
    this.peers.set(hostToken, {
      token: hostToken,
      name: hostName,
      characterId,
      seatIndex: 0,
      isHost: true,
      isBot: false,
      connected: true,
    });
    this.notifyPeers();
  }

  public addPeer(token: string, name: string, characterId?: string): number | null {
    if (this.peers.has(token)) {
      const existing = this.peers.get(token)!;
      existing.connected = true;
      existing.name = name;
      this.notifyPeers();
      return existing.seatIndex;
    }

    if (this.peers.size >= this.maxPlayers) {
      return null;
    }

    const assignedSeat = this.peers.size;
    this.peers.set(token, {
      token,
      name,
      characterId,
      seatIndex: assignedSeat,
      isHost: false,
      isBot: false,
      connected: true,
    });
    this.notifyPeers();
    return assignedSeat;
  }

  public removePeer(token: string): void {
    const p = this.peers.get(token);
    if (p) {
      p.connected = false;
      this.notifyPeers();
    }
  }

  public getPeers(): RoomPeerInfo[] {
    return Array.from(this.peers.values());
  }

  public broadcast(type: string, payload?: any): void {
    const msg: MultiplayerMessage = {
      type,
      gameType: this.gameType,
      roomCode: this.roomCode,
      senderToken: "HOST",
      payload,
    };
    const raw = JSON.stringify(msg);

    if (typeof window !== "undefined") {
      const win = window as any;
      if (win.Capacitor?.Plugins?.WebSocketServer?.broadcast) {
        win.Capacitor.Plugins.WebSocketServer.broadcast({ message: raw });
      } else if (win.AndroidWsServer?.broadcast) {
        win.AndroidWsServer.broadcast(raw);
      }
    }
  }

  private handleIncomingRaw(senderId: string, raw: string): void {
    try {
      const msg: MultiplayerMessage = JSON.parse(raw);
      if (msg.type === "JOIN_ROOM" && msg.payload) {
        this.addPeer(msg.payload.playerToken, msg.payload.playerName);
        this.broadcast("ROOM_STATE", { peers: this.getPeers() });
      }
      for (const l of this.messageListeners) {
        l(senderId, msg);
      }
    } catch {
      // ignore
    }
  }

  public onMessage(handler: (clientToken: string, msg: MultiplayerMessage) => void): () => void {
    this.messageListeners.add(handler);
    return () => this.messageListeners.delete(handler);
  }

  public onPeersChange(handler: (peers: RoomPeerInfo[]) => void): () => void {
    this.peerChangeListeners.add(handler);
    return () => this.peerChangeListeners.delete(handler);
  }

  private notifyPeers(): void {
    const list = this.getPeers();
    for (const l of this.peerChangeListeners) l(list);
  }

  public stop(): void {
    if (typeof window !== "undefined") {
      const win = window as any;
      if (win.Capacitor?.Plugins?.WebSocketServer?.stop) {
        win.Capacitor.Plugins.WebSocketServer.stop();
      } else if (win.AndroidWsServer?.stop) {
        win.AndroidWsServer.stop();
      }
    }
    this.peers.clear();
  }
}
