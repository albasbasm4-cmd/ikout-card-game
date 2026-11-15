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

  it("exchanges join, seat assignment, and game start between host and client over TCP", async () => {
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
        // Host approves join and broadcasts seat update
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

    // Wait for client to connect and send JOIN
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
      expect(seatUpdate.seats[1]?.clientToken).toBe("token_187_client_1");
    }

    host.close();
    client.close();
  });

  it("strictly masks opponent hands in 187 game state updates", () => {
    const rawState: GameState187 = {
      roundNumber: 1,
      phase: "PLAYING",
      dealerSeat: 0,
      bidWinnerSeat: 1,
      highestBid: 70,
      trumpSuit: "H",
      currentSeat: 1,
      leadSuit: null,
      players: [],
      hands: [
        [{ id: "h0-1", suit: "D", rank: 14 }], // Seat 0 (Opponent)
        [{ id: "h1-1", suit: "H", rank: 10 }], // Seat 1 (Client)
        [{ id: "h2-1", suit: "C", rank: 12 }], // Seat 2 (Opponent)
        [],
        [],
      ],
      currentTrick: [],
      tricksWon: [0, 0, 0, 0, 0],
      teamPoints: [0, 0],
      roundScores: [],
      matchScore: [0, 0],
      matchTarget: 187,
      history: [],
      cheatLog: [],
      statusText: "",
    };

    const masked = maskGameState187(rawState, 1);

    // Client seat 1: real card
    expect(masked.hands[1][0].id).toBe("h1-1");
    expect(masked.hands[1][0].suit).toBe("H");
    expect(masked.hands[1][0].rank).toBe(10);

    // Opponent seats 0 and 2: masked
    expect(masked.hands[0][0].id).toBe("masked-0-0");
    expect(masked.hands[2][0].id).toBe("masked-2-0");
  });
});
