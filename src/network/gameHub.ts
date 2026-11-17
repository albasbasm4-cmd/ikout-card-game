/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * gameHub — طبقة الشبكة الموحدة للألعاب الأربعة (كوت، أونو، 187، جوكر).
 *
 * المضيف: يفتح خادم WebSocket محلي عبر الإضافة الأصلية (أندرويد) ويوجّه
 * الرسائل إلى قناة كل لعبة حسب `ch`.
 * المنضم: عميل WebSocket يرسل `{ ch, ...msg }` ويستقبل بنفس الشكل.
 *
 * كل الرسائل JSON على شكل: { ch: "kout"|"uno"|"g187"|"joker", ...payload }
 */

import { tryCreateNativeWssBridge, type WssBridge, type WssClientEvent } from "./wssBridge";
import { withoutAuthSecrets } from "./wirePrivacy";

export type HubChannel = "kout" | "uno" | "g187" | "joker";

export const HUB_PORT = 8080;

export interface HubMessage {
  ch: HubChannel | string;
  [key: string]: unknown;
}

export interface HubChannelHandlers {
  onClientMessage(clientId: string, msg: HubMessage): void;
  onClientConnected?(clientId: string): void;
  onClientDisconnected?(clientId: string): void;
}

// ------------------------------------------------------------------
// جانب المضيف (دورة حياة موحدة ومحمية من التزامن)
// ------------------------------------------------------------------

export type HubServerLifecycle = "STOPPED" | "STARTING" | "RUNNING" | "STOPPING" | "ERROR";

const channels = new Map<string, HubChannelHandlers>();
let serverState: HubServerLifecycle = "STOPPED";
let startPromise: Promise<boolean> | null = null;
let stopPromise: Promise<void> | null = null;
let activeBridge: WssBridge | null = null;
let unsubBridgeEvent: (() => void) | null = null;

export function getHubServerState(): HubServerLifecycle {
  return serverState;
}

export function setHubBridgeForTesting(bridge: WssBridge | null): void {
  activeBridge = bridge;
  if (bridge) {
    serverState = "RUNNING";
    unsubBridgeEvent?.();
    unsubBridgeEvent = bridge.onEvent((evt: WssClientEvent) => {
      if (serverState !== "RUNNING") return;
      if (evt.type === "CLIENT_CONNECTED") {
        for (const handlers of Array.from(channels.values())) {
          handlers.onClientConnected?.(evt.clientId);
        }
      } else if (evt.type === "CLIENT_DISCONNECTED") {
        for (const handlers of Array.from(channels.values())) {
          handlers.onClientDisconnected?.(evt.clientId);
        }
      } else if (evt.type === "CLIENT_MESSAGE") {
        const msg = evt.data as HubMessage;
        if (!msg || typeof msg !== "object") return;
        const target = channels.get(msg.ch);
        if (target) {
          target.onClientMessage(evt.clientId, msg);
        }
      }
    });
  } else {
    serverState = "STOPPED";
    unsubBridgeEvent?.();
    unsubBridgeEvent = null;
  }
}

export async function ensureHubServer(port = HUB_PORT): Promise<boolean> {
  if (serverState === "RUNNING") return true;
  if (serverState === "STARTING" && startPromise) return startPromise;

  if (serverState === "STOPPING" && stopPromise) {
    await stopPromise;
  }

  serverState = "STARTING";
  startPromise = (async () => {
    try {
      const bridge = tryCreateNativeWssBridge();
      if (!bridge) {
        serverState = "STOPPED";
        return false;
      }

      activeBridge = bridge;

      // تسجيل مستمع أحداث الجسر الموحد
      unsubBridgeEvent = bridge.onEvent((evt) => {
        if (serverState !== "RUNNING") return;
        if (evt.type === "CLIENT_CONNECTED") {
          for (const h of channels.values()) {
            try {
              h.onClientConnected?.(evt.clientId);
            } catch (err) {
              console.error("[gameHub] onClientConnected error:", err);
            }
          }
        } else if (evt.type === "CLIENT_DISCONNECTED") {
          for (const h of channels.values()) {
            try {
              h.onClientDisconnected?.(evt.clientId);
            } catch (err) {
              console.error("[gameHub] onClientDisconnected error:", err);
            }
          }
        } else if (evt.type === "CLIENT_MESSAGE" && evt.data && typeof evt.data === "object") {
          const msg = evt.data as HubMessage;
          const handler = typeof msg.ch === "string" ? channels.get(msg.ch) : undefined;
          if (handler) {
            try {
              handler.onClientMessage(evt.clientId, msg);
            } catch (err) {
              console.error("[gameHub] onClientMessage error:", err);
            }
          }
        }
      });

      const ok = await bridge.start(port);
      if (ok) {
        serverState = "RUNNING";
        return true;
      } else {
        serverState = "ERROR";
        if (unsubBridgeEvent) {
          unsubBridgeEvent();
          unsubBridgeEvent = null;
        }
        await bridge.stop();
        activeBridge = null;
        return false;
      }
    } catch (err) {
      console.error("[gameHub] ensureHubServer failed:", err);
      serverState = "ERROR";
      if (unsubBridgeEvent) {
        unsubBridgeEvent();
        unsubBridgeEvent = null;
      }
      activeBridge = null;
      return false;
    } finally {
      startPromise = null;
    }
  })();

  return startPromise;
}

