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
      cards: {
        p0: "2C",
        p1: "AH", // Player 1
        p2: "JK", // Player 2 has Joker
      },
      players: [
        { id: "p0", name: "المضيف", char: "face1", bot: false, score: 0 },
        { id: "p1", name: "فيصل", char: "face2", bot: false, score: 0 },
        { id: "p2", name: "خالد", char: "face3", bot: false, score: 0 },
      ],
      out: {},
      log: [],
      results: [],
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

  it("coordinates host and 2 independent clients over real TCP with strict secret privacy and seat enforcement", async () => {
    const { LocalClientSocket } = await import("../LocalClientSocket");
    const { jokerHostPublish } = await import("../../joker/jokerNet");

    const c1 = new LocalClientSocket({
      url: `ws://127.0.0.1:${server.port}`,
      channel: "joker",
      roomCode,
      playerToken: "joker_tok_p1",
      playerName: "فيصل",
    });

    const c2 = new LocalClientSocket({
      url: `ws://127.0.0.1:${server.port}`,
      channel: "joker",
      roomCode,
      playerToken: "joker_tok_p2",
      playerName: "سعود",
    });

    const c1Packets: any[] = [];
    const c2Packets: any[] = [];

    c1.onMessage((pkt) => c1Packets.push(pkt));
    c2.onMessage((pkt) => c2Packets.push(pkt));

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
    expect(w1?.pid).toBe("p1");
    expect(w2?.pid).toBe("p2");

    const rawGame: JokerGame = {
      phase: "play",
      round: 1,
      joker: "p2",
      cards: {
        p0: "2C",
        p1: "AH",
        p2: "JK",
      },
      players: [
        { id: "p0", name: "المضيف", char: "face1", bot: false, score: 0 },
        { id: "p1", name: "فيصل", char: "face2", bot: false, score: 0 },
        { id: "p2", name: "سعود", char: "face3", bot: false, score: 0 },
      ],
      out: {},
      log: [],
      results: [],
    };

    jokerHostPublish(rawGame);

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
      c1Packets.filter((p) => p.type === "STATE").pop()?.payload?.game) as JokerGame;
    const s2 = (c2Packets.filter((p) => p.type === "STATE").pop()?.payload?.state ??
      c2Packets.filter((p) => p.type === "STATE").pop()?.payload?.game) as JokerGame;

    // Client 1 sees only own card, opponents' cards hidden, joker holder masked as ""
    expect(s1.cards["p1"]).toBe("AH");
    expect(s1.cards["p0"]).toBeUndefined();
    expect(s1.cards["p2"]).toBeUndefined();
    expect(s1.joker).toBe("");

    // Client 2 sees only own card, opponents' cards hidden, joker holder masked as ""
    expect(s2.cards["p2"]).toBe("JK");
    expect(s2.cards["p0"]).toBeUndefined();
    expect(s2.cards["p1"]).toBeUndefined();
    expect(s2.joker).toBe("p2"); // Player 2 is the joker holder and knows it

    c1.disconnect();
    c2.disconnect();
  });
});
