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
  private static readonly CONTROL_PACKET_TYPES = new Set<string>([
    "JOIN",
    "HELLO",
    "PING",
    "PONG",
    "DISCONNECT",
    "RECONNECT",
  ]);

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

  /** تخزين مؤقت للحالة الابتدائية إذا وصلت قبل JOIN_ACCEPTED */
  private pendingInitialStatePacket: HostPacket | null = null;

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

  /**
   * تم قبول اللاعب رسمياً في الغرفة من قِبل المضيف وتم تعيين مقعد له.
   * لا تعني بالضرورة جاهزية اللعب (انظر isReady).
   */
  public isJoined(): boolean {
    return (
      this.assignedSeat !== null &&
      (this.status === "JOINED" ||
        this.status === "INITIAL_STATE_RECEIVED" ||
        this.status === "READY")
    );
  }

  /**
   * العميل جاهز بالكامل: استلم وقبل الحالة الابتدائية الموثوقة من المضيف
   * ويمكنه استقبال وإرسال حركات اللعبة.
   */
  public isReady(): boolean {
    return this.status === "READY";
  }

  /**
   * التحقق مما إذا كان العميل مخولاً بإرسال حركات اللعب (مشروط بـ READY).
   */
  public canSendGameActions(): boolean {
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

          this.handleInboundPacket(packet);

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
      };
    } catch {
      this.handleDisconnectOrError(epoch);
    }
  }

  private handleInboundPacket(packet: HostPacket): void {
    if (!packet || typeof packet !== "object" || !("type" in packet)) return;
    const pType = packet.type as string;

    if (pType === "JOIN_ACCEPTED") {
      const payload = (packet as any).payload;
      if (payload && typeof payload.seatIndex === "number" && payload.seatIndex >= 0) {
        this.assignedSeat = payload.seatIndex;
        this.setStatus("JOINED");
        if (this.pendingInitialStatePacket) {
          const pending = this.pendingInitialStatePacket;
          this.pendingInitialStatePacket = null;
          this.processInitialStatePacket(pending);
        }
      }
    } else if (pType === "SEAT_UPDATE" || pType === "WELCOME" || pType === "ROOM_SEATS_UPDATE") {
      const payload = (packet as any).payload;
      const seat = typeof payload?.seatIndex === "number" ? payload.seatIndex : payload?.seat;
      if (typeof seat === "number" && seat >= 0 && this.assignedSeat === null) {
        this.assignedSeat = seat;
      }
      // ملاحظة: SEAT_UPDATE وحدها لا تعتبر قبولاً نهائياً دون JOIN_ACCEPTED
    } else if (pType === "CLIENT_STATE_UPDATE" || pType === "STATE") {
      if (
        this.status !== "JOINED" &&
        this.status !== "INITIAL_STATE_RECEIVED" &&
        this.status !== "READY"
      ) {
        // إذا وصلت الحالة قبل تأكيد القبول JOIN_ACCEPTED، يتم حفظها مؤقتاً
        this.pendingInitialStatePacket = packet;
      } else {
        this.processInitialStatePacket(packet);
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
      } else if (this.status !== "READY") {
        this.setStatus("ERROR");
      }
    }
  }

  private processInitialStatePacket(packet: HostPacket): void {
    const payload = (packet as any).payload;
    if (payload && typeof payload.seatIndex === "number" && payload.seatIndex >= 0) {
      if (this.assignedSeat === null) {
        this.assignedSeat = payload.seatIndex;
      } else if (payload.seatIndex !== this.assignedSeat) {
        // عدم تطابق المقعد المخصص في الحالة مع المقعد المعتمد المقبول رسمياً
        console.warn(
          `[LocalClientSocket] Seat mismatch in initial state: expected ${this.assignedSeat}, got ${payload.seatIndex}`,
        );
        return;
      }
    }

    const stateObj = payload?.state || (packet as any).state;
    // التحقق الصارم من بنية الحالة وصحتها
    if (stateObj && typeof stateObj === "object") {
      if (this.status !== "READY") {
        this.setStatus("INITIAL_STATE_RECEIVED");
        this.setStatus("READY");
      }
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
      this.handleInboundPacket(packet);
      for (const handler of Array.from(this.messageHandlers)) {
        handler(packet);
      }
    });

    this.sendJoin();
  }

  // --- ITransport implementation ---
  public send(packet: ClientPacket): void {
    const pType = packet.type as string;
    // حماية إرسال الحركات: يجب ألا يستطيع العميل إرسال حركات اللعبة قبل READY
    if (!LocalClientSocket.CONTROL_PACKET_TYPES.has(pType)) {
      if (!this.canSendGameActions()) {
        console.warn("[LocalClientSocket] Cannot send game action before READY:", packet.type);
        return;
      }
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
