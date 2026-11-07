import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ensureHubServer,
  registerHubChannel,
  hubSendTo,
  stopHubServer,
  hubIsStarted,
  HUB_PORT,
} from "../gameHub";
import * as wssBridgeModule from "../wssBridge";
import { HostSession } from "../HostSession";
import type { IHostTransport } from "../ITransport";
import type { ClientPacket, HostPacket } from "../protocol";
import { encodeRoomPayload, parseRoomPayload, isValidIpv4 } from "../localIp";

describe("gameHub - Singleton & Concurrent Start", () => {
  beforeEach(() => {
    stopHubServer(true);
    vi.restoreAllMocks();
  });

  it("prevents double start and shares startPromise across concurrent callers", async () => {
    let startCallCount = 0;
    const mockBridge: wssBridgeModule.WssBridge = {
      isNative: true,
      start: vi.fn(async () => {
        startCallCount++;
        await new Promise((r) => setTimeout(r, 20));
        return true;
      }),
      stop: vi.fn(),
      sendTo: vi.fn(),
      broadcast: vi.fn(),
      closeClient: vi.fn(),
      onEvent: vi.fn(() => () => {}),
      getIpAddress: vi.fn(async () => "192.168.43.1"),
      getGatewayIp: vi.fn(async () => "192.168.43.1"),
    };

    vi.spyOn(wssBridgeModule, "tryCreateNativeWssBridge").mockReturnValue(mockBridge);

    // استدعاءان متزامنان
    const [res1, res2] = await Promise.all([ensureHubServer(HUB_PORT), ensureHubServer(HUB_PORT)]);

    expect(res1).toBe(true);
    expect(res2).toBe(true);
    expect(startCallCount).toBe(1);
    expect(hubIsStarted()).toBe(true);
  });

  it("resets state and allows retry if start fails", async () => {
    let shouldFail = true;
    const mockBridge: wssBridgeModule.WssBridge = {
      isNative: true,
      start: vi.fn(async () => {
        if (shouldFail) {
          shouldFail = false;
          return false;
        }
        return true;
      }),
      stop: vi.fn(),
      sendTo: vi.fn(),
      broadcast: vi.fn(),
      closeClient: vi.fn(),
      onEvent: vi.fn(() => () => {}),
      getIpAddress: vi.fn(async () => null),
      getGatewayIp: vi.fn(async () => null),
    };

    vi.spyOn(wssBridgeModule, "tryCreateNativeWssBridge").mockReturnValue(mockBridge);

    const first = await ensureHubServer(HUB_PORT);
    expect(first).toBe(false);
    expect(hubIsStarted()).toBe(false);

    // إعادة المحاولة بعد الفشل
    const second = await ensureHubServer(HUB_PORT);
    expect(second).toBe(true);
    expect(hubIsStarted()).toBe(true);
  });

  it("isolates channels and delivers messages only to the targeted channel", async () => {
    let capturedEvtHandler: ((evt: wssBridgeModule.WssClientEvent) => void) | null = null;
    const mockBridge: wssBridgeModule.WssBridge = {
      isNative: true,
      start: vi.fn(async () => true),
      stop: vi.fn(),
      sendTo: vi.fn(),
      broadcast: vi.fn(),
      closeClient: vi.fn(),
      onEvent: vi.fn((handler) => {
        capturedEvtHandler = handler;
        return () => {};
      }),
      getIpAddress: vi.fn(async () => "192.168.1.10"),
      getGatewayIp: vi.fn(async () => "192.168.1.1"),
    };

    vi.spyOn(wssBridgeModule, "tryCreateNativeWssBridge").mockReturnValue(mockBridge);
    await ensureHubServer(HUB_PORT);

    const koutMessages: any[] = [];
    const unoMessages: any[] = [];

    const unregKout = registerHubChannel("kout", {
      onClientMessage: (clientId, msg) => koutMessages.push({ clientId, msg }),
    });

    const unregUno = registerHubChannel("uno", {
      onClientMessage: (clientId, msg) => unoMessages.push({ clientId, msg }),
    });

    expect(capturedEvtHandler).toBeDefined();

    // رسالة موجهة لقناة كوت
    capturedEvtHandler!({
      type: "CLIENT_MESSAGE",
      clientId: "c1",
      data: { ch: "kout", packet: { type: "PING" } },
    });

    // رسالة موجهة لقناة أونو
    capturedEvtHandler!({
      type: "CLIENT_MESSAGE",
      clientId: "c2",
      data: { ch: "uno", packet: { type: "CARD_PLAY" } },
    });

    expect(koutMessages.length).toBe(1);
    expect(koutMessages[0].clientId).toBe("c1");
    expect(unoMessages.length).toBe(1);
    expect(unoMessages[0].clientId).toBe("c2");

    // إلغاء كوت دون التأثير على أونو
    unregKout();

    capturedEvtHandler!({
      type: "CLIENT_MESSAGE",
      clientId: "c3",
      data: { ch: "kout", packet: { type: "PING" } },
    });

    expect(koutMessages.length).toBe(1); // لم تتغير

    unregUno();
  });
});

