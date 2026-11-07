/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { KoutGameEngine } from "../engine/KoutGameEngine";
import { IHostTransport } from "./ITransport";
import {
  PROTOCOL_VERSION,
  ClientPacket,
  HostPacket,
  filterStateForSeat,
  ClientGameState,
} from "./protocol";
import { GameState, PlayerSlot, SeatKind } from "../types/kout";
import { RULES } from "../rules/config";
import { applyCheatVerdict } from "../rules/cheat";

export interface HostSessionOptions {
  engine?: KoutGameEngine;
  variant?: "BO6" | "BO4";
  targetScore?: number;
  initialDealer?: number;
  seed?: number;
  /** When set, joins must present this exact room code. */
  roomCode?: string;
  /** مقعد المضيف: لا يُسند أبداً لعميل منضم (0 افتراضياً). */
  hostSeat?: number;
  /** يُستدعى بعد كل تحديث على الحالة (يُستخدم لمزامنة واجهة المضيف). */
  onStateChange?: (state: GameState) => void;
  /** يُستدعى عند انضمام/تحديث مقعد عميل (لوبي المضيف). */
  onSeatUpdate?: (seatIndex: number, player: PlayerSlot, players: PlayerSlot[]) => void;
}

export class HostSession {
  private engine: KoutGameEngine;
  private hostSeat: number;
  private optionsRef: HostSessionOptions;
  private transport: IHostTransport;
  /** ربط معرف الاتصال المباشر (مثل c1) برقم المقعد */
  private tokenToSeat = new Map<string, number>();
  /** ربط رقم المقعد بمعرف الاتصال المباشر */
  private seatToToken = new Map<number, string>();
  /** ربط الرمز الدائم للجلسة (playerToken) برقم المقعد لدعم إعادة الاتصال واستعادة المقعد */
  private sessionTokenToSeat = new Map<string, number>();
  private seatToSessionToken = new Map<number, string>();

  private hostSeq = 0;
  private unsubscribeMessages?: () => void;
  private unsubscribeDisconnects?: () => void;
  private roomCode?: string;

  // مضاد إساءة استخدام البلاغات: حد أقصى للجولة الواحدة وفاصل زمني بين البلاغات
  private cheatReportsThisRound = 0;
  private cheatReportRound = -1;
  private lastCheatReportAt = 0;
  private stateListeners = new Set<(state: GameState) => void>();
  private seatListeners = new Set<
    (seatIndex: number, player: PlayerSlot, players: PlayerSlot[]) => void
  >();
  private continueListeners = new Set<(seat: number, continuePlay: boolean) => void>();

  constructor(transport: IHostTransport, options: HostSessionOptions = {}) {
    this.transport = transport;
    this.optionsRef = options;
    // بدون تحديد، لا يوجد مقعد محجوز (اختبارات المحاكي تُسند المقعد 0 لعميل)
    this.hostSeat = options.hostSeat ?? -1;
    this.roomCode = options.roomCode?.trim().toUpperCase() || undefined;

    if (options.engine) {
      this.engine = options.engine;
    } else {
      this.engine = new KoutGameEngine({
        variant: options.variant ?? "BO6",
        targetScore: options.targetScore ?? 51,
        initialDealer: options.initialDealer ?? 0,
        seed: options.seed ?? 12345,
      });
    }

    this.setupTransportListeners();
  }

  public get state(): Readonly<GameState> {
    return this.engine.state;
  }

  public getEngine(): KoutGameEngine {
    return this.engine;
  }

  /**
   * يستبدل المحرك (يُستخدم عند بدء المباراة بتشكيلة الغرفة النهائية،
   * أو بعد حكم بلاغ الغش على المضيف).
   */
  public replaceEngine(engine: KoutGameEngine): void {
    this.engine = engine;
    this.broadcastState();
  }

