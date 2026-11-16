import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WebSocket as WsClient } from "ws";
import { createRealTestServer, type RealTestServer } from "./testRealWssServer";
import { setHubBridgeForTesting, stopHubServer } from "../gameHub";
import {
  startUnoHost,
  stopUnoHost,
  connectUnoClient,
  disconnectUnoClient,
  getUnoNetClient,
  onUnoHostSeats,
  maskUnoState,
} from "../../lib/uno/unoNet";
import { newGame, type GameState } from "../../lib/uno/engine";

if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as any).WebSocket = WsClient;
}

describe("UNO Production Multiplayer over Real TCP WebSocket", () => {
  let server: RealTestServer;
  const roomCode = "UN077";

  beforeEach(async () => {
    server = await createRealTestServer();
    setHubBridgeForTesting(server.bridge);
    await startUnoHost(roomCode);
  });

  afterEach(async () => {
    disconnectUnoClient();
    await stopUnoHost();
    await stopHubServer();
    await server.close();
  });

  it("successfully connects UNO client, completes handshake and assigns seat", async () => {
    let hostSeatsReceived: (string | null)[] = [];
    const unsub = onUnoHostSeats((seats) => {
      hostSeatsReceived = seats;
    });

    const ok = await connectUnoClient({
      code: roomCode,
      name: "أحمد",
      hostIp: `127.0.0.1:${server.port}`,
    });

    expect(ok).toBe(true);
    const client = getUnoNetClient();
    expect(client).toBeDefined();
    expect(client?.code).toBe(roomCode);
    expect(client?.mySeat).toBe(1);

    // Host should reflect player on seat 1
    expect(hostSeatsReceived[1]).toBe("أحمد");
    unsub();
  });

  it("strictly enforces UNO privacy: opponents hand cards are masked", () => {
    const dummyState = newGame(
      [
        { name: "المضيف", isBot: false, difficulty: "medium" },
        { name: "أحمد", isBot: false, difficulty: "medium" },
      ],
      "room",
    );
    dummyState.players[0].hand = [{ id: "c1", color: "blue", kind: "number", value: 5 }];
    dummyState.players[1].hand = [{ id: "c2", color: "green", kind: "number", value: 3 }];
    dummyState.drawPile = [{ id: "d1", color: "yellow", kind: "number", value: 1 }];

    // When masked for client seat 1:
    const masked = maskUnoState(dummyState, 1);

    // Client's own cards (seat 1) must be preserved
    expect(masked.players[1].hand[0].color).toBe("green");
    expect(masked.players[1].hand[0].value).toBe(3);

    // Opponent cards (seat 0) must be masked
    expect(masked.players[0].hand[0].id).toBe("__masked__");
    expect(masked.players[1].hand[0].id).toBe("c2");
    expect(masked.drawPile[0].id).toBe("__masked__");
  });

  it("preserves seat on disconnect and reconnect", async () => {
    const ok1 = await connectUnoClient({
      code: roomCode,
      name: "سالم",
      hostIp: `127.0.0.1:${server.port}`,
    });
    expect(ok1).toBe(true);
    const seat1 = getUnoNetClient()?.mySeat;
    expect(seat1).toBe(1);

    // Disconnect client
    disconnectUnoClient();
    await new Promise((r) => setTimeout(r, 60));

    // Reconnect client
    const ok2 = await connectUnoClient({
      code: roomCode,
      name: "سالم",
      hostIp: `127.0.0.1:${server.port}`,
    });
    expect(ok2).toBe(true);
    const seat2 = getUnoNetClient()?.mySeat;
    expect(seat2).toBe(seat1);
  });

  it("coordinates host and 2 independent clients over real TCP with strict wire privacy and seat enforcement", async () => {
    const { LocalClientSocket } = await import("../LocalClientSocket");
    const { unoHostPublish } = await import("../../lib/uno/unoNet");

    const c1 = new LocalClientSocket({
      url: `ws://127.0.0.1:${server.port}`,
      channel: "uno",
      roomCode,
      playerToken: "uno_tok_p1",
      playerName: "لاعب1",
    });

    const c2 = new LocalClientSocket({
      url: `ws://127.0.0.1:${server.port}`,
      channel: "uno",
      roomCode,
      playerToken: "uno_tok_p2",
      playerName: "لاعب2",
    });

    const c1Packets: any[] = [];
    const c2Packets: any[] = [];

    c1.onMessage((pkt) => c1Packets.push(pkt));
    c2.onMessage((pkt) => c2Packets.push(pkt));

    // Wait for both to be assigned seats
    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        if (
          c1Packets.some((p) => p.type === "WELCOME") &&
          c2Packets.some((p) => p.type === "WELCOME")
        ) {
          clearInterval(timer);
          resolve();
        }
      }, 25);
    });

    const w1 = c1Packets.find((p) => p.type === "WELCOME")?.payload;
    const w2 = c2Packets.find((p) => p.type === "WELCOME")?.payload;
    expect(w1?.seat).toBe(1);
    expect(w2?.seat).toBe(2);

    // Host creates and broadcasts a real game state
    const game = newGame(
      [
        { name: "المضيف", isBot: false, difficulty: "medium" },
        { name: "لاعب1", isBot: false, difficulty: "medium" },
        { name: "لاعب2", isBot: false, difficulty: "medium" },
      ],
      "room",
    );
    game.players[0].hand = [{ id: "c0", color: "red", kind: "number", value: 7 }];
    game.players[1].hand = [{ id: "c1", color: "blue", kind: "number", value: 3 }];
    game.players[2].hand = [{ id: "c2", color: "green", kind: "number", value: 9 }];
    game.drawPile = [{ id: "d1", color: "yellow", kind: "number", value: 1 }];

    unoHostPublish(game);

    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        if (
          c1Packets.some((p) => p.type === "STATE") &&
          c2Packets.some((p) => p.type === "STATE")
        ) {
          clearInterval(timer);
          resolve();
        }
      }, 25);
    });

    const s1 = (c1Packets.filter((p) => p.type === "STATE").pop()?.payload?.state ??
      c1Packets.filter((p) => p.type === "STATE").pop()?.payload?.game) as GameState;
    const s2 = (c2Packets.filter((p) => p.type === "STATE").pop()?.payload?.state ??
      c2Packets.filter((p) => p.type === "STATE").pop()?.payload?.game) as GameState;

    // Client 1 sees own cards, opponents masked, draw pile masked
    expect(s1.players[1].hand[0].id).toBe("c1");
    expect(s1.players[0].hand[0].id).toBe("__masked__");
    expect(s1.players[2].hand[0].id).toBe("__masked__");
    expect(s1.drawPile[0].id).toBe("__masked__");

    // Client 2 sees own cards, opponents masked, draw pile masked
    expect(s2.players[2].hand[0].id).toBe("c2");
    expect(s2.players[0].hand[0].id).toBe("__masked__");
    expect(s2.players[1].hand[0].id).toBe("__masked__");
    expect(s2.drawPile[0].id).toBe("__masked__");

    c1.disconnect();
    c2.disconnect();
  });
});
