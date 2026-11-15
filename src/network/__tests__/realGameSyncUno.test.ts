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
      "room"
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
});