  /** يشترك في تحديثات الحالة (واجهة المضيف). */
  public onStateChange(cb: (state: GameState) => void): () => void {
    this.stateListeners.add(cb);
    return () => {
      this.stateListeners.delete(cb);
    };
  }

  /** يشترك في انضمام/تحديث مقعد (واجهة لوبي المضيف). */
  public onSeatUpdate(
    cb: (seatIndex: number, player: PlayerSlot, players: PlayerSlot[]) => void,
  ): () => void {
    this.seatListeners.add(cb);
    return () => {
      this.seatListeners.delete(cb);
    };
  }

  /** قرار الاستمرار/التوقف بعد نهاية المباراة */
  public onContinueDecision(cb: (seat: number, continuePlay: boolean) => void): () => void {
    this.continueListeners.add(cb);
    return () => {
      this.continueListeners.delete(cb);
    };
  }

  public startRound(seed?: number): void {
    this.engine.startRound(seed);
    this.broadcastState();
  }

  private setupTransportListeners(): void {
    this.unsubscribeMessages = this.transport.onClientMessage(
      (playerToken: string, packet: ClientPacket) => {
        this.handleClientPacket(playerToken, packet);
      },
    );

    if (this.transport.onClientDisconnected) {
      this.unsubscribeDisconnects = this.transport.onClientDisconnected((playerToken: string) => {
        this.handleClientDisconnect(playerToken);
      });
    }
  }

  public destroy(): void {
    if (this.unsubscribeMessages) {
      this.unsubscribeMessages();
      this.unsubscribeMessages = undefined;
    }
    if (this.unsubscribeDisconnects) {
      this.unsubscribeDisconnects();
      this.unsubscribeDisconnects = undefined;
    }
    this.stateListeners.clear();
    this.seatListeners.clear();
    this.continueListeners.clear();
  }

  /** معالجة انقطاع اتصال عميل مؤقتاً والاحتفاظ بمقعده لتمكينه من العودة */
  public handleClientDisconnect(transportToken: string): void {
    const seat = this.tokenToSeat.get(transportToken);
    if (seat === undefined) return;

    this.tokenToSeat.delete(transportToken);
    this.seatToToken.delete(seat);

    // تحديث حالة الاتصال في المقعد دون حذفه فوراً
    const currentPlayers = [...(this.engine.state.players || [])];
    if (currentPlayers[seat]) {
      const updatedSlot: PlayerSlot = {
        ...currentPlayers[seat],
        connected: false,
      };
      currentPlayers[seat] = updatedSlot;
      (this.engine.state as any).players = currentPlayers;

      // إخطار واجهات اللوبي والمباراة بانقطاع اللاعب
      this.optionsRef.onSeatUpdate?.(seat, updatedSlot, currentPlayers);
      for (const l of this.seatListeners) l(seat, updatedSlot, currentPlayers);
      this.broadcastState();
    }
  }

  private handleClientPacket(playerToken: string, packet: ClientPacket): void {
    switch (packet.type) {
      case "JOIN": {
        this.handleJoin(playerToken, packet);
        break;
      }
      case "BID_REQUEST": {
        this.handleBidRequest(playerToken, packet);
        break;
      }
      case "TRUMP_REQUEST": {
        this.handleTrumpRequest(playerToken, packet);
        break;
      }
      case "PLAY_CARD_REQUEST": {
        this.handlePlayCardRequest(playerToken, packet);
        break;
      }
      case "CHEAT_REPORT": {
        this.handleCheatReport(playerToken, packet);
        break;
      }
      case "CONTINUE_DECISION": {
        const seat = this.tokenToSeat.get(playerToken);
        if (seat === undefined) break;
        for (const l of this.continueListeners) l(seat, !!packet.payload?.continuePlay);
        break;
      }
      case "PING": {
        this.sendPacket(playerToken, {
          type: "PONG",
          payload: {
            timestamp: packet.payload.timestamp,
            serverTime: Date.now(),
          },
        });
        break;
      }
      default: {
        this.sendError(
          playerToken,
          "UNKNOWN_PACKET",
          `Unknown packet type: ${(packet as any).type}`,
          (packet as any).seq,
        );
      }
    }
  }