export async function stopHubServer(): Promise<void> {
  if (serverState === "STOPPED") return;
  if (serverState === "STOPPING" && stopPromise) return stopPromise;

  if (serverState === "STARTING" && startPromise) {
    await startPromise;
  }

  serverState = "STOPPING";
  stopPromise = (async () => {
    try {
      if (unsubBridgeEvent) {
        unsubBridgeEvent();
        unsubBridgeEvent = null;
      }
      if (activeBridge) {
        await activeBridge.stop();
        activeBridge = null;
      }
    } catch (err) {
      console.warn("[gameHub] stopHubServer error:", err);
    } finally {
      serverState = "STOPPED";
      stopPromise = null;
    }
  })();

  return stopPromise;
}

export function registerHubChannel(ch: HubChannel, handlers: HubChannelHandlers): () => void {
  channels.set(ch, handlers);
  return () => {
    if (channels.get(ch) === handlers) {
      channels.delete(ch);
    }
  };
}

export function hubSendTo(clientId: string, msg: HubMessage): void {
  if (serverState !== "RUNNING" || !activeBridge) return;
  try {
    activeBridge.sendTo(clientId, JSON.stringify(withoutAuthSecrets(msg)));
  } catch (err) {
    console.warn("[gameHub] hubSendTo failed:", err);
  }
}

export function hubBroadcast(msg: HubMessage): void {
  if (serverState !== "RUNNING" || !activeBridge) return;
  try {
    activeBridge.broadcast(JSON.stringify(withoutAuthSecrets(msg)));
  } catch (err) {
    console.warn("[gameHub] hubBroadcast failed:", err);
  }
}

export function hubCloseClient(clientId: string): void {
  if (!activeBridge) return;
  try {
    activeBridge.closeClient(clientId);
  } catch (err) {
    console.warn("[gameHub] hubCloseClient failed:", err);
  }
}

export function hubIsNative(): boolean {
  return !!activeBridge?.isNative;
}

export async function hubGetHostIp(): Promise<string | null> {
  return (await activeBridge?.getIpAddress()) ?? null;
}

// ------------------------------------------------------------------
// جانب المنضم (العميل)
// ------------------------------------------------------------------

export type HubClientStatus = "CONNECTING" | "OPEN" | "CLOSED" | "FAILED";

export class HubClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<(msg: HubMessage) => void>();
  private statusHandlers = new Set<(s: HubClientStatus) => void>();
  private _status: HubClientStatus = "CONNECTING";
  public url: string;

  constructor(url: string) {
    this.url = url;
  }

  get status(): HubClientStatus {
    return this._status;
  }

  private setStatus(s: HubClientStatus) {
    if (this._status === s) return;
    this._status = s;
    for (const h of this.statusHandlers) h(s);
  }

  onStatus(cb: (s: HubClientStatus) => void): () => void {
    this.statusHandlers.add(cb);
    return () => this.statusHandlers.delete(cb);
  }

  /** يتصل وينتظر الفتح أو الفشل. */
  connect(timeoutMs = 4000): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(ok);
      };
      const timer = setTimeout(() => {
        try {
          this.ws?.close();
        } catch {
          /* noop */
        }
        finish(false);
      }, timeoutMs);

      try {
        this.ws = new WebSocket(this.url);
      } catch {
        finish(false);
        return;
      }
      this.ws.onopen = () => {
        this.setStatus("OPEN");
        finish(true);
      };
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as HubMessage;
          if (msg && typeof msg.ch === "string") {
            for (const h of this.handlers) h(msg);
          }
        } catch {
          /* تجاهل الرسائل غير الصالحة */
        }
      };
      this.ws.onclose = () => {
        this.setStatus("CLOSED");
        finish(false);
      };
      this.ws.onerror = () => {
        this.setStatus("FAILED");
        finish(false);
      };
    });
  }

  send(msg: HubMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /** يرسل الرسالة تلقائياً على القناة المحددة. */
  sendOn(ch: HubChannel, msg: Omit<HubMessage, "ch">): void {
    this.send({ ...msg, ch } as HubMessage);
  }

  onMessage(cb: (msg: HubMessage) => void): () => void {
    this.handlers.add(cb);
    return () => this.handlers.delete(cb);
  }

  onChannel(ch: HubChannel, cb: (msg: HubMessage) => void): () => void {
    return this.onMessage((msg) => {
      if (msg.ch === ch) cb(msg);
    });
  }

  close(): void {
    try {
      this.ws?.close();
    } catch {
      /* noop */
    }
    this.ws = null;
    this.setStatus("CLOSED");
  }
}

/**
 * يجرب العناوين المرشحة واحداً تلو الآخر حتى ينجح الاتصال.
 * يرجع أول HubClient مفتوح أو null عند فشل الجميع.
 */
export async function connectHubToHost(
  candidates: string[],
  ch: HubChannel,
  port = HUB_PORT,
  perIpTimeoutMs = 2500,
): Promise<HubClient | null> {
  for (const ip of candidates) {
    const clean = ip
      .trim()
      .replace(/^ws:\/\//i, "")
      .replace(/:\d+$/, "");
    if (!clean) continue;
    const client = new HubClient(`ws://${clean}:${port}`);
    const ok = await client.connect(perIpTimeoutMs);
    if (ok) {
      return client;
    }
    client.close();
  }
  return null;
}
