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
// جانب المضيف
// ------------------------------------------------------------------

interface HubServerState {
  bridge: WssBridge;
  started: boolean;
  channels: Map<string, HubChannelHandlers>;
}

let hubServer: HubServerState | null = null;

export async function ensureHubServer(port = HUB_PORT): Promise<boolean> {
  if (hubServer?.started) return true;
  const bridge = tryCreateNativeWssBridge();
  if (!bridge) return false;
  if (!hubServer) {
    hubServer = { bridge, started: false, channels: new Map() };
    bridge.onEvent((evt) => {
      if (evt.type === "CLIENT_CONNECTED") {
        for (const h of hubServer!.channels.values()) h.onClientConnected?.(evt.clientId);
      } else if (evt.type === "CLIENT_DISCONNECTED") {
        for (const h of hubServer!.channels.values()) h.onClientDisconnected?.(evt.clientId);
      } else if (evt.type === "CLIENT_MESSAGE" && evt.data && typeof evt.data === "object") {
        const msg = evt.data as HubMessage;
        const handler = typeof msg.ch === "string" ? hubServer!.channels.get(msg.ch) : undefined;
        if (handler) handler.onClientMessage(evt.clientId, msg);
      }
    });
  }
  const ok = await bridge.start(port);
  hubServer.started = ok;
  return ok;
}

export function registerHubChannel(ch: HubChannel, handlers: HubChannelHandlers): () => void {
  if (!hubServer) {
    hubServer = {
      bridge: tryCreateNativeWssBridge() ?? ({} as WssBridge),
      started: false,
      channels: new Map(),
    };
  }
  hubServer.channels.set(ch, handlers);
  return () => {
    if (hubServer && hubServer.channels.get(ch) === handlers) hubServer.channels.delete(ch);
  };
}

export function hubSendTo(clientId: string, msg: HubMessage): void {
  try {
    hubServer?.bridge.sendTo(clientId, JSON.stringify(msg));
  } catch {
    /* noop */
  }
}

export function hubBroadcast(msg: HubMessage): void {
  try {
    hubServer?.bridge.broadcast(JSON.stringify(msg));
  } catch {
    /* noop */
  }
}

export function hubCloseClient(clientId: string): void {
  try {
    hubServer?.bridge.closeClient(clientId);
  } catch {
    /* noop */
  }
}

export function hubIsNative(): boolean {
  return !!hubServer?.bridge.isNative;
}

export async function hubGetHostIp(): Promise<string | null> {
  return (await hubServer?.bridge.getIpAddress()) ?? null;
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
    const clean = ip.trim().replace(/^ws:\/\//i, "").replace(/:\d+$/, "");
    if (!clean) continue;
    const client = new HubClient(`ws://${clean}:${port}`);
    const ok = await client.connect(perIpTimeoutMs);
    if (ok) {
      // مصافحة القناة: نرسل رسالة hello حتى يعرف المضيف وجودنا (اختياري لكل لعبة)
      return client;
    }
    client.close();
  }
  return null;
}
