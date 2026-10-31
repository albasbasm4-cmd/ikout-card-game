/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SupportedGameType } from "./multiplayerHub";

export type ConnectionStatus =
  "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "RECONNECTING" | "ERROR";

export interface MultiplayerMessage {
  type: string;
  gameType: SupportedGameType;
  roomCode: string;
  senderToken: string;
  payload?: any;
}

export class HotspotClient {
  private ws: WebSocket | null = null;
  private url: string;
  private gameType: SupportedGameType;
  private roomCode: string;
  private playerToken: string;
  private playerName: string;
  private status: ConnectionStatus = "DISCONNECTED";
  private listeners = new Set<(msg: MultiplayerMessage) => void>();
  private statusListeners = new Set<(status: ConnectionStatus) => void>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 6;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    hostIp: string,
    port: number = 8080,
    gameType: SupportedGameType,
    roomCode: string,
    playerToken: string,
    playerName: string,
  ) {
    const cleanIp = hostIp
      .trim()
      .replace(/^ws:\/\//i, "")
      .replace(/:\d+$/, "");
    this.url = `ws://${cleanIp}:${port}/ws?game=${gameType}&room=${roomCode}`;
    this.gameType = gameType;
    this.roomCode = roomCode;
    this.playerToken = playerToken;
    this.playerName = playerName;
    this.connect();
  }

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  private setStatus(s: ConnectionStatus): void {
    if (this.status === s) return;
    this.status = s;
    for (const l of this.statusListeners) l(s);
  }

  private connect(): void {
    if (typeof WebSocket === "undefined") {
      this.setStatus("DISCONNECTED");
      return;
    }

    this.setStatus(this.reconnectAttempts > 0 ? "RECONNECTING" : "CONNECTING");

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.setStatus("CONNECTED");
        // Send initial handshake / join
        this.send("JOIN_ROOM", {
          playerName: this.playerName,
          playerToken: this.playerToken,
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const data: MultiplayerMessage = JSON.parse(event.data.toString());
          for (const l of this.listeners) l(data);
        } catch {
          // ignore parsing error
        }
      };

      this.ws.onclose = () => {
        this.handleDrop();
      };

      this.ws.onerror = () => {
        this.handleDrop();
      };
    } catch {
      this.handleDrop();
    }
  }

  private handleDrop(): void {
    this.ws = null;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setStatus("DISCONNECTED");
      return;
    }
    this.reconnectAttempts++;
    this.setStatus("RECONNECTING");
    this.reconnectTimer = setTimeout(
      () => {
        this.connect();
      },
      Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 5000),
    );
  }

  public send(type: string, payload?: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const msg: MultiplayerMessage = {
        type,
        gameType: this.gameType,
        roomCode: this.roomCode,
        senderToken: this.playerToken,
        payload,
      };
      this.ws.send(JSON.stringify(msg));
    }
  }

  public onMessage(handler: (msg: MultiplayerMessage) => void): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  public onStatusChange(handler: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(handler);
    return () => this.statusListeners.delete(handler);
  }

  public disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus("DISCONNECTED");
  }
}