describe("HostSession - Reconnection & Disconnect & Authoritative Rules", () => {
  class MockTransport implements IHostTransport {
    public messageHandlers = new Set<(token: string, p: ClientPacket) => void>();
    public disconnectHandlers = new Set<(token: string) => void>();
    public sentPackets: { token: string; packet: HostPacket }[] = [];

    sendToClient(playerToken: string, packet: HostPacket): void {
      this.sentPackets.push({ token: playerToken, packet });
    }
    broadcast(): void {}
    onClientMessage(handler: (token: string, p: ClientPacket) => void): () => void {
      this.messageHandlers.add(handler);
      return () => this.messageHandlers.delete(handler);
    }
    onClientDisconnected(handler: (token: string) => void): () => void {
      this.disconnectHandlers.add(handler);
      return () => this.disconnectHandlers.delete(handler);
    }

    emitMessage(token: string, packet: ClientPacket) {
      for (const h of this.messageHandlers) h(token, packet);
    }
    emitDisconnect(token: string) {
      for (const h of this.disconnectHandlers) h(token);
    }
  }

  it("assigns seat to joining player and reserves host seat 0", () => {
    const transport = new MockTransport();
    const session = new HostSession(transport, { hostSeat: 0, roomCode: "123456" });

    // محاولة الانضمام بدون رمز الغرفة الصحيح تُرفض
    transport.emitMessage("c1", {
      v: 1,
      seq: 1,
      playerToken: "token_p1",
      type: "JOIN",
      payload: { playerName: "سالم", roomCode: "WRONG" },
    });

    const err = transport.sentPackets.find((p) => p.packet.type === "ERROR");
    expect(err).toBeDefined();
    expect((err?.packet.payload as any).code).toBe("INVALID_ROOM");

    // الانضمام بالرمز الصحيح
    transport.emitMessage("c1", {
      v: 1,
      seq: 2,
      playerToken: "token_p1",
      type: "JOIN",
      payload: { playerName: "سالم", roomCode: "123456" },
    });

    const seatUpdate = transport.sentPackets.find(
      (p) => p.token === "c1" && p.packet.type === "SEAT_UPDATE",
    );
    expect(seatUpdate).toBeDefined();
    const assigned = (seatUpdate?.packet.payload as any).seatIndex;
    expect(assigned).toBeGreaterThan(0); // ليس المقعد 0 المخصص للمضيف
    expect(assigned).toBeLessThan(6);
  });

  it("handles player disconnect and preserves seat for reconnection with same token", () => {
    const transport = new MockTransport();
    const session = new HostSession(transport, { hostSeat: 0, roomCode: "ROOM1" });

    transport.emitMessage("conn_1", {
      v: 1,
      seq: 1,
      playerToken: "perm_token_abc",
      type: "JOIN",
      payload: { playerName: "خالد", roomCode: "ROOM1" },
    });

    const firstSeatUpdate = transport.sentPackets.find(
      (p) => p.token === "conn_1" && p.packet.type === "SEAT_UPDATE",
    );
    const assignedSeat = (firstSeatUpdate?.packet.payload as any).seatIndex;
    expect(assignedSeat).toBe(1);

    // محاكاة انقطاع اتصال المقبس conn_1
    transport.emitDisconnect("conn_1");

    // يجب أن تكون حالة المقعد الآن connected: false
    const playerAfterDisconnect = session.state.players?.[assignedSeat];
    expect(playerAfterDisconnect?.connected).toBe(false);

    // محاكاة إعادة اتصال العميل على مقبس جديد conn_2 بنفس perm_token_abc
    transport.emitMessage("conn_2", {
      v: 1,
      seq: 2,
      playerToken: "perm_token_abc",
      type: "JOIN",
      payload: { playerName: "خالد", roomCode: "ROOM1" },
    });

    const secondSeatUpdate = transport.sentPackets
      .reverse()
      .find((p) => p.token === "conn_2" && p.packet.type === "SEAT_UPDATE");
    expect(secondSeatUpdate).toBeDefined();
    expect((secondSeatUpdate?.packet.payload as any).seatIndex).toBe(assignedSeat);

    // تم استعادة الاتصال بالمقعد نفسه
    const playerAfterReconnect = session.state.players?.[assignedSeat];
    expect(playerAfterReconnect?.connected).toBe(true);
  });

  it("masks other seats' hands in filtered state updates", () => {
    const transport = new MockTransport();
    const session = new HostSession(transport, { hostSeat: 0 });

    transport.emitMessage("c1", {
      v: 1,
      seq: 1,
      playerToken: "t1",
      type: "JOIN",
      payload: { playerName: "فهد" },
    });

    session.startRound(42);

    const statePackets = transport.sentPackets.filter(
      (p) => p.packet.type === "CLIENT_STATE_UPDATE",
    );
    const latestStatePacket = statePackets[statePackets.length - 1];
    expect(latestStatePacket).toBeDefined();

    const clientState = (latestStatePacket.packet.payload as any).state;
    const recipientSeat = clientState.mySeat;

    // أوراق اللاعب نفسه مكشوفة ولها قيمة
    for (const card of clientState.hands[recipientSeat]) {
      expect(card.isMasked).toBeUndefined();
      expect(card.id).toBeDefined();
      expect(card.suit !== undefined || card.joker !== undefined).toBe(true);
    }

    // أوراق بقية اللاعبين مقنعة تماماً
    for (let s = 0; s < clientState.hands.length; s++) {
      if (s === recipientSeat) continue;
      for (const card of clientState.hands[s]) {
        expect(card.isMasked).toBe(true);
        expect((card as any).suit).toBeUndefined();
        expect((card as any).joker).toBeUndefined();
      }
    }
  });

  it("rejects play request if not player's turn", () => {
    const transport = new MockTransport();
    const session = new HostSession(transport, { hostSeat: 0 });

    transport.emitMessage("c1", {
      v: 1,
      seq: 1,
      playerToken: "t1",
      type: "JOIN",
      payload: { playerName: "فهد" },
    });

    session.startRound(100);

    // محاولة لعب ورقة قبل مرحلة اللعب أو في غير دوره
    transport.emitMessage("c1", {
      v: 1,
      seq: 2,
      playerToken: "t1",
      type: "PLAY_CARD_REQUEST",
      payload: { cardId: "any_card" },
    });

    const err = transport.sentPackets
      .reverse()
      .find((p) => p.token === "c1" && p.packet.type === "ERROR");
    expect(err).toBeDefined();
  });
});

describe("localIp & QR Payload Encoding", () => {
  it("validates IPv4 addresses correctly", () => {
    expect(isValidIpv4("192.168.1.1")).toBe(true);
    expect(isValidIpv4("10.0.0.1")).toBe(true);
    expect(isValidIpv4("172.16.0.1")).toBe(true);
    expect(isValidIpv4("256.0.0.1")).toBe(false);
    expect(isValidIpv4("abc")).toBe(false);
    expect(isValidIpv4("")).toBe(false);
  });

  it("encodes and parses room payload with port and code", () => {
    const encoded = encodeRoomPayload("192.168.43.1", 8080, "482910");
    expect(encoded).toBe("ws://192.168.43.1:8080?room=482910");

    const parsed = parseRoomPayload(encoded);
    expect(parsed.ip).toBe("192.168.43.1");
    expect(parsed.port).toBe(8080);
    expect(parsed.roomCode).toBe("482910");
  });

  it("parses fallback IP:port format without query", () => {
    const parsed = parseRoomPayload("192.168.1.150:9000");
    expect(parsed.ip).toBe("192.168.1.150");
    expect(parsed.port).toBe(9000);
  });
});