  private handleJoin(playerToken: string, packet: Extract<ClientPacket, { type: "JOIN" }>): void {
    const numSeats = RULES[this.engine.state.variant].seats;
    const preferred = packet.payload.preferredSeat;
    const sessionToken = packet.playerToken || playerToken;

    if (this.roomCode) {
      const given = (packet.payload as { roomCode?: string }).roomCode?.trim().toUpperCase();
      if (given !== this.roomCode) {
        this.sendError(playerToken, "INVALID_ROOM", "Room code does not match", packet.seq);
        return;
      }
    }

    let assignedSeat: number | undefined;

    // 1) فحص هل هذا اللاعب يعيد الاتصال بنفس رمز الجلسة الدائم (Reconnect)
    if (sessionToken && this.sessionTokenToSeat.has(sessionToken)) {
      const prevSeat = this.sessionTokenToSeat.get(sessionToken)!;
      if (prevSeat !== this.hostSeat && prevSeat >= 0 && prevSeat < numSeats) {
        // تنظيف أي معرف اتصال قديم لهذا المقعد
        const oldTransport = this.seatToToken.get(prevSeat);
        if (oldTransport && oldTransport !== playerToken) {
          this.tokenToSeat.delete(oldTransport);
        }
        assignedSeat = prevSeat;
      }
    }

    // 2) فحص هل الاتصال الحالي مسجل مسبقاً
    if (assignedSeat === undefined) {
      assignedSeat = this.tokenToSeat.get(playerToken);
    }

    // 3) تخصيص مقعد جديد مفتوح
    if (assignedSeat === undefined) {
      if (
        preferred !== undefined &&
        preferred >= 0 &&
        preferred < numSeats &&
        preferred !== this.hostSeat &&
        !this.seatToToken.has(preferred)
      ) {
        assignedSeat = preferred;
      } else {
        for (let s = 0; s < numSeats; s++) {
          if (s !== this.hostSeat && !this.seatToToken.has(s)) {
            assignedSeat = s;
            break;
          }
        }
      }
    }

    if (assignedSeat === undefined) {
      this.sendError(playerToken, "ROOM_FULL", "No available seats in this room", packet.seq);
      return;
    }

    // تسجيل الربط الثنائي
    this.tokenToSeat.set(playerToken, assignedSeat);
    this.seatToToken.set(assignedSeat, playerToken);
    if (sessionToken) {
      this.sessionTokenToSeat.set(sessionToken, assignedSeat);
      this.seatToSessionToken.set(assignedSeat, sessionToken);
    }

    // تحديث بيانات اللاعب في المقعد
    const currentPlayers = [...(this.engine.state.players || [])];
    const existingName = currentPlayers[assignedSeat]?.name;
    const updatedSlot: PlayerSlot = {
      seatIndex: assignedSeat,
      kind: "HUMAN_REMOTE" as SeatKind,
      name: packet.payload.playerName || existingName || `لاعب ${assignedSeat + 1}`,
      team: (assignedSeat % 2) as 0 | 1,
      connected: true,
      playerToken: sessionToken,
    };
    currentPlayers[assignedSeat] = updatedSlot;
    (this.engine.state as any).players = currentPlayers;

    // إرسال تحديث المقعد للاعب
    this.sendPacket(playerToken, {
      type: "SEAT_UPDATE",
      payload: {
        seatIndex: assignedSeat,
        player: updatedSlot,
        players: currentPlayers,
      },
    });

    // إرسال الحالة المخصصة لهذا المقعد
    this.sendFilteredStateToSeat(assignedSeat);
    this.optionsRef.onSeatUpdate?.(assignedSeat, updatedSlot, currentPlayers);
    for (const l of this.seatListeners) l(assignedSeat, updatedSlot, currentPlayers);
    this.broadcastState();
  }

