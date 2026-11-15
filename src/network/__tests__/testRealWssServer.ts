/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * خادم WebSocket حقيقي عبر TCP (باستخدام مكتبة ws وخادم http لـ Node.js)
 * لاختبارات التكامل الحقيقية للشبكة واللعب الجماعي بدون أي محاكاة وهمية.
 */

import http from "http";
import { WebSocketServer, WebSocket as WsClient } from "ws";
import type { WssBridge, WssClientEvent } from "../wssBridge";

export interface RealTestServer {
  bridge: WssBridge;
  port: number;
  close: () => Promise<void>;
}

export async function createRealTestServer(): Promise<RealTestServer> {
  const server = http.createServer();
  const wss = new WebSocketServer({ server });
  const clients = new Map<string, any>();
  const handlers = new Set<(evt: WssClientEvent) => void>();
  let nextId = 1;
  let isDestroyed = false;

  wss.on("connection", (ws: any) => {
    if (isDestroyed) {
      ws.close();
      return;
    }
    const id = `c_${nextId++}`;
    clients.set(id, ws);
    for (const h of Array.from(handlers)) {
      h({ type: "CLIENT_CONNECTED", clientId: id });
    }

    ws.on("message", (raw: any) => {
      if (isDestroyed) return;
      let data: any = raw.toString();
      try {
        data = JSON.parse(data);
      } catch {
        /* pass raw */
      }
      for (const h of Array.from(handlers)) {
        h({ type: "CLIENT_MESSAGE", clientId: id, data });
      }
    });

    ws.on("close", () => {
      clients.delete(id);
      if (isDestroyed) return;
      for (const h of Array.from(handlers)) {
        h({ type: "CLIENT_DISCONNECTED", clientId: id });
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as any).port;

  const bridge: WssBridge = {
    get isNative() {
      return false;
    },
    get isDestroyed() {
      return isDestroyed;
    },
    async start() {
      return true;
    },
    async stop() {
      if (isDestroyed) return;
      isDestroyed = true;
      for (const ws of clients.values()) {
        try {
          ws.close();
        } catch {
          /* noop */
        }
      }
      clients.clear();
      handlers.clear();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
    sendTo(clientId, message) {
      if (isDestroyed) return;
      const ws = clients.get(clientId);
      if (ws && ws.readyState === WsClient.OPEN) {
        ws.send(message);
      }
    },
    broadcast(message) {
      if (isDestroyed) return;
      for (const ws of clients.values()) {
        if (ws.readyState === WsClient.OPEN) {
          ws.send(message);
        }
      }
    },
    closeClient(clientId) {
      const ws = clients.get(clientId);
      if (ws) {
        try {
          ws.close();
        } catch {
          /* noop */
        }
      }
    },
    onEvent(handler) {
      if (isDestroyed) return () => {};
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    async getIpAddress() {
      return "127.0.0.1";
    },
    async getGatewayIp() {
      return null;
    },
  };

  return {
    bridge,
    port,
    close: async () => {
      await bridge.stop();
    },
  };
}
