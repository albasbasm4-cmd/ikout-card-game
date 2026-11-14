import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handlers: null as null | {
    onClientMessage: (clientId: string, msg: unknown) => void;
    onClientConnected?: (clientId: string) => void;
    onClientDisconnected?: (clientId: string) => void;
  },
  hubSendTo: vi.fn(),
  registerHubChannel: vi.fn(),
}));

vi.mock("./gameHub", () => ({
  ensureHubServer: vi.fn(async () => true),
  registerHubChannel: mocks.registerHubChannel.mockImplementation((_channel, handlers) => {
    mocks.handlers = handlers;
    return vi.fn();
  }),
  hubSendTo: mocks.hubSendTo,
  HUB_PORT: 8080,
}));

import { KoutWssTransport } from "./KoutWssTransport";

describe("KoutWssTransport stable identity", () => {
  beforeEach(() => {
    mocks.handlers = null;
    mocks.hubSendTo.mockClear();
    mocks.registerHubChannel.mockClear();
  });

  it("routes reconnecting sockets by player token and ignores stale disconnects", async () => {
    const transport = new KoutWssTransport();
    expect(await transport.start()).toBe(true);
    const handlers = mocks.handlers;
    expect(handlers).not.toBeNull();

    const messages: string[] = [];
    const disconnects: string[] = [];
    transport.onClientMessage((token) => messages.push(token));
    transport.onClientDisconnected((token) => disconnects.push(token));

    const join = {
      ch: "kout",
      packet: {
        v: 1,
        seq: 1,
        playerToken: "persistent-player-token",
        type: "JOIN",
        payload: { playerName: "Player" },
      },
    };

    handlers!.onClientMessage("socket-old", join);
    handlers!.onClientMessage("socket-new", join);
    expect(messages).toEqual(["persistent-player-token", "persistent-player-token"]);

    handlers!.onClientDisconnected!("socket-old");
    expect(disconnects).toEqual([]);

    const packet = {
      v: 1,
      seq: 2,
      playerToken: "persistent-player-token",
      type: "PONG",
      payload: { timestamp: 1, serverTime: 2 },
    } as never;
    transport.sendToClient("persistent-player-token", packet);
    expect(mocks.hubSendTo).toHaveBeenCalledWith(
      "socket-new",
      { ch: "kout", packet },
    );

    handlers!.onClientDisconnected!("socket-new");
    expect(disconnects).toEqual(["persistent-player-token"]);
    transport.destroy();
  });

  it("rejects messages without a valid JOIN-bound token", async () => {
    const transport = new KoutWssTransport();
    await transport.start();
    const received = vi.fn();
    transport.onClientMessage(received);

    mocks.handlers!.onClientMessage("unknown-socket", {
      ch: "kout",
      packet: { type: "PING", playerToken: "forged-token" },
    });
    expect(received).not.toHaveBeenCalled();
    transport.destroy();
  });
});
