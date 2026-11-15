import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WebSocket as WsClient } from "ws";
import { createRealTestServer, type RealTestServer } from "./testRealWssServer";
import { HostSession } from "../HostSession";
import type { IHostTransport } from "../ITransport";
import type { ClientPacket, HostPacket } from "../protocol";

class BridgeHostTransport implements IHostTransport {
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

describe("Real WebSocket TCP Multiplayer Integration", () => {
  let server: RealTestServer;
  let transport: BridgeHostTransport;
  let session: HostSession;
  const roomCode = "982341";

  beforeEach(async () => {
    server = await createRealTestServer();
    transport = new BridgeHostTransport(server.bridge);
    session = new HostSession(transport, {
      variant: "BO4",
      targetScore: 51,
      hostSeat: 0,
      roomCode,
    });
  });

  afterEach(async () => {
    await server.close();
  });

  it("completes full connection, join, seat assignment, and initial state reception over real TCP", async () => {
    const clientWs = new WsClient(`ws://127.0.0.1:${server.port}`);
    const receivedPackets: HostPacket[] = [];

    await new Promise<void>((resolve, reject) => {
      clientWs.on("open", () => {
        clientWs.send(
          JSON.stringify({
            v: 1,
            seq: 1,
            playerToken: "token_p1",
            type: "JOIN",
            payload: { playerName: "أحمد", roomCode },
          }),
        );
      });

      clientWs.on("message", (raw) => {
        const p = JSON.parse(raw.toString()) as HostPacket;
        receivedPackets.push(p);
        if (receivedPackets.length >= 2) {
          resolve();
        }
      });

      clientWs.on("error", reject);
    });

    clientWs.close();

    const seatUpdate = receivedPackets.find((p) => p.type === "SEAT_UPDATE");
    expect(seatUpdate).toBeDefined();
    // Host is seat 0, so remote client gets seat 1
    expect(seatUpdate?.payload).toMatchObject({
      seatIndex: 1,
      player: { name: "أحمد", connected: true },
    });

    const stateUpdate = receivedPackets.find((p) => p.type === "CLIENT_STATE_UPDATE");
    expect(stateUpdate).toBeDefined();
    expect(stateUpdate?.payload.seatIndex).toBe(1);
    expect(stateUpdate?.payload.state.phase).toBeDefined();
  });

  it("prevents duplicate seat assignment and rejects joins beyond maximum room capacity", async () => {
    const clients: WsClient[] = [];

    // BO4 has 4 seats (0 is host, so seats 1, 2, 3 are available for remote clients)
    for (let i = 1; i <= 3; i++) {
      const ws = new WsClient(`ws://127.0.0.1:${server.port}`);
      clients.push(ws);

      await new Promise<void>((resolve, reject) => {
        ws.on("open", () => {
          ws.send(
            JSON.stringify({
              v: 1,
              seq: 1,
              playerToken: `token_p${i}`,
              type: "JOIN",
              payload: { playerName: `لاعب ${i}`, roomCode },
            }),
          );
        });

        ws.on("message", (raw) => {
          const p = JSON.parse(raw.toString()) as HostPacket;
          if (p.type === "SEAT_UPDATE") {
            expect(p.payload.seatIndex).toBe(i);
            resolve();
          }
        });

        ws.on("error", reject);
      });
    }

    // 4th remote client tries to join a full 4-seat room (host is seat 0 + 3 remote = 4)
    const extraWs = new WsClient(`ws://127.0.0.1:${server.port}`);
    clients.push(extraWs);

    const errorPacket = await new Promise<HostPacket>((resolve) => {
      extraWs.on("open", () => {
        extraWs.send(
          JSON.stringify({
            v: 1,
            seq: 1,
            playerToken: "token_p4",
            type: "JOIN",
            payload: { playerName: "لاعب زائد", roomCode },
          }),
        );
      });

      extraWs.on("message", (raw) => {
        const p = JSON.parse(raw.toString()) as HostPacket;
        if (p.type === "ERROR") {
          resolve(p);
        }
      });
    });

    expect(errorPacket.type).toBe("ERROR");
    expect(errorPacket.payload.code).toBe("ROOM_FULL");

    for (const ws of clients) ws.close();
  });

  it("strictly enforces privacy: opponents hands are NOT transmitted to other clients", async () => {
    const p1Ws = new WsClient(`ws://127.0.0.1:${server.port}`);
    const p2Ws = new WsClient(`ws://127.0.0.1:${server.port}`);

    const p1Packets: HostPacket[] = [];
    const p2Packets: HostPacket[] = [];

    await Promise.all([
      new Promise<void>((resolve) => {
        p1Ws.on("open", () => {
          p1Ws.send(
            JSON.stringify({
              v: 1,
              seq: 1,
              playerToken: "token_private_1",
              type: "JOIN",
              payload: { playerName: "سالم", roomCode },
            }),
          );
        });
        p1Ws.on("message", (raw) => {
          p1Packets.push(JSON.parse(raw.toString()));
          if (p1Packets.some((p) => p.type === "CLIENT_STATE_UPDATE")) resolve();
        });
      }),
      new Promise<void>((resolve) => {
        p2Ws.on("open", () => {
          p2Ws.send(
            JSON.stringify({
              v: 1,
              seq: 1,
              playerToken: "token_private_2",
              type: "JOIN",
              payload: { playerName: "طلال", roomCode },
            }),
          );
        });
        p2Ws.on("message", (raw) => {
          p2Packets.push(JSON.parse(raw.toString()));
          if (p2Packets.some((p) => p.type === "CLIENT_STATE_UPDATE")) resolve();
        });
      }),
    ]);

    // Start round to deal cards
    session.startRound();

    // Wait for dealt state update
    await new Promise((r) => setTimeout(r, 60));

    p1Ws.close();
    p2Ws.close();

    const p1States = p1Packets
      .filter((p) => p.type === "CLIENT_STATE_UPDATE")
      .map((p) => p.payload.state);
    const lastP1State = p1States[p1States.length - 1];

    expect(lastP1State).toBeDefined();
    // Seat 1 (p1) must have their own cards fully visible
    expect(Array.isArray(lastP1State.hands[1])).toBe(true);
    expect(lastP1State.hands[1].length).toBeGreaterThan(0);
    expect(lastP1State.hands[1][0]).toHaveProperty("suit");
    expect(lastP1State.hands[1][0]).toHaveProperty("rank");

    // Opponent hands must be completely masked (no suit, no rank)
    expect(lastP1State.hands[0][0]).toEqual({
      id: "masked-0-0",
      isMasked: true,
    });
    expect((lastP1State.hands[0][0] as any).suit).toBeUndefined();
    expect((lastP1State.hands[0][0] as any).rank).toBeUndefined();

    // Verify raw JSON string transmitted to p1 does not contain p2's secret token
    const p1RawStrings = JSON.stringify(p1Packets);
    expect(p1RawStrings.includes("token_private_2")).toBe(false);
  });

  it("handles temporary disconnect and preserves seat on reconnect with persistent token", async () => {
    const token = "persistent_p1";

    // First connection
    const client1 = new WsClient(`ws://127.0.0.1:${server.port}`);
    let seatAssigned = -1;

    await new Promise<void>((resolve) => {
      client1.on("open", () => {
        client1.send(
          JSON.stringify({
            v: 1,
            seq: 1,
            playerToken: token,
            type: "JOIN",
            payload: { playerName: "فهد", roomCode },
          }),
        );
      });
      client1.on("message", (raw) => {
        const p = JSON.parse(raw.toString()) as HostPacket;
        if (p.type === "SEAT_UPDATE") {
          seatAssigned = p.payload.seatIndex;
          resolve();
        }
      });
    });

    expect(seatAssigned).toBe(1);

    // Disconnect client 1
    client1.close();
    await new Promise((r) => setTimeout(r, 60));

    // Reconnect with same persistent token
    const client2 = new WsClient(`ws://127.0.0.1:${server.port}`);
    let reconnectedSeat = -1;

    await new Promise<void>((resolve) => {
      client2.on("open", () => {
        client2.send(
          JSON.stringify({
            v: 1,
            seq: 2,
            playerToken: token,
            type: "JOIN",
            payload: { playerName: "فهد", roomCode },
          }),
        );
      });
      client2.on("message", (raw) => {
        const p = JSON.parse(raw.toString()) as HostPacket;
        if (p.type === "SEAT_UPDATE") {
          reconnectedSeat = p.payload.seatIndex;
          resolve();
        }
      });
    });

    client2.close();

    // Must be granted the exact same seat!
    expect(reconnectedSeat).toBe(seatAssigned);
  });

  it("authoritatively validates moves: rejects out-of-turn play and unknown packets", async () => {
    const clientWs = new WsClient(`ws://127.0.0.1:${server.port}`);
    const errors: HostPacket[] = [];

    await new Promise<void>((resolve) => {
      clientWs.on("open", () => {
        clientWs.send(
          JSON.stringify({
            v: 1,
            seq: 1,
            playerToken: "token_illegal",
            type: "JOIN",
            payload: { playerName: "مخالف", roomCode },
          }),
        );
      });

      clientWs.on("message", (raw) => {
        const p = JSON.parse(raw.toString()) as HostPacket;
        if (p.type === "SEAT_UPDATE") {
          // Send card play during BID phase (illegal)
          clientWs.send(
            JSON.stringify({
              v: 1,
              seq: 2,
              playerToken: "token_illegal",
              type: "PLAY_CARD_REQUEST",
              payload: { cardId: "h-A" },
            }),
          );
        } else if (p.type === "ERROR") {
          errors.push(p);
          resolve();
        }
      });
    });

    clientWs.close();

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].payload.code).toBe("INVALID_PHASE");
  });
});
