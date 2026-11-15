/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ITransport, Unsubscribe } from "./ITransport";
import { ClientPacket, HostPacket, PROTOCOL_VERSION } from "./protocol";

export type ClientSocketStatus =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "JOINING"
  | "JOINED"
  | "INITIAL_STATE_RECEIVED"
  | "READY"
  | "REJECTED"
  | "ERROR"
  | "RECONNECTING"
  | "HOST_DROPPED"
  | "CLOSED";

export interface LocalClientSocketOptions {
  url?: string; // default ws://localhost:8080
  playerToken: string;
  playerName: string;
  preferredSeat?: number;
  maxReconnectAttempts?: number; // default 5
  initialBackoffMs?: number; // default 500ms
  maxBackoffMs?: number; // default 6000ms
  connectionTimeoutMs?: number; // default 4000ms
  transportOverride?: ITransport;
  /** قناة gameHub: تُغلف الحزم داخل { ch, packet } ويفكها المضيف. */
  channel?: string;
  roomCode?: string;
}

export class LocalClientSocket implements ITransport {
  private url: string;
  private playerToken: string;
  private playerName: string;
  private preferredSeat?: number;

  private ws: WebSocket | null = null;
  private status: ClientSocketStatus = "DISCONNECTED";
  private assignedSeat: number | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts: number;
  private initialBackoffMs: number;
  private maxBackoffMs: number;
  private connectionTimeoutMs: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

  private messageHandlers = new Set<(packet: HostPacket) => void>();
  private statusHandlers = new Set<(status: ClientSocketStatus) => void>();
  private hostLeftHandlers = new Set<() => void>();

  private seqCounter = 0;
  private manualDisconnect = false;
  private currentEpoch = 0;
  private transportOverride: ITransport | null = null;
  private channel?: string;
  private roomCode?: string;

  constructor(options: LocalClientSocketOptions) {
    this.url = options.url ?? "ws://localhost:8080";
    this.playerToken = options.playerToken;
    this.playerName = options.playerName;
    this.preferredSeat = options.preferredSeat;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5;
    this.initialBackoffMs = options.initialBackoffMs ?? 500;
    this.maxBackoffMs = options.maxBackoffMs ?? 6000;
    this.connectionTimeoutMs = options.connectionTimeoutMs ?? 4000;

    this.channel = options.channel;
    this.roomCode = options.roomCode;

    if (options.transportOverride) {
      this.transportOverride = options.transportOverride;
      this.setupTransportOverride();
    } else {
      this.connect();
    }
  }

  public getStatus(): ClientSocketStatus {
    return this.status;
  }

  public getAssignedSeat(): number | null {
    return this.assignedSeat;
  }

