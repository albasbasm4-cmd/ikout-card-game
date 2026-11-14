import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state: { eventHandler: ((event: any) => void) | null } = { eventHandler: null };
  const bridge = {
    isNative: true,
    start: vi.fn(async () => true),
    stop: vi.fn(),
    sendTo: vi.fn(),
    broadcast: vi.fn(),
    closeClient: vi.fn(),
    onEvent: vi.fn((handler: (event: any) => void) => {
      state.eventHandler = handler;
      return vi.fn();
    }),
    getIpAddress: vi.fn(async () => null),
    getGatewayIp: vi.fn(async () => null),
  };
  return { state, bridge };
});

vi.mock("./wssBridge", () => ({
  tryCreateNativeWssBridge: () => mocks.bridge,
}));

import { ensureHubServer, hubSendTo, registerHubChannel } from "./gameHub";

describe("gameHub stable player routing", () => {
  it("routes all channels and disconnect events by persistent player token", async () => {
    expect(await ensureHubServer()).toBe(true);
    const messages: string[] = [];
    const disconnects: string[] = [];
    registerHubChannel("uno", {
      onClientMessage: (identity) => messages.push(identity),
      onClientDisconnected: (identity) => disconnects.push(identity),
    });

    const emit = mocks.state.eventHandler;
    expect(emit).toBeTypeOf("function");

    emit!({
      type: "CLIENT_MESSAGE",
      clientId: "socket-before",
      data: {
        ch: "uno",
        packet: { type: "JOIN", playerToken: "stable-device-token" },
      },
    });
    emit!({
      type: "CLIENT_MESSAGE",
      clientId: "socket-before",
      data: { ch: "uno", packet: { type: "HELLO", payload: { roomCode: "ABCD" } } },
    });
    expect(messages).toEqual(["stable-device-token", "stable-device-token"]);

    // A replacement socket takes over the identity. A late close from the old
    // socket must not mark the newly connected player as disconnected.
    emit!({
      type: "CLIENT_MESSAGE",
      clientId: "socket-after",
      data: {
        ch: "uno",
        packet: { type: "JOIN", playerToken: "stable-device-token" },
      },
    });
    emit!({ type: "CLIENT_DISCONNECTED", clientId: "socket-before" });
    expect(disconnects).toEqual([]);

    hubSendTo("stable-device-token", { ch: "uno", packet: { type: "PING" } });
    expect(mocks.bridge.sendTo).toHaveBeenCalledWith(
      "socket-after",
      JSON.stringify({ ch: "uno", packet: { type: "PING" } }),
    );

    emit!({ type: "CLIENT_DISCONNECTED", clientId: "socket-after" });
    expect(disconnects).toEqual(["stable-device-token"]);
  });
});