  private handleBidRequest(
    playerToken: string,
    packet: Extract<ClientPacket, { type: "BID_REQUEST" }>,
  ): void {
    const senderSeat = this.tokenToSeat.get(playerToken);
    if (senderSeat === undefined) {
      this.sendError(playerToken, "NOT_JOINED", "Must join before taking actions", packet.seq);
      return;
    }

    if (this.engine.state.phase !== "BID") {
      this.sendError(
        playerToken,
        "INVALID_PHASE",
        `Current phase is ${this.engine.state.phase}, expected BID`,
        packet.seq,
      );
      return;
    }

    if (senderSeat !== this.engine.state.currentSeat) {
      this.sendError(
        playerToken,
        "NOT_YOUR_TURN",
        `Not seat ${senderSeat}'s turn to bid (current seat is ${this.engine.state.currentSeat})`,
        packet.seq,
      );
      return;
    }

    try {
      this.engine.placeBid(senderSeat, packet.payload.bid);
      this.broadcastState();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.sendError(playerToken, "BID_REJECTED", msg, packet.seq);
    }
  }

  private handleTrumpRequest(
    playerToken: string,
    packet: Extract<ClientPacket, { type: "TRUMP_REQUEST" }>,
  ): void {
    const senderSeat = this.tokenToSeat.get(playerToken);
    if (senderSeat === undefined) {
      this.sendError(playerToken, "NOT_JOINED", "Must join before taking actions", packet.seq);
      return;
    }

    if (this.engine.state.phase !== "TRUMP") {
      this.sendError(
        playerToken,
        "INVALID_PHASE",
        `Current phase is ${this.engine.state.phase}, expected TRUMP`,
        packet.seq,
      );
      return;
    }

    if (senderSeat !== this.engine.state.bidderSeat) {
      this.sendError(
        playerToken,
        "NOT_BIDDER",
        `Only the winning bidder (seat ${this.engine.state.bidderSeat}) can declare trump`,
        packet.seq,
      );
      return;
    }

    try {
      this.engine.declareTrump(senderSeat, packet.payload.suit);
      this.broadcastState();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.sendError(playerToken, "TRUMP_REJECTED", msg, packet.seq);
    }
  }

  private handlePlayCardRequest(
    playerToken: string,
    packet: Extract<ClientPacket, { type: "PLAY_CARD_REQUEST" }>,
  ): void {
    const senderSeat = this.tokenToSeat.get(playerToken);
    if (senderSeat === undefined) {
      this.sendError(playerToken, "NOT_JOINED", "Must join before taking actions", packet.seq);
      return;
    }

    if (this.engine.state.phase !== "PLAY") {
      this.sendError(
        playerToken,
        "INVALID_PHASE",
        `Current phase is ${this.engine.state.phase}, expected PLAY`,
        packet.seq,
      );
      return;
    }

    if (senderSeat !== this.engine.state.currentSeat) {
      this.sendError(
        playerToken,
        "NOT_YOUR_TURN",
        `Not seat ${senderSeat}'s turn to play (current seat is ${this.engine.state.currentSeat})`,
        packet.seq,
      );
      return;
    }

    try {
      this.engine.playCard(senderSeat, packet.payload.cardId, {
        allowAnyCard: this.isFreePlay(),
      });
      this.broadcastState();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.sendError(playerToken, "PLAY_REJECTED", msg, packet.seq);
    }
  }

  private isFreePlay(): boolean {
    return this.humanSeatCount() >= 2;
  }

  private humanSeatCount(): number {
    const players = this.engine.state.players || [];
    const humans = players.filter((p) => p.kind !== "AI_BOT").length;
    return humans > 0 ? humans : 1;
  }