  public isConnected(): boolean {
    if (this.transportOverride) {
      return this.transportOverride.isConnected();
    }
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public isJoined(): boolean {
    return (
      this.status === "JOINED" ||
      this.status === "INITIAL_STATE_RECEIVED" ||
      this.status === "READY"
    );
  }

  public isReady(): boolean {
    return this.status === "READY";
  }

  public isHostDropped(): boolean {
    return this.status === "HOST_DROPPED";
  }

  public getPlayerToken(): string {
    return this.playerToken;
  }

  public getRoomCode(): string | undefined {
    return this.roomCode;
  }

  private setStatus(newStatus: ClientSocketStatus): void {
    if (this.status === newStatus) return;
    this.status = newStatus;
    for (const handler of Array.from(this.statusHandlers)) {
      try {
        handler(newStatus);
      } catch (err) {
        console.error("[LocalClientSocket] statusHandler error:", err);
      }
    }
    if (newStatus === "HOST_DROPPED") {
      for (const handler of Array.from(this.hostLeftHandlers)) {
        try {
          handler();
        } catch (err) {
          console.error("[LocalClientSocket] hostLeftHandler error:", err);
        }
      }
    }
  }

  private connect(): void {
    if (this.manualDisconnect) {
      this.setStatus("CLOSED");
      return;
    }

    if (typeof WebSocket === "undefined") {
      this.setStatus("DISCONNECTED");
      return;
    }

    const epoch = ++this.currentEpoch;
    this.setStatus(this.reconnectAttempts > 0 ? "RECONNECTING" : "CONNECTING");

    if (this.connectTimeoutTimer) {
      clearTimeout(this.connectTimeoutTimer);
    }
    this.connectTimeoutTimer = setTimeout(() => {
      if (this.currentEpoch === epoch && this.status === "CONNECTING") {
        try {
          this.ws?.close();
        } catch {
          /* noop */
        }
        this.handleDisconnectOrError(epoch);
      }
    }, this.connectionTimeoutMs);

    try {
      const socket = new WebSocket(this.url);
      this.ws = socket;

      socket.onopen = () => {
        if (this.currentEpoch !== epoch) {
          try {
            socket.close();
          } catch {
            /* noop */
          }
          return;
        }
        if (this.connectTimeoutTimer) {
          clearTimeout(this.connectTimeoutTimer);
          this.connectTimeoutTimer = null;
        }

        this.reconnectAttempts = 0;
        this.setStatus("CONNECTED");

        // إرسال طلب الانضمام والانتقال إلى JOINING
        this.setStatus("JOINING");
        this.sendJoin();
      };

      socket.onmessage = (event) => {
        if (this.currentEpoch !== epoch) return;

        try {
          const parsed = JSON.parse(event.data.toString());
          const packet: HostPacket =
            this.channel && parsed && typeof parsed === "object" && parsed.ch === this.channel
              ? (parsed.packet ?? parsed)
              : parsed;

          if (this.channel && (!parsed || parsed.ch !== this.channel)) return;

          // معالجة حالة القبول / الانضمام للغرفة
          if (packet && typeof packet === "object" && "type" in packet) {
            const pType = packet.type as string;
            if (pType === "JOIN_ACCEPTED") {
              const payload = (packet as any).payload;
              if (payload && typeof payload.seatIndex === "number") {
                this.assignedSeat = payload.seatIndex;
              }
              this.setStatus("JOINED");
            } else if (pType === "SEAT_UPDATE") {
              const payload = (packet as any).payload;
              if (payload && typeof payload.seatIndex === "number" && this.assignedSeat === null) {
                this.assignedSeat = payload.seatIndex;
              }
              if (this.status === "JOINING" || this.status === "CONNECTED") {
                this.setStatus("JOINED");
              }
            } else if (pType === "WELCOME" || pType === "ROOM_SEATS_UPDATE") {
              const payload = (packet as any).payload;
              if (payload && typeof payload.seat === "number") {
                this.assignedSeat = payload.seat;
              }
              if (this.status === "JOINING" || this.status === "CONNECTED") {
                this.setStatus("JOINED");
              }
            } else if (pType === "CLIENT_STATE_UPDATE" || pType === "STATE") {
              if (pType === "CLIENT_STATE_UPDATE") {
                const payload = (packet as any).payload;
                if (payload && typeof payload.seatIndex === "number") {
                  this.assignedSeat = payload.seatIndex;
                }
              }
              if (
                this.status === "JOINING" ||
                this.status === "CONNECTED" ||
                this.status === "JOINED"
              ) {
                this.setStatus("INITIAL_STATE_RECEIVED");
                this.setStatus("READY");
              }
            } else if (pType === "REJECTED") {
              this.setStatus("REJECTED");
            } else if (pType === "ERROR") {
              const errPayload = (packet as any).payload;
              const errMsg =
                typeof errPayload === "string"
                  ? errPayload
                  : errPayload?.message || (packet as any).message;
              if (
                errMsg &&
                (errMsg.includes("رمز الغرفة") ||
                  errMsg.includes("INVALID_ROOM") ||
                  errMsg.includes("ROOM_FULL") ||
                  errMsg.includes("ممتلئة") ||
                  errMsg.includes("GAME_ALREADY_STARTED") ||
                  errMsg.includes("REJECTED"))
              ) {
                this.setStatus("REJECTED");
              } else {
                this.setStatus("ERROR");
              }
            }
          }

          for (const handler of Array.from(this.messageHandlers)) {
            try {
              handler(packet);
            } catch (err) {
              console.error("[LocalClientSocket] messageHandler error:", err);
            }
          }
        } catch (err) {
          console.error("[LocalClientSocket] Parse error:", err);
        }
      };

      socket.onclose = () => {
        if (this.currentEpoch !== epoch) return;
        this.handleDisconnectOrError(epoch);
      };

      socket.onerror = () => {
        if (this.currentEpoch !== epoch) return;
        // يتم التعامل مع انقطاع الاتصال عند onclose
      };
    } catch {
      this.handleDisconnectOrError(epoch);
    }
  }

  private handleDisconnectOrError(epoch: number): void {
    if (this.connectTimeoutTimer) {
      clearTimeout(this.connectTimeoutTimer);
      this.connectTimeoutTimer = null;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* noop */
      }
      this.ws = null;
    }

    if (this.manualDisconnect) {
      this.setStatus("CLOSED");
      return;
    }

    if (this.status === "REJECTED") {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setStatus("HOST_DROPPED");
      return;
    }

    this.reconnectAttempts++;
    this.setStatus("RECONNECTING");

    const delay = Math.min(
      this.initialBackoffMs * Math.pow(2, this.reconnectAttempts - 1),
      this.maxBackoffMs,
    );

    this.reconnectTimer = setTimeout(() => {
      if (this.currentEpoch === epoch) {
        this.connect();
      }
    }, delay);
  }

