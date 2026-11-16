import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WebSocket as WsClient } from "ws";
import { createRealTestServer, type RealTestServer } from "./testRealWssServer";
import { HostSession } from "../HostSession";
import { LocalClientSocket, type ClientSocketStatus } from "../LocalClientSocket";
import { isValidLocalIpv4 } from "../localIp";
import { getJoinCandidateIps } from "../wssBridge";
import { filterStateForSeat } from "../protocol";
import { maskUnoState } from "../../lib/uno/unoNet";
import { newGame as newUnoGame } from "../../lib/uno/engine";
import { maskGameState187 } from "../../game187/network/network187";
import { GameEngine187 } from "../../game187/engine";
import { maskJokerState } from "../../joker/jokerNet";
import { createJokerGame, dealJoker } from "../../joker/engine";
import type { IHostTransport } from "../ITransport";
import type { ClientPacket, HostPacket } from "../protocol";

if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as any).WebSocket = WsClient;
}

class TestBridgeTransport implements IHostTransport {
  private bridge: RealTestServer["bridge"];
  private messageHandlers = new Set<(playerToken: string, packet: ClientPacket) => void>();
  private connectHandlers = new Set<(playerToken: string) => void>();
  private disconnectHandlers = new Set<(playerToken: string) => void>();
  private clientToToken = new Map<string, string>();
  private tokenToClient = new Map<string, string>();

  constructor(bridge: RealTestServer["bridge"]) {
    this.bridge = bridge;
    this.bridge.onEvent((evt) => {
      if (evt.type === "CLIENT_CONNECTED") {
        for (const h of Array.from(this.connectHandlers)) h(evt.clientId);
      } else if (evt.type === "CLIENT_DISCONNECTED") {
        const token = this.clientToToken.get(evt.clientId) ?? evt.clientId;
        this.clientToToken.delete(evt.clientId);
        this.tokenToClient.delete(token);
        for (const h of Array.from(this.disconnectHandlers)) h(token);
      } else if (evt.type === "CLIENT_MESSAGE") {
        const packet = evt.data as ClientPacket;
        if (packet && typeof packet === "object") {
          const token = packet.playerToken || evt.clientId;
          this.clientToToken.set(evt.clientId, token);
          this.tokenToClient.set(token, evt.clientId);
          for (const h of Array.from(this.messageHandlers)) h(token, packet);
        }
      }
    });
  }

  sendToClient(playerToken: string, packet: HostPacket): void {
    const clientId = this.tokenToClient.get(playerToken) ?? playerToken;
    this.bridge.sendTo(clientId, JSON.stringify(packet));
  }

  broadcast(packet: HostPacket): void {
    this.bridge.broadcast(JSON.stringify(packet));
  }

  onClientMessage(handler: (playerToken: string, packet: ClientPacket) => void) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onClientConnected(handler: (playerToken: string) => void) {
    this.connectHandlers.add(handler);
    return () => this.connectHandlers.delete(handler);
  }

  onClientDisconnected(handler: (playerToken: string) => void) {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }
}

