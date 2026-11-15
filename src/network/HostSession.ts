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
import { verifyCheatReport, applyCheatVerdict } from "../rules/cheat";
import { canDecideContinue } from "../engine/matchContinue";

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
  private tokenToSeat = new Map<string, number>();
  private seatToToken = new Map<number, string>();
  private hostSeq = 0;
  private unsubscribeMessages?: () => void;
  private roomCode?: string;
  // مضاد إساءة استخدام البلاغات: حد أقصى للجولة الواحدة وفاصل زمني بين البلاغات
  private cheatReportsThisRound = 0;
  private cheatReportRound = -1;
  private lastCheatReportAt = 0;
  private stateListeners = new Set<(state: GameState) => void>();
  private disconnectTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private lastProcessedSeq = new Map<string, number>();
  private readonly BOT_TAKEOVER_MS = 8000;
  private unsubscribeDisconnect?: () => void;

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

    this.setupTransportListener();
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

  private seatListeners = new Set<
    (seatIndex: number, player: PlayerSlot, players: PlayerSlot[]) => void
  >();

  /** يشترك في انضمام/تحديث مقعد (واجهة لوبي المضيف). */
  public onSeatUpdate(
    cb: (seatIndex: number, player: PlayerSlot, players: PlayerSlot[]) => void,
  ): () => void {
    this.seatListeners.add(cb);
    return () => {
      this.seatListeners.delete(cb);
    };
  }

  public startRound(seed?: number): void {
    this.engine.startRound(seed);
    this.broadcastState();
  }

  private setupTransportListener(): void {
    this.unsubscribeMessages = this.transport.onClientMessage(
      (playerToken: string, packet: ClientPacket) => {
        this.handleClientPacket(playerToken, packet);
      },
    );
    this.setupDisconnectListener();
  }

  private setupDisconnectListener(): void {
    this.unsubscribeDisconnect = this.transport.onClientDisconnected
      ? this.transport.onClientDisconnected((token) => {
          const seat = this.tokenToSeat.get(token);
          if (seat === undefined) return;
          this.patchSlot(seat, { connected: false });
          const timer = this.disconnectTimers.get(seat);
          if (timer) clearTimeout(timer);
          this.disconnectTimers.set(
            seat,
            setTimeout(() => this.botTakeover(seat), this.BOT_TAKEOVER_MS),
          );
        })
      : () => {};
  }

  private botTakeover(seat: number): void {
    this.disconnectTimers.delete(seat);
    this.patchSlot(seat, { kind: "AI_BOT", difficulty: "MEDIUM" });
    this.broadcastState();
  }

  public patchSlot(seatIndex: number, patch: Partial<PlayerSlot>): void {
    this.engine.patchPlayer(seatIndex, patch);
    const updatedPlayers = this.engine.state.players;
    if (updatedPlayers && updatedPlayers[seatIndex]) {
      const slot = updatedPlayers[seatIndex];
      this.optionsRef.onSeatUpdate?.(seatIndex, slot, updatedPlayers);
      for (const l of this.seatListeners) l(seatIndex, slot, updatedPlayers);
    }
  }

  private continueListeners = new Set<(seat: number, continuePlay: boolean) => void>();
  /** Continue/stop decision sent by a joined player after GAME_END. */
  public onContinueDecision(cb: (seat: number, continuePlay: boolean) => void): () => void {
    this.continueListeners.add(cb);
    return () => {
      this.continueListeners.delete(cb);
    };
  }

  public destroy(): void {
    if (this.unsubscribeMessages) {
      this.unsubscribeMessages();
      this.unsubscribeMessages = undefined;
    }
    if (this.unsubscribeDisconnect) {
      this.unsubscribeDisconnect();
      this.unsubscribeDisconnect = undefined;
    }
    for (const timer of this.disconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.disconnectTimers.clear();
  }

  private handleClientPacket(playerToken: string, packet: ClientPacket): void {
    if (!packet || typeof packet !== "object" || !packet.type) return;

    // معالجة الرسائل المكررة والتسلسل الزمني لمنع تنفيذ الحركة مرتين
    if (typeof packet.seq === "number") {
      const lastSeq = this.lastProcessedSeq.get(playerToken) ?? 0;
      if (packet.type !== "JOIN" && packet.type !== "PING" && packet.seq <= lastSeq) {
        const senderSeat = this.tokenToSeat.get(playerToken);
        if (senderSeat !== undefined) {
          this.sendFilteredStateToSeat(senderSeat, playerToken);
        }
        return;
      }
      if (packet.type !== "PING") {
        this.lastProcessedSeq.set(playerToken, packet.seq);
      }
    }

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
        const humanSeats = (this.engine.state.players || [])
          .filter((p) => p.kind !== "AI_BOT")
          .map((p) => p.seatIndex);
        if (!canDecideContinue(this.engine.state, seat, humanSeats)) {
          this.sendError(
            playerToken,
            "UNAUTHORIZED_DECISION",
            "Only human players on the losing team may decide continue or stop",
            packet.seq,
          );
          break;
        }
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

    if (this.roomCode) {
      const given = (packet.payload as { roomCode?: string }).roomCode?.trim().toUpperCase();
      if (given !== this.roomCode) {
        this.sendPacket(playerToken, {
          type: "REJECTED",
          payload: {
            reason: "INVALID_ROOM",
            message: "Room code does not match",
          },
        });
        this.sendError(playerToken, "INVALID_ROOM", "Room code does not match", packet.seq);
        return;
      }
    }

    // منع انضمام لاعب جديد إذا كانت المباراة قد بدأت بالفعل (إلا إذا كان إعادة اتصال للاعب سابق)
    if (
      !this.tokenToSeat.has(playerToken) &&
      this.engine.state.phase !== "LOBBY" &&
      this.engine.state.roundNo > 1
    ) {
      this.sendPacket(playerToken, {
        type: "REJECTED",
        payload: {
          reason: "GAME_ALREADY_STARTED",
          message: "Match has already started",
        },
      });
      this.sendError(playerToken, "GAME_ALREADY_STARTED", "Match has already started", packet.seq);
      return;
    }

    // Check if token already assigned
    let assignedSeat = this.tokenToSeat.get(playerToken);

    if (assignedSeat !== undefined) {
      // إعادة اتصال: إلغاء مؤقت تولي الروبوت للمقعد
      const timer = this.disconnectTimers.get(assignedSeat);
      if (timer) {
        clearTimeout(timer);
        this.disconnectTimers.delete(assignedSeat);
      }
    } else {
      // Find open seat (مقعد المضيف محجوز دائماً)
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
      this.sendPacket(playerToken, {
        type: "REJECTED",
        payload: {
          reason: "ROOM_FULL",
          message: "No available seats in this room",
        },
      });
      this.sendError(playerToken, "ROOM_FULL", "No available seats in this room", packet.seq);
      return;
    }

    // Register mapping
    this.tokenToSeat.set(playerToken, assignedSeat);
    this.seatToToken.set(assignedSeat, playerToken);

    // Update player slot in state
    const existingSlot = this.engine.state.players?.[assignedSeat];
    const updatedSlot: PlayerSlot = {
      seatIndex: assignedSeat,
      kind: "HUMAN_REMOTE" as SeatKind,
      name: packet.payload.playerName || existingSlot?.name || `لاعب ${assignedSeat + 1}`,
      team: (assignedSeat % 2) as 0 | 1,
      connected: true,
      playerToken,
    };
    this.patchSlot(assignedSeat, updatedSlot);

    // حماية أمنية: عدم تسريب توكنات اللاعبين الآخرين في SEAT_UPDATE
    const sanitizedPlayers = (this.engine.state.players || []).map((p) => ({
      ...p,
      playerToken: undefined,
    }));
    const sanitizedSlot = {
      ...updatedSlot,
      playerToken: undefined,
    };

    // إرسال تأكيد الانضمام الرسمي والناجح JOIN_ACCEPTED
    this.sendPacket(playerToken, {
      type: "JOIN_ACCEPTED",
      payload: {
        roomCode: this.roomCode || "",
        seatIndex: assignedSeat,
        playerToken,
        player: sanitizedSlot,
        players: sanitizedPlayers,
      },
    });

    // Inform client of assigned seat
    this.sendPacket(playerToken, {
      type: "SEAT_UPDATE",
      payload: {
        seatIndex: assignedSeat,
        player: sanitizedSlot,
        players: sanitizedPlayers,
      },
    });

    // Send individual filtered state snapshot
    this.sendFilteredStateToSeat(assignedSeat);
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

    // Authoritative check: sender seat = current seat
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

    // Authoritative check: only winning bidder can declare trump
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

    // Authoritative check: sender seat = current seat
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
      // اللعب الحر ضد لاعبين بشريين: أي ورقة مسموحة، والغش يُحكم به فقط عبر البلاغ
      this.engine.playCard(senderSeat, packet.payload.cardId, {
        allowAnyCard: this.isFreePlay(),
      });
      this.broadcastState();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.sendError(playerToken, "PLAY_REJECTED", msg, packet.seq);
    }
  }

  /** هل اللعبة ضد لاعبين بشريين (يوجد بشريان أو أكثر)؟ حينها يُفعَّل اللعب الحر. */
  private isFreePlay(): boolean {
    return this.humanSeatCount() >= 2;
  }

  private humanSeatCount(): number {
    const players = this.engine.state.players || [];
    const humans = players.filter((p) => p.kind !== "AI_BOT").length;
    return humans;
  }

  /**
   * بلاغ غش: يتحقق المضيف بيد المُبلَّغ عنه الكاملة وقت اللعب (لديه هو فقط الحقيقة).
   * حد ٣ بلاغات لكل جولة وفاصل ٨ ثوانٍ بين البلاغات لمنع الإساءة.
   */
  private handleCheatReport(
    playerToken: string,
    packet: Extract<ClientPacket, { type: "CHEAT_REPORT" }>,
  ): void {
    const senderSeat = this.tokenToSeat.get(playerToken);
    if (senderSeat === undefined) {
      this.sendError(playerToken, "NOT_JOINED", "Must join before reporting", packet.seq);
      return;
    }

    // مسموح فقط في اللعب الجماعي مع بشريين اثنين أو أكثر
    if (!this.isFreePlay()) {
      this.sendError(
        playerToken,
        "REPORT_REJECTED",
        "Cheat reports are only allowed in multiplayer with 2 or more human players",
        packet.seq,
      );
      return;
    }

    const currentPhase = this.engine.state.phase;
    if (
      currentPhase !== "PLAY" &&
      currentPhase !== "ROUND_END" &&
      !(currentPhase === "GAME_END" && !this.engine.state.matchStopped)
    ) {
      this.sendError(
        playerToken,
        "INVALID_PHASE",
        "Reports are only allowed during play, round end, or game end before final stop",
        packet.seq,
      );
      return;
    }

    if (this.engine.state.matchStopped) {
      this.sendError(
        playerToken,
        "MATCH_STOPPED",
        "Match has concluded",
        packet.seq,
      );
      return;
    }

    const { accusedSeat, cardType } = packet.payload;
    const numSeats = RULES[this.engine.state.variant].seats;
    if (
      typeof accusedSeat !== "number" ||
      accusedSeat < 0 ||
      accusedSeat >= numSeats ||
      accusedSeat === senderSeat
    ) {
      this.sendError(
        playerToken,
        "INVALID_ACCUSED",
        "Invalid accused seat",
        packet.seq,
      );
      return;
    }

    const players = this.engine.state.players || [];
    const senderPlayer =
      players.find((p) => p.seatIndex === senderSeat) ?? players[senderSeat];
    const accusedPlayer =
      players.find((p) => p.seatIndex === accusedSeat) ?? players[accusedSeat];

    // تحقق من أن المُبلِّغ لاعب بشري
    if (!senderPlayer || senderPlayer.kind === "AI_BOT") {
      this.sendError(
        playerToken,
        "REPORT_REJECTED",
        "Reporter must be a human player",
        packet.seq,
      );
      return;
    }

    // تحقق من أن المتهم لاعب بشري وليس بوتاً
    if (!accusedPlayer || accusedPlayer.kind === "AI_BOT") {
      this.sendError(
        playerToken,
        "REPORT_REJECTED",
        "Cannot report an AI bot",
        packet.seq,
      );
      return;
    }

    // رفض البلاغ ضد زميل الفريق
    if (senderPlayer.team === accusedPlayer.team) {
      this.sendError(
        playerToken,
        "REPORT_REJECTED",
        "لا يمكن الإبلاغ عن لاعب في فريقك",
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

    const result = applyCheatVerdict(this.engine.state, senderSeat, accusedSeat, cardType);

    // بلاغ مرفوض: لا يستهلك الحد ولا يبدأ التبريد
    if (!result) {
      this.sendError(
        playerToken,
        "REPORT_REJECTED",
        "البلاغ غير صالح",
        packet.seq,
      );
      return;
    }

    this.lastCheatReportAt = now;
    this.cheatReportsThisRound += 1;

    // تحديث المحرك بالحالة الجديدة بالنقاط المضاعفة
    this.engine = new KoutGameEngine(
      { variant: this.engine.state.variant, targetScore: this.engine.state.targetScore },
      result.nextState,
    );

    // الحكم يوصل لكل اللاعبين
    for (const seat of this.seatToToken.keys()) {
      this.sendPacket(this.seatToToken.get(seat) as string, {
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

    // بث الحالة المحدثة لجميع اللاعبين
    this.broadcastState();
  }

  /**
   * Broadcasts individual filtered snapshots to all connected clients
   */
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