  private sendJoin(): void {
    this.send({
      v: PROTOCOL_VERSION,
      seq: ++this.seqCounter,
      playerToken: this.playerToken,
      type: "JOIN",
      payload: {
        playerName: this.playerName,
        preferredSeat: this.preferredSeat,
        roomCode: this.roomCode,
      },
    });
  }

  private setupTransportOverride(): void {
    if (!this.transportOverride) return;
    this.setStatus("CONNECTED");
    this.setStatus("JOINING");

    this.transportOverride.onMessage((packet) => {
      if (packet.type === "JOIN_ACCEPTED") {
        const payload = (packet as any).payload;
        if (payload && typeof payload.seatIndex === "number") {
          this.assignedSeat = payload.seatIndex;
        }
        this.setStatus("JOINED");
      } else if (
        packet.type === "SEAT_UPDATE" ||
        (packet as any).type === "WELCOME"
      ) {
        const payload = (packet as any).payload;
        if (payload && typeof payload.seatIndex === "number" && this.assignedSeat === null) {
          this.assignedSeat = payload.seatIndex;
        }
        this.setStatus("JOINED");
      } else if (packet.type === "CLIENT_STATE_UPDATE") {
        const payload = (packet as any).payload;
        if (payload && typeof payload.seatIndex === "number") {
          this.assignedSeat = payload.seatIndex;
        }
        this.setStatus("INITIAL_STATE_RECEIVED");
        this.setStatus("READY");
      } else if (packet.type === "REJECTED") {
        this.setStatus("REJECTED");
      }
      for (const handler of Array.from(this.messageHandlers)) {
        handler(packet);
      }
    });

    this.sendJoin();
  }

  // --- ITransport implementation ---
  public send(packet: ClientPacket): void {
    const pType = packet.type as string;
    if (pType !== "JOIN" && pType !== "HELLO" && !this.isJoined()) {
      console.warn("[LocalClientSocket] Cannot send action before joined:", packet.type);
      return;
    }

    if (this.transportOverride) {
      this.transportOverride.send(packet);
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(
          this.channel ? JSON.stringify({ ch: this.channel, packet }) : JSON.stringify(packet),
        );
      } catch (err) {
        console.warn("[LocalClientSocket] send error:", err);
      }
    }
  }

  public onMessage(handler: (packet: HostPacket) => void): Unsubscribe {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  public onStatusChange(handler: (status: ClientSocketStatus) => void): Unsubscribe {
    this.statusHandlers.add(handler);
    return () => {
      this.statusHandlers.delete(handler);
    };
  }

  public onHostLeft(handler: () => void): Unsubscribe {
    this.hostLeftHandlers.add(handler);
    return () => {
      this.hostLeftHandlers.delete(handler);
    };
  }

  public disconnect(): void {
    this.manualDisconnect = true;
    this.currentEpoch++;

    if (this.connectTimeoutTimer) {
      clearTimeout(this.connectTimeoutTimer);
      this.connectTimeoutTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* noop */
      }
      this.ws = null;
    }
    if (this.transportOverride) {
      this.transportOverride.disconnect();
    }
    this.setStatus("CLOSED");
  }
}
