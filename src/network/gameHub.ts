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

import { tryCreateNativeWssBridge, type WssBridge } from "./wssBridge";

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
// جانب المضيف (Singleton محكم مع startPromise مشترك)
// ------------------------------------------------------------------

const registeredChannels = new Map<string, HubChannelHandlers>();
let activeBridge: WssBridge | null = null;
let serverStarted = false;
let startPromise: Promise<boolean> | null = null;
let bridgeUnsubscribe: (() => void) | null = null;

export async function ensureHubServer(port = HUB_PORT): Promise<boolean> {
  if (serverStarted && activeBridge) {
    return true;
  }

  if (startPromise) {
    return startPromise;
  }

  startPromise = (async () => {
    try {
      const bridge = tryCreateNativeWssBridge();
      if (!bridge) {
        serverStarted = false;
        return false;
      }

      // إيقاف أي جسر قديم غير مكتمل
      if (activeBridge && activeBridge !== bridge) {
        bridgeUnsubscribe?.();
        activeBridge.stop();
      }

      activeBridge = bridge;
      bridgeUnsubscribe?.();
      bridgeUnsubscribe = bridge.onEvent((evt) => {
        if (evt.type === "CLIENT_CONNECTED") {
          for (const h of registeredChannels.values()) {
            try {
              h.onClientConnected?.(evt.clientId);
            } catch (err) {
              console.error("[gameHub] error in onClientConnected:", err);
            }
          }
        } else if (evt.type === "CLIENT_DISCONNECTED") {
          for (const h of registeredChannels.values()) {
            try {
              h.onClientDisconnected?.(evt.clientId);
            } catch (err) {
              console.error("[gameHub] error in onClientDisconnected:", err);
            }
          }
        } else if (evt.type === "CLIENT_MESSAGE" && evt.data && typeof evt.data === "object") {
          const msg = evt.data as HubMessage;
          const handler = typeof msg.ch === "string" ? registeredChannels.get(msg.ch) : undefined;
          if (handler) {
            try {
              handler.onClientMessage(evt.clientId, msg);
            } catch (err) {
              console.error(
                `[gameHub] error in onClientMessage for channel ${String(msg.ch)}:`,
                err,
              );
            }
          }
        }
      });

      const ok = await bridge.start(port);
      serverStarted = ok;

      if (!ok) {
        bridgeUnsubscribe?.();
        bridgeUnsubscribe = null;
        bridge.stop();
        activeBridge = null;
      }

      return ok;
    } catch (err) {
      console.error("[gameHub] ensureHubServer exception:", err);
      bridgeUnsubscribe?.();
      bridgeUnsubscribe = null;
      activeBridge?.stop();
      activeBridge = null;
      serverStarted = false;
      return false;
    } finally {
      startPromise = null;
    }
  })();

  return startPromise;
}

export function registerHubChannel(ch: HubChannel, handlers: HubChannelHandlers): () => void {
  registeredChannels.set(ch, handlers);
  return () => {
    if (registeredChannels.get(ch) === handlers) {
      registeredChannels.delete(ch);
    }
  };
}

export function stopHubServer(force = false): void {
  if (force || registeredChannels.size === 0) {
    bridgeUnsubscribe?.();
    bridgeUnsubscribe = null;
    try {
      activeBridge?.stop();
    } catch {
      /* noop */
    }
    activeBridge = null;
    serverStarted = false;
    startPromise = null;
  }
}

export function hubSendTo(clientId: string, msg: HubMessage): void {
  try {
    activeBridge?.sendTo(clientId, JSON.stringify(msg));
  } catch {
    /* noop */
  }
}

export function hubBroadcast(msg: HubMessage): void {
  try {
    activeBridge?.broadcast(JSON.stringify(msg));
  } catch {
    /* noop */
  }
}

export function hubCloseClient(clientId: string): void {
  try {
    activeBridge?.closeClient(clientId);
  } catch {
    /* noop */
  }
}

export function hubIsNative(): boolean {
  return !!activeBridge?.isNative;
}

export async function hubGetHostIp(): Promise<string | null> {
  if (activeBridge) {
    return (await activeBridge.getIpAddress()) ?? null;
  }
  const probe = tryCreateNativeWssBridge();
  return (await probe?.getIpAddress()) ?? null;
}

export function hubIsStarted(): boolean {
  return serverStarted && !!activeBridge;
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
