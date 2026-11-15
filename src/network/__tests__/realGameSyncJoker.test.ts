import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WebSocket as WsClient } from "ws";
import { createRealTestServer, type RealTestServer } from "./testRealWssServer";
import { setHubBridgeForTesting, stopHubServer } from "../gameHub";
import {
  startJokerHost,
  stopJokerHost,
  connectJokerClient,
  disconnectJokerClient,
  getJokerNetClient,
  onJokerHostSeats,
  maskJokerState,
} from "../../joker/jokerNet";
import type { JokerGame } from "../../joker/engine";

if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as any).WebSocket = WsClient;
}

describe("Joker Real WebSocket Sync Integration", () => {
  let server: RealTestServer;
  const roomCode = "99881";

  beforeEach(async () => {
    server = await createRealTestServer();
    setHubBridgeForTesting(server.bridge);
    await startJokerHost(roomCode);
  });

  afterEach(async () => {
    disconnectJokerClient();
    await stopJokerHost();
    await stopHubServer();
    await server.close();
  });

  it("connects Joker client over TCP and receives assigned player ID and seats", async () => {
    let hostSeatsReceived: Record<string, string> = {};
    const unsub = onJokerHostSeats((seats) => {
      hostSeatsReceived = seats;
    });

    const ok = await connectJokerClient({
      code: roomCode,
      name: "فيصل",
      hostIp: `127.0.0.1:${server.port}`,
    });

    expect(ok).toBe(true);
    const client = getJokerNetClient();
    expect(client).toBeDefined();
    expect(client?.code).toBe(roomCode);
    expect(client?.myPid).toBe("p1");

    expect(hostSeatsReceived["p1"]).toBe("فيصل");
    unsub();
  });

  it("strictly enforces Joker secret privacy: hides joker holder and opponent cards", () => {
    const rawState: JokerGame = {
      phase: "play",
      round: 1,
      joker: "p2", // Player 2 has the Joker
      turn: "p1",
      cards: {
        p0: "2C",
        p1: "AH", // Player 1
        p2: "JK", // Player 2 has Joker
      },
      players: [
        { id: "p0", name: "المضيف", isBot: false, score: 0 },
        { id: "p1", name: "فيصل", isBot: false, score: 0 },
        { id: "p2", name: "خالد", isBot: false, score: 0 },
      ],
      history: [],
      eliminated: [],
    };

    // Mask for player 1:
    const masked = maskJokerState(rawState, "p1");

    // Player 1 can see their own card
    expect(masked.cards["p1"]).toBe("AH");

    // Opponent cards must NOT be present
    expect(masked.cards["p0"]).toBeUndefined();
    expect(masked.cards["p2"]).toBeUndefined();

    // Joker holder must be hidden ("")
    expect(masked.joker).toBe("");
  });

  it("preserves player ID on Joker disconnect and reconnect", async () => {
    const ok1 = await connectJokerClient({
      code: roomCode,
      name: "عبدالله",
      hostIp: `127.0.0.1:${server.port}`,
    });
    expect(ok1).toBe(true);
    const pid1 = getJokerNetClient()?.myPid;
    expect(pid1).toBe("p1");

    disconnectJokerClient();
    await new Promise((r) => setTimeout(r, 60));

    const ok2 = await connectJokerClient({
      code: roomCode,
      name: "عبدالله",
      hostIp: `127.0.0.1:${server.port}`,
    });
    expect(ok2).toBe(true);
    const pid2 = getJokerNetClient()?.myPid;
    expect(pid2).toBe(pid1);
  });
});