  private handleCheatReport(
    playerToken: string,
    packet: Extract<ClientPacket, { type: "CHEAT_REPORT" }>,
  ): void {
    const senderSeat = this.tokenToSeat.get(playerToken);
    if (senderSeat === undefined) {
      this.sendError(playerToken, "NOT_JOINED", "Must join before reporting", packet.seq);
      return;
    }

    if (this.engine.state.phase !== "PLAY" && this.engine.state.phase !== "ROUND_END") {
      this.sendError(
        playerToken,
        "INVALID_PHASE",
        "Reports are only allowed during play",
        packet.seq,
      );
      return;
    }

    if (this.cheatReportRound !== this.engine.state.roundNo) {
      this.cheatReportRound = this.engine.state.roundNo;
      this.cheatReportsThisRound = 0;
    }
    if (this.cheatReportsThisRound >= 3) {
      this.sendError(
        playerToken,
        "REPORT_LIMIT",
        "Reached the report limit for this round",
        packet.seq,
      );
      return;
    }
    const now = Date.now();
    if (now - this.lastCheatReportAt < 8000) {
      this.sendError(
        playerToken,
        "REPORT_COOLDOWN",
        "Wait a moment before reporting again",
        packet.seq,
      );
      return;
    }

    const { accusedSeat, cardType } = packet.payload;
    const result = applyCheatVerdict(this.engine.state, senderSeat, accusedSeat, cardType);

    if (!result) {
      this.sendError(
        playerToken,
        "REPORT_REJECTED",
        "لا يمكن الإبلاغ عن لاعب في فريقك",
        packet.seq,
      );
      return;
    }

    this.lastCheatReportAt = now;
    this.cheatReportsThisRound += 1;

    this.engine = new KoutGameEngine(
      { variant: this.engine.state.variant, targetScore: this.engine.state.targetScore },
      result.nextState,
    );

    for (const seat of this.seatToToken.keys()) {
      const clientToken = this.seatToToken.get(seat);
      if (clientToken) {
        this.sendPacket(clientToken, {
          type: "CHEAT_VERDICT",
          payload: {
            confirmed: result.confirmed,
            accusedSeat,
            cardType,
            reporterSeat: senderSeat,
            roundNo: this.engine.state.roundNo,
            announcement: result.announcement,
            pointsAdded: result.pointsAdded,
            winningTeam: result.winningTeam,
          },
        });
      }
    }

    this.broadcastState();
  }

  public broadcastState(): void {
    for (const [seatIndex, token] of this.seatToToken.entries()) {
      this.sendFilteredStateToSeat(seatIndex, token);
    }
    this.optionsRef.onStateChange?.(this.engine.state);
    for (const l of this.stateListeners) l(this.engine.state);
  }

  public sendFilteredStateToSeat(seatIndex: number, playerToken?: string): void {
    const token = playerToken ?? this.seatToToken.get(seatIndex);
    if (!token) return;

    const filtered: ClientGameState = filterStateForSeat(this.engine.state, seatIndex);

    this.sendPacket(token, {
      type: "CLIENT_STATE_UPDATE",
      payload: {
        state: filtered,
        seatIndex,
      },
    });
  }

  private sendPacket<T extends HostPacket["type"]>(
    playerToken: string,
    packetData: { type: T; payload: Extract<HostPacket, { type: T }>["payload"] },
  ): void {
    const packet: HostPacket = {
      v: PROTOCOL_VERSION,
      seq: ++this.hostSeq,
      playerToken,
      type: packetData.type,
      payload: packetData.payload,
    } as HostPacket;

    this.transport.sendToClient(playerToken, packet);
  }

  private sendError(
    playerToken: string,
    code: string,
    message: string,
    originalSeq?: number,
  ): void {
    this.sendPacket(playerToken, {
      type: "ERROR",
      payload: {
        code,
        message,
        originalSeq,
      },
    });
  }
}