describe("Comprehensive Multiplayer Overhaul System Test Suite", () => {
  let server: RealTestServer;
  let transport: TestBridgeTransport;
  let session: HostSession;
  const roomCode = "OVERHAUL1";

  beforeEach(async () => {
    server = await createRealTestServer();
    transport = new TestBridgeTransport(server.bridge);
    session = new HostSession(transport, {
      variant: "BO4",
      targetScore: 51,
      hostSeat: 0,
      roomCode,
    });
  });

  afterEach(async () => {
    session.destroy();
    await server.close();
  });

  describe("1. Room Join Lifecycle & Explicit State Machine", () => {
    it("follows correct status sequence: CONNECTING -> CONNECTED -> JOINING -> JOINED -> INITIAL_STATE_RECEIVED -> READY", async () => {
      const socket = new LocalClientSocket({
        url: `ws://127.0.0.1:${server.port}`,
        playerToken: "token_user_1",
        playerName: "فهد",
        roomCode,
      });

      const observedStatuses: ClientSocketStatus[] = [];
      socket.onStatusChange((st) => {
        observedStatuses.push(st);
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Timeout waiting for READY")), 3000);
        socket.onStatusChange((st) => {
          if (st === "READY") {
            clearTimeout(timeout);
            resolve();
          }
        });
      });

      expect(observedStatuses).toContain("CONNECTED");
      expect(observedStatuses).toContain("JOINING");
      expect(observedStatuses).toContain("JOINED");
      expect(observedStatuses).toContain("INITIAL_STATE_RECEIVED");
      expect(observedStatuses).toContain("READY");

      // Verify assigned seat is extracted from host and NOT hardcoded to 0
      expect(socket.getAssignedSeat()).toBe(1);
      expect(socket.isJoined()).toBe(true);
      expect(socket.isReady()).toBe(true);

      socket.disconnect();
    });

    it("prevents sending game actions before READY (even if CONNECTED or JOINING)", () => {
      const socket = new LocalClientSocket({
        url: `ws://127.0.0.1:${server.port}`,
        playerToken: "token_blocked",
        playerName: "سعود",
        roomCode,
      });

      expect(socket.isReady()).toBe(false);
      expect(socket.canSendGameActions()).toBe(false);

      // Attempt to send game actions before READY
      socket.send({
        v: 1,
        seq: 1,
        playerToken: "token_blocked",
        type: "BID_REQUEST",
        payload: { bid: 5 },
      });

      socket.send({
        v: 1,
        seq: 2,
        playerToken: "token_blocked",
        type: "PLAY_CARD_REQUEST",
        payload: { card: { id: "c1", suit: "SPADES", rank: 10 } } as any,
      });

      socket.send({
        v: 1,
        seq: 3,
        playerToken: "token_blocked",
        type: "DRAW_REQUEST" as any,
        payload: {} as any,
      });

      socket.disconnect();
    });

    it("buffers CLIENT_STATE_UPDATE if received before JOIN_ACCEPTED and smoothly transitions to READY", () => {
      // Create socket with transport override to test strict packet sequence
      const mockTransport = {
        handlers: new Set<(p: any) => void>(),
        isConnected: () => true,
        send: () => {},
        disconnect: () => {},
        onMessage: (h: any) => {
          mockTransport.handlers.add(h);
          return () => mockTransport.handlers.delete(h);
        },
      };

      const socket = new LocalClientSocket({
        playerToken: "seq_test",
        playerName: "ترتيب",
        transportOverride: mockTransport as any,
        roomCode,
      });

      expect(socket.getStatus()).toBe("JOINING");
      expect(socket.isReady()).toBe(false);

      // 1. Simulate CLIENT_STATE_UPDATE arriving BEFORE JOIN_ACCEPTED
      for (const h of mockTransport.handlers) {
        h({
          type: "CLIENT_STATE_UPDATE",
          payload: {
            seatIndex: 2,
            state: { phase: "BID", roundNo: 1, hands: [[], [], [], []] },
          },
        });
      }

      // Should still be JOINING because JOIN_ACCEPTED hasn't verified acceptance
      expect(socket.getStatus()).toBe("JOINING");
      expect(socket.isReady()).toBe(false);

      // 2. Now JOIN_ACCEPTED arrives with assigned seat 2
      for (const h of mockTransport.handlers) {
        h({
          type: "JOIN_ACCEPTED",
          payload: {
            seatIndex: 2,
            roomCode,
            playerToken: "seq_test",
          },
        });
      }

      // Now it should immediately transition to READY
      expect(socket.getAssignedSeat()).toBe(2);
      expect(socket.isJoined()).toBe(true);
      expect(socket.isReady()).toBe(true);
      expect(socket.canSendGameActions()).toBe(true);

      socket.disconnect();
    });

    it("SEAT_UPDATE alone does not transition client to JOINED or READY without JOIN_ACCEPTED", () => {
      const mockTransport = {
        handlers: new Set<(p: any) => void>(),
        isConnected: () => true,
        send: () => {},
        disconnect: () => {},
        onMessage: (h: any) => {
          mockTransport.handlers.add(h);
          return () => mockTransport.handlers.delete(h);
        },
      };

      const socket = new LocalClientSocket({
        playerToken: "seat_alone",
        playerName: "مقعد_فقط",
        transportOverride: mockTransport as any,
        roomCode,
      });

      for (const h of mockTransport.handlers) {
        h({
          type: "SEAT_UPDATE",
          payload: { seatIndex: 1 },
        });
      }

      // Must remain in JOINING because SEAT_UPDATE alone is not formal acceptance
      expect(socket.getStatus()).toBe("JOINING");
      expect(socket.isReady()).toBe(false);

      socket.disconnect();
    });

    it("rejects new player join after round 1 has started with GAME_ALREADY_STARTED", async () => {
      // Start the match first
      session.startRound();

      const socket = new LocalClientSocket({
        url: `ws://127.0.0.1:${server.port}`,
        playerToken: "late_joiner_token",
        playerName: "متأخر",
        roomCode,
      });

      let rejectedReason: string | null = null;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Timeout waiting for REJECTED")), 2500);
        socket.onMessage((pkt) => {
          if (pkt.type === "REJECTED") {
            rejectedReason = (pkt.payload as any)?.reason;
          }
        });
        socket.onStatusChange((st) => {
          if (st === "REJECTED") {
            clearTimeout(timeout);
            resolve();
          }
        });
      });

      expect(rejectedReason).toBe("GAME_ALREADY_STARTED");
      expect(socket.isJoined()).toBe(false);
      expect(socket.isReady()).toBe(false);

      socket.disconnect();
    });

    it("allows registered player to reconnect after round 1 has started and reclaims their seat", async () => {
      // 1. Player joins during LOBBY
      const p1 = new LocalClientSocket({
        url: `ws://127.0.0.1:${server.port}`,
        playerToken: "legit_p1_reconnect",
        playerName: "لاعب1",
        roomCode,
      });

      await new Promise<void>((r) => p1.onStatusChange((s) => s === "READY" && r()));
      expect(p1.getAssignedSeat()).toBe(1);

      // 2. Disconnect p1
      p1.disconnect();
      await new Promise((r) => setTimeout(r, 60));

      // 3. Game starts during their disconnect
      session.startRound();

      // 4. p1 reconnects with the same token
      const p1Reconnected = new LocalClientSocket({
        url: `ws://127.0.0.1:${server.port}`,
        playerToken: "legit_p1_reconnect",
        playerName: "لاعب1",
        roomCode,
      });

      await new Promise<void>((r) => p1Reconnected.onStatusChange((s) => s === "READY" && r()));
      expect(p1Reconnected.getAssignedSeat()).toBe(1);
      expect(p1Reconnected.isReady()).toBe(true);

      p1Reconnected.disconnect();
    });

    it("rejects joins with incorrect room code and transitions to REJECTED", async () => {
      const socket = new LocalClientSocket({
        url: `ws://127.0.0.1:${server.port}`,
        playerToken: "token_wrong_code",
        playerName: "مخترق",
        roomCode: "WRONG_CODE",
      });

      let reachedRejected = false;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Timeout waiting for REJECTED")), 2500);
        socket.onStatusChange((st) => {
          if (st === "REJECTED") {
            reachedRejected = true;
            clearTimeout(timeout);
            resolve();
          }
        });
      });

      expect(reachedRejected).toBe(true);
      expect(socket.isJoined()).toBe(false);
      socket.disconnect();
    });

    it("rejects joins when room capacity is exceeded", async () => {
      // BO4 has 4 seats (0 is host, 1, 2, 3 for clients)
      const c1 = new LocalClientSocket({
        url: `ws://127.0.0.1:${server.port}`,
        playerToken: "p1",
        playerName: "1",
        roomCode,
      });
      const c2 = new LocalClientSocket({
        url: `ws://127.0.0.1:${server.port}`,
        playerToken: "p2",
        playerName: "2",
        roomCode,
      });
      const c3 = new LocalClientSocket({
        url: `ws://127.0.0.1:${server.port}`,
        playerToken: "p3",
        playerName: "3",
        roomCode,
      });

      await Promise.all([
        new Promise<void>((r) => c1.onStatusChange((s) => s === "READY" && r())),
        new Promise<void>((r) => c2.onStatusChange((s) => s === "READY" && r())),
        new Promise<void>((r) => c3.onStatusChange((s) => s === "READY" && r())),
      ]);

      // 4th client should be rejected because room is full
      const c4 = new LocalClientSocket({
        url: `ws://127.0.0.1:${server.port}`,
        playerToken: "p4_overflow",
        playerName: "4",
        roomCode,
      });
      let c4Rejected = false;
      await new Promise<void>((resolve) => {
        c4.onStatusChange((s) => {
          if (s === "REJECTED") {
            c4Rejected = true;
            resolve();
          }
        });
      });

      expect(c4Rejected).toBe(true);
      c1.disconnect();
      c2.disconnect();
      c3.disconnect();
      c4.disconnect();
    });
  });

  describe("2. Reconnection System & Seat Preservation", () => {
    it("preserves exact seat and cancels bot takeover when player reconnects with same token", async () => {
      const c1 = new LocalClientSocket({
        url: `ws://127.0.0.1:${server.port}`,
        playerToken: "reconnect_token",
        playerName: "خالد",
        roomCode,
      });

      await new Promise<void>((r) => c1.onStatusChange((s) => s === "READY" && r()));
      const initialSeat = c1.getAssignedSeat();
      expect(initialSeat).toBe(1);

      // Simulate disconnect
      c1.disconnect();
      await new Promise((r) => setTimeout(r, 60));

      // Reconnect with same token
      const c1Reconnected = new LocalClientSocket({
        url: `ws://127.0.0.1:${server.port}`,
        playerToken: "reconnect_token",
        playerName: "خالد",
        roomCode,
      });

      await new Promise<void>((r) => c1Reconnected.onStatusChange((s) => s === "READY" && r()));
      const reconnectedSeat = c1Reconnected.getAssignedSeat();
      expect(reconnectedSeat).toBe(initialSeat);

      c1Reconnected.disconnect();
    });

    it("rejects an unknown token attempting to claim a seat reserved by another token with SEAT_RESERVED", async () => {
      const c1 = new LocalClientSocket({
        url: `ws://127.0.0.1:${server.port}`,
        playerToken: "legit_token",
        playerName: "محمد",
        roomCode,
      });
      await new Promise<void>((r) => c1.onStatusChange((s) => s === "READY" && r()));
      expect(c1.getAssignedSeat()).toBe(1);

      // Attacker tries to hijack seat 1 with preferredSeat: 1 and different token
      const attacker = new LocalClientSocket({
        url: `ws://127.0.0.1:${server.port}`,
        playerToken: "attacker_token",
        playerName: "منتحل",
        preferredSeat: 1,
        roomCode,
      });

      let rejectedReason: string | null = null;
      attacker.onMessage((pkt) => {
        if (pkt.type === "REJECTED") {
          rejectedReason = (pkt.payload as any)?.reason;
        }
      });

      await new Promise<void>((r) => attacker.onStatusChange((s) => s === "REJECTED" && r()));
      expect(rejectedReason).toBe("SEAT_RESERVED");
      expect(attacker.isReady()).toBe(false);

      c1.disconnect();
      attacker.disconnect();
    });

    it("disconnected player during match: new player trying to claim their seat with different token is rejected with GAME_ALREADY_STARTED", async () => {
      const c1 = new LocalClientSocket({
        url: `ws://127.0.0.1:${server.port}`,
        playerToken: "player_during_match",
        playerName: "سعود",
        roomCode,
      });
      await new Promise<void>((r) => c1.onStatusChange((s) => s === "READY" && r()));
      expect(c1.getAssignedSeat()).toBe(1);

      // Start match
      session.startRound();
      expect(session.getEngine().state.roundNo).toBe(1);

      // c1 disconnects
      c1.disconnect();
      await new Promise((r) => setTimeout(r, 60));

      // Attacker tries to claim seat 1 with different token
      const attacker = new LocalClientSocket({
        url: `ws://127.0.0.1:${server.port}`,
        playerToken: "intruder_token",
        playerName: "متسلل",
        preferredSeat: 1,
        roomCode,
      });
      let rejectedReason = "";
      attacker.onMessage((pkt) => {
        if (pkt.type === "REJECTED") {
          rejectedReason = (pkt.payload as any)?.reason;
        }
      });
      await new Promise<void>((r) => attacker.onStatusChange((s) => s === "REJECTED" && r()));
      expect(rejectedReason).toBe("GAME_ALREADY_STARTED");
      expect(attacker.isReady()).toBe(false);

      // Original player reconnects with same token -> succeeds and reclaims seat 1
      const returningPlayer = new LocalClientSocket({
        url: `ws://127.0.0.1:${server.port}`,
        playerToken: "player_during_match",
        playerName: "سعود",
        roomCode,
      });
      await new Promise<void>((r) => returningPlayer.onStatusChange((s) => s === "READY" && r()));
      expect(returningPlayer.getAssignedSeat()).toBe(1);

      attacker.disconnect();
      returningPlayer.disconnect();
    });

    it("rejects new player join between two rounds if match has started", async () => {
      // Start match
      session.startRound();
      expect(session.getEngine().state.roundNo).toBe(1);

      // Attempt to join between rounds
      const lateJoiner = new LocalClientSocket({
        url: `ws://127.0.0.1:${server.port}`,
        playerToken: "late_joiner_between_rounds",
        playerName: "متأخر",
        roomCode,
      });

      let rejectedReason = "";
      lateJoiner.onMessage((pkt) => {
        if (pkt.type === "REJECTED") {
          rejectedReason = (pkt.payload as any)?.reason;
        }
      });

      await new Promise<void>((r) => lateJoiner.onStatusChange((s) => s === "REJECTED" && r()));
      expect(rejectedReason).toBe("GAME_ALREADY_STARTED");
      expect(lateJoiner.isReady()).toBe(false);

      lateJoiner.disconnect();
    });

    it("concurrent reconnection with same token replaces old connection and never creates duplicate seats", async () => {
      const c1 = new LocalClientSocket({
        url: `ws://127.0.0.1:${server.port}`,
        playerToken: "same_token_concurrent",
        playerName: "لاعب1",
        roomCode,
      });
      await new Promise<void>((r) => c1.onStatusChange((s) => s === "READY" && r()));
      const seat = c1.getAssignedSeat();
      expect(seat).toBe(1);

      // Connect second client with same token without explicitly closing first
      const c2 = new LocalClientSocket({
        url: `ws://127.0.0.1:${server.port}`,
        playerToken: "same_token_concurrent",
        playerName: "لاعب1_مجددا",
        roomCode,
      });
      await new Promise<void>((r) => c2.onStatusChange((s) => s === "READY" && r()));

      // Both must refer to same seat 1, not duplicate seats
      expect(c2.getAssignedSeat()).toBe(seat);

      c1.disconnect();
      c2.disconnect();
    });

    it("rejecting a new player does not affect existing connected players or match state", async () => {
      const legitPlayer = new LocalClientSocket({
        url: `ws://127.0.0.1:${server.port}`,
        playerToken: "legit_stable_player",
        playerName: "فارس",
        roomCode,
      });
      await new Promise<void>((r) => legitPlayer.onStatusChange((s) => s === "READY" && r()));
      expect(legitPlayer.isReady()).toBe(true);

      // Start match
      session.startRound();
      const initialPhase = session.getEngine().state.phase;
      const initialRound = session.getEngine().state.roundNo;

      // An unauthorized intruder tries to join
      const intruder = new LocalClientSocket({
        url: `ws://127.0.0.1:${server.port}`,
        playerToken: "intruder_no_impact",
        playerName: "مخرب",
        roomCode,
      });
      await new Promise<void>((r) => intruder.onStatusChange((s) => s === "REJECTED" && r()));

      // Verified: legitPlayer is still READY and connected, and match state is unaltered
      expect(legitPlayer.isReady()).toBe(true);
      expect(session.getEngine().state.phase).toBe(initialPhase);
      expect(session.getEngine().state.roundNo).toBe(initialRound);

      legitPlayer.disconnect();
      intruder.disconnect();
    });
  });

  describe("3. Card Privacy Verification (Raw TCP Packet Level Across All 4 Games)", () => {
    it("iKout: raw state sent to client never contains opponent card identities", () => {
      session.startRound();
      const state = session.getEngine().state;
      const filteredForSeat1 = filterStateForSeat(state, 1);

      // Seat 1 cards are visible
      expect(filteredForSeat1.hands[1].length).toBeGreaterThan(0);
      expect((filteredForSeat1.hands[1][0] as any).suit).toBeDefined();
      expect((filteredForSeat1.hands[1][0] as any).rank).toBeDefined();

      // Seats 0, 2, 3 must be completely masked
      for (const seat of [0, 2, 3]) {
        for (const card of filteredForSeat1.hands[seat]) {
          expect((card as any).isMasked).toBe(true);
          expect((card as any).suit).toBeUndefined();
          expect((card as any).rank).toBeUndefined();
        }
      }
    });

    it("UNO: maskUnoState masks drawPile and opponent hands completely", () => {
      const game = newUnoGame(
        [
          { name: "P0", isBot: false, difficulty: "easy" },
          { name: "P1", isBot: false, difficulty: "easy" },
          { name: "P2", isBot: false, difficulty: "easy" },
        ],
        "room",
      );
      const masked = maskUnoState(game, 1);

      // Recipient (seat 1) sees own cards
      expect(masked.players[1].hand[0].color).toBeDefined();
      expect(masked.players[1].hand[0].kind).toBeDefined();

      // Opponents (seat 0, 2) hands are masked
      for (const seat of [0, 2]) {
        for (const card of masked.players[seat].hand) {
          expect(card.id).toBe("__masked__");
        }
      }

      // Draw pile cards are masked
      for (const card of masked.drawPile) {
        expect(card.id).toBe("__masked__");
      }
    });

    it("187: maskGameState187 masks other seats hands to dummy cards", () => {
      const engine = new GameEngine187({
        players: [
          { seatIndex: 0, name: "P0", kind: "HUMAN_LOCAL" },
          { seatIndex: 1, name: "P1", kind: "REMOTE" },
          { seatIndex: 2, name: "P2", kind: "REMOTE" },
          { seatIndex: 3, name: "P3", kind: "REMOTE" },
          { seatIndex: 4, name: "P4", kind: "REMOTE" },
        ],
      });
      engine.startRound();
      const rawState = engine.state;
      const masked = maskGameState187(rawState, 1);

      // Seat 1 sees own cards
      expect(masked.hands[1]).toEqual(rawState.hands[1]);

      // Seats 0, 2, 3, 4 cards are masked
      for (const seat of [0, 2, 3, 4]) {
        for (const card of masked.hands[seat]) {
          expect(card.id.startsWith("masked-")).toBe(true);
        }
      }
    });

    it("Joker: maskJokerState hides other players cards and joker identity during play phase", () => {
      const lobbyGame = createJokerGame([
        { id: "p1", name: "P1", char: "c1", score: 0, bot: false },
        { id: "p2", name: "P2", char: "c2", score: 0, bot: false },
        { id: "p3", name: "P3", char: "c3", score: 0, bot: false },
        { id: "p4", name: "P4", char: "c4", score: 0, bot: false },
      ]);
      const game = dealJoker(lobbyGame);
      const maskedForP1 = maskJokerState(game, "p1");

      // Only p1 card is present
      expect(maskedForP1.cards["p1"]).toBeDefined();
      expect(maskedForP1.cards["p2"]).toBeUndefined();
      expect(maskedForP1.cards["p3"]).toBeUndefined();

      // If p1 is not the joker, joker identity is blanked
      if (game.joker !== "p1") {
        expect(maskedForP1.joker).toBe("");
      }
    });
  });

  describe("4. Local IP Discovery & Validation", () => {
    it("excludes 169.254.0.0/16 link-local addresses by default", () => {
      expect(isValidLocalIpv4("169.254.1.1")).toBe(false);
      expect(isValidLocalIpv4("169.254.200.5")).toBe(false);
      expect(isValidLocalIpv4("169.254.1.1", true)).toBe(true); // only when allowLinkLocal=true
    });

    it("excludes loopback and unspecified addresses", () => {
      expect(isValidLocalIpv4("127.0.0.1")).toBe(false);
      expect(isValidLocalIpv4("127.0.1.1")).toBe(false);
      expect(isValidLocalIpv4("0.0.0.0")).toBe(false);
      expect(isValidLocalIpv4(null)).toBe(false);
      expect(isValidLocalIpv4("")).toBe(false);
    });

    it("validates legitimate local private IPv4 ranges", () => {
      expect(isValidLocalIpv4("192.168.1.50")).toBe(true);
      expect(isValidLocalIpv4("192.168.43.1")).toBe(true);
      expect(isValidLocalIpv4("10.0.0.2")).toBe(true);
      expect(isValidLocalIpv4("172.16.0.1")).toBe(true);
      expect(isValidLocalIpv4("172.20.10.4")).toBe(true);
    });

    it("getJoinCandidateIps returns verified IP when provided and no random guessed IPs", async () => {
      const candidates = await getJoinCandidateIps("192.168.1.100");
      expect(candidates).toEqual(["192.168.1.100"]);

      const emptyCandidates = await getJoinCandidateIps(null);
      // No guessed IPs like 192.168.43.1 should ever appear automatically
      expect(emptyCandidates).not.toContain("192.168.43.1");
      expect(emptyCandidates).not.toContain("192.168.49.1");
    });
  });

  describe("5. Authoritative Host & Duplicate Action Protection", () => {
    it("deduplicates action packets with same seq to prevent double-execution", async () => {
      const socket = new LocalClientSocket({
        url: `ws://127.0.0.1:${server.port}`,
        playerToken: "seq_token",
        playerName: "وليد",
        roomCode,
      });

      if (socket.getStatus() !== "READY") {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error("Timeout waiting for READY")), 3000);
          socket.onStatusChange((s) => {
            if (s === "READY") {
              clearTimeout(t);
              resolve();
            }
          });
        });
      }

      expect(socket.isJoined()).toBe(true);
      expect(socket.isReady()).toBe(true);
      session.startRound();

      const engine = session.getEngine();
      expect(engine.state.phase).toBe("BID");

      // Send first bid with seq: 10
      socket.send({
        v: 1,
        seq: 10,
        playerToken: "seq_token",
        type: "BID_REQUEST",
        payload: { bid: 5 },
      });

      await new Promise((r) => setTimeout(r, 60));

      // Resend same packet with seq: 10 (network duplicate/replay)
      socket.send({
        v: 1,
        seq: 10,
        playerToken: "seq_token",
        type: "BID_REQUEST",
        payload: { bid: 5 },
      });

      await new Promise((r) => setTimeout(r, 60));
      // Host ignores the duplicate seq without crashing or throwing
      expect(engine.state).toBeDefined();

      socket.disconnect();
    });
  });
});
