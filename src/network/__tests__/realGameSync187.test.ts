import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WebSocket as WsClient } from "ws";
import { createRealTestServer, type RealTestServer } from "./testRealWssServer";
import { setHubBridgeForTesting, stopHubServer } from "../gameHub";
import {
  Room187Channel,
  maskGameState187,
  type Client187Packet,
  type Host187Packet,
} from "../../game187/network/network187";
import type { GameState187 } from "../../game187/types";
import { GameEngine187 } from "../../game187/engine";

if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as any).WebSocket = WsClient;
}

describe("187 Real WebSocket Sync Integration", () => {
  let server: RealTestServer;
  const roomCode = "R187X";

  beforeEach(async () => {
    server = await createRealTestServer();
    setHubBridgeForTesting(server.bridge);
  });

  afterEach(async () => {
    await stopHubServer();
    await server.close();
  });

  it("exchanges join, seat assignment, and game start between host and client over TCP without leaking tokens", async () => {
    const host = new Room187Channel(roomCode, "host");
    const client = new Room187Channel(roomCode, "client", `127.0.0.1:${server.port}`);

    const clientReceived: Host187Packet[] = [];
    const hostReceived: Client187Packet[] = [];

    client.onMessage((msg) => {
      clientReceived.push(msg as Host187Packet);
    });

    host.onMessage((msg) => {
      hostReceived.push(msg as Client187Packet);
      if (msg.type === "JOIN") {
        host.send({
          type: "ROOM_SEATS_UPDATE",
          seats: [
            { seatIndex: 0, kind: "HUMAN_LOCAL", name: "المضيف", isHost: true },
            { seatIndex: 1, kind: "REMOTE", name: msg.playerName, clientToken: msg.clientToken },
            null,
            null,
            null,
          ],
        });
      }
    });

    await new Promise((r) => setTimeout(r, 100));

    client.send({
      type: "JOIN",
      playerName: "خالد",
      clientToken: "token_187_client_1",
      roomCode,
    });

    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (clientReceived.some((m) => m.type === "ROOM_SEATS_UPDATE")) {
          clearInterval(check);
          resolve();
        }
      }, 25);
    });

    const seatUpdate = clientReceived.find((m) => m.type === "ROOM_SEATS_UPDATE");
    expect(seatUpdate).toBeDefined();
    if (seatUpdate?.type === "ROOM_SEATS_UPDATE") {
      expect(seatUpdate.seats[1]?.name).toBe("خالد");
      // Privacy check: clientToken must be stripped and never broadcast to other devices!
      expect(seatUpdate.seats[1]?.clientToken).toBeUndefined();
    }

    host.close();
    client.close();
  });

  it("strictly masks opponent hands and other players tokens in 187 game state updates", () => {
    const engine = new GameEngine187({
      players: [
        { seatIndex: 0, kind: "HUMAN_LOCAL", name: "المضيف", isHost: true, clientToken: "tok_0" },
        { seatIndex: 1, kind: "REMOTE", name: "خالد", clientToken: "tok_1" },
        { seatIndex: 2, kind: "REMOTE", name: "فهد", clientToken: "tok_2" },
        { seatIndex: 3, kind: "AI_BOT", name: "بوت3" },
        { seatIndex: 4, kind: "AI_BOT", name: "بوت4" },
      ],
    });
    const rawState: GameState187 = { ...engine.state };
    rawState.phase = "PLAY";
    rawState.hands = [
      [{ id: "h0-1", suit: "D", rank: 14 }], // Seat 0 (Opponent)
      [{ id: "h1-1", suit: "H", rank: 10 }], // Seat 1 (Client)
      [{ id: "h2-1", suit: "C", rank: 12 }], // Seat 2 (Opponent)
      [],
      [],
    ];

    const masked = maskGameState187(rawState, 1);

    // Client seat 1: real card
    expect(masked.hands[1][0].id).toBe("h1-1");
    expect(masked.hands[1][0].suit).toBe("H");
    expect(masked.hands[1][0].rank).toBe(10);

    // Opponent seats 0 and 2: masked dummy cards
    expect(masked.hands[0][0].id).toBe("masked-0-0");
    expect(masked.hands[2][0].id).toBe("masked-2-0");

    // Tokens: recipient keeps their own token, opponent tokens are stripped
    expect(masked.players[1].clientToken).toBe("tok_1");
    expect(masked.players[0].clientToken).toBeUndefined();
    expect(masked.players[2].clientToken).toBeUndefined();
  });

  it("handles host and 2 independent clients over real TCP with authoritative seat validation and spoof prevention", async () => {
    const host = new Room187Channel(roomCode, "host");
    const client1 = new Room187Channel(roomCode, "client", `127.0.0.1:${server.port}`);
    const client2 = new Room187Channel(roomCode, "client", `127.0.0.1:${server.port}`);

    const c1Packets: Host187Packet[] = [];
    const c2Packets: Host187Packet[] = [];
    const hostActions: Client187Packet[] = [];

    client1.onMessage((m) => c1Packets.push(m as Host187Packet));
    client2.onMessage((m) => c2Packets.push(m as Host187Packet));
    host.onMessage((m) => hostActions.push(m as Client187Packet));

    await new Promise((r) => setTimeout(r, 120));

    // Clients join
    client1.send({
      type: "JOIN",
      playerName: "لاعب1",
      clientToken: "tok_client_1",
      roomCode,
    });
    client2.send({
      type: "JOIN",
      playerName: "لاعب2",
      clientToken: "tok_client_2",
      roomCode,
    });

    await new Promise((r) => setTimeout(r, 100));

    // Host starts game and assigns seats
    host.send({
      type: "GAME_START",
      state: {
        roundNo: 1,
        dealer: 0,
        currentSeat: 1,
        hands: [[], [{ id: "c-test", suit: "S", rank: 14 }], [], [], []],
        tableCards: [],
        bids: [],
        passedSeats: [false, false, false, false, false],
        highBid: null,
        bidderSeat: null,
        trump: null,
        currentTrick: [],
        trickHistory: [],
        tricksWon: [0, 0, 0, 0, 0],
        capturedCards: [[], [], [], [], []],
        hakemPoints: 0,
        opponentsPoints: 0,
        earlySettled: false,
        earlySettledWinner: null,
        continueAfterEarlySettle: false,
        phase: "PLAY",
        players: [
          { seatIndex: 0, kind: "HUMAN_LOCAL", name: "المضيف" },
          { seatIndex: 1, kind: "REMOTE", name: "لاعب1", clientToken: "tok_client_1" },
          { seatIndex: 2, kind: "REMOTE", name: "لاعب2", clientToken: "tok_client_2" },
          { seatIndex: 3, kind: "AI_BOT", name: "بوت3" },
          { seatIndex: 4, kind: "AI_BOT", name: "بوت4" },
        ],
        winner: null,
        version: 1,
      },
    });

    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        if (
          c1Packets.some((p) => p.type === "GAME_START") &&
          c2Packets.some((p) => p.type === "GAME_START")
        ) {
          clearInterval(timer);
          resolve();
        }
      }, 25);
    });

    // Client 1 attempts to spoof Seat 2 by sending a card play claiming seat: 2
    client1.send({
      type: "PLAY_CARD",
      seat: 2, // Spoofed! Client 1 is seat 1
      card: { id: "c-test", suit: "S", rank: 14 },
    });

    await new Promise((r) => setTimeout(r, 100));

    // Host must have enforced seat 1 authoritatively
    const playAction = hostActions.find((a) => a.type === "PLAY_CARD") as any;
    expect(playAction).toBeDefined();
    expect(playAction.seat).toBe(1); // Verified: overridden to client 1's authentic seat

    host.close();
    client1.close();
    client2.close();
  });

  it("rejects invalid JOIN with wrong roomCode without dropping or affecting an already connected player sharing that token", async () => {
    const host = new Room187Channel(roomCode, "host");
    const validClient = new Room187Channel(roomCode, "client", `127.0.0.1:${server.port}`);

    const validClientMessages: Host187Packet[] = [];
    const hostActions: Client187Packet[] = [];

    validClient.onMessage((m) => validClientMessages.push(m as Host187Packet));
    host.onMessage((m) => hostActions.push(m as Client187Packet));

    await new Promise((r) => setTimeout(r, 100));

    // Valid client joins
    validClient.send({
      type: "JOIN",
      playerName: "لاعب_أصيل",
      clientToken: "legit_token_187",
      roomCode,
    });

    await new Promise((r) => setTimeout(r, 80));

    // Host establishes match and assigns seat 1 to legit_token_187
    host.send({
      type: "GAME_START",
      state: {
        roundNo: 1,
        dealer: 0,
        currentSeat: 1,
        hands: [[], [{ id: "c-legit", suit: "H", rank: 14 }], [], [], []],
        tableCards: [],
        bids: [],
        passedSeats: [false, false, false, false, false],
        highBid: null,
        bidderSeat: null,
        trump: null,
        currentTrick: [],
        trickHistory: [],
        tricksWon: [0, 0, 0, 0, 0],
        capturedCards: [[], [], [], [], []],
        hakemPoints: 0,
        opponentsPoints: 0,
        earlySettled: false,
        earlySettledWinner: null,
        continueAfterEarlySettle: false,
        phase: "PLAY",
        players: [
          { seatIndex: 0, kind: "HUMAN_LOCAL", name: "المضيف" },
          { seatIndex: 1, kind: "REMOTE", name: "لاعب_أصيل", clientToken: "legit_token_187" },
          { seatIndex: 2, kind: "AI_BOT", name: "بوت2" },
          { seatIndex: 3, kind: "AI_BOT", name: "بوت3" },
          { seatIndex: 4, kind: "AI_BOT", name: "بوت4" },
        ],
        winner: null,
        version: 1,
      },
    });

    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        if (validClientMessages.some((p) => p.type === "GAME_START")) {
          clearInterval(timer);
          resolve();
        }
      }, 25);
    });

    // Now an impostor client connects with the same token but WRONG room code
    const impostorClient = new Room187Channel(
      "WRONG_ROOM_CODE",
      "client",
      `127.0.0.1:${server.port}`,
    );
    const impostorMessages: Host187Packet[] = [];
    impostorClient.onMessage((m) => impostorMessages.push(m as Host187Packet));

    await new Promise((r) => setTimeout(r, 100));

    impostorClient.send({
      type: "JOIN",
      playerName: "منتحل",
      clientToken: "legit_token_187",
      roomCode: "WRONG_ROOM_CODE",
    });

    await new Promise((r) => setTimeout(r, 120));

    // Impostor must receive ERROR
    const errorMsg = impostorMessages.find((m) => m.type === "ERROR");
    expect(errorMsg).toBeDefined();

    // Crucial check: Valid client must NOT be disconnected and still be able to play their card!
    validClient.send({
      type: "PLAY_CARD",
      seat: 1,
      card: { id: "c-legit", suit: "H", rank: 14 },
    });

    await new Promise((r) => setTimeout(r, 100));

    const cardPlayed = hostActions.find((a) => a.type === "PLAY_CARD") as any;
    expect(cardPlayed).toBeDefined();
    expect(cardPlayed.card.id).toBe("c-legit");
    expect(cardPlayed.seat).toBe(1);

    host.close();
    validClient.close();
    impostorClient.close();
  });
});
