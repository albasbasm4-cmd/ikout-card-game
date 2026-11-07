import { Capacitor, registerPlugin } from "@capacitor/core";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * جسر خادم WebSocket المحلي:
 * - على الأندرويد (Capacitor) يستخدم الإضافة الأصلية WebSocketServer
 *   المبنية داخل المشروع (NanoHTTPD WebSocket) لاستقبال لاعبين حقيقيين عبر
 *   نقطة الاتصال (Hotspot) أو شبكة Wi-Fi المحلية.
 * - في المتصفح (بدون الإضافة) يبقى بدون خادم حقيقي ويعتمد على الحلقة
 *   المحلية (Loopback) فقط.
 */

export interface WssClientEvent {
  type: "CLIENT_CONNECTED" | "CLIENT_DISCONNECTED" | "CLIENT_MESSAGE";
  clientId: string;
  /** رسالة العميل بعد تحليل JSON (للرسائل فقط). */
  data?: unknown;
}

export interface WssBridge {
  isNative: boolean;
  start(port: number): Promise<boolean>;
  stop(): void;
  sendTo(clientId: string, message: string): void;
  broadcast(message: string): void;
  closeClient(clientId: string): void;
  onEvent(handler: (evt: WssClientEvent) => void): () => void;
  /** عنوان IP لجهاز المضيف على نقطة الاتصال / الشبكة المحلية. */
  getIpAddress(): Promise<string | null>;
  /** عنوان بوابة الشبكة (يفيده جهاز المنضم للوصول إلى المضيف). */
  getGatewayIp(): Promise<string | null>;
}

interface NativeWssPlugin {
  start(o: { port: number }): Promise<unknown>;
  stop(): Promise<unknown> | void;
  send(o: { clientId: string; message: string }): Promise<unknown>;
  broadcast(o: { message: string }): Promise<unknown>;
  closeClient?(o: { clientId: string }): Promise<unknown>;
  getIpAddress?(): Promise<{ ip?: string }>;
  getGatewayIp?(): Promise<{ ip?: string }>;
  addListener(eventName: string, cb: (evt: any) => void): Promise<unknown> | void;
}

const WebSocketServer = registerPlugin<NativeWssPlugin>("WebSocketServer");

export function getNativeWssPlugin(): NativeWssPlugin | null {
  if (typeof window === "undefined") return null;

  if (!Capacitor.isPluginAvailable("WebSocketServer")) {
    return null;
  }

  return WebSocketServer;
}

export function createNativeWssBridge(): WssBridge {
  const plugin = getNativeWssPlugin();
  const handlers = new Set<(evt: WssClientEvent) => void>();

  const emit = (evt: WssClientEvent) => {
    for (const h of handlers) h(evt);
  };

  if (plugin) {
    plugin.addListener("wsEvent", (evt: any) => {
      if (!evt || typeof evt.type !== "string") return;
      const type = evt.type as WssClientEvent["type"];
      if (
        type !== "CLIENT_CONNECTED" &&
        type !== "CLIENT_DISCONNECTED" &&
        type !== "CLIENT_MESSAGE"
      )
        return;
      const out: WssClientEvent = { type, clientId: String(evt.clientId ?? "") };
      if (type === "CLIENT_MESSAGE") {
        const raw = evt.data;
        if (typeof raw === "string") {
          try {
            out.data = JSON.parse(raw);
          } catch {
            out.data = raw;
          }
        } else {
          out.data = raw;
        }
      }
      emit(out);
    });
  }

  return {
    isNative: !!plugin,
    async start(port) {
      if (!plugin) return false;
      try {
        await plugin.start({ port });
        return true;
      } catch (err) {
        console.error("[WssBridge] start failed:", err);
        return false;
      }
    },
    stop() {
      try {
        void plugin?.stop();
      } catch {
        /* ignore */
      }
    },
    sendTo(clientId, message) {
      try {
        void plugin?.send({ clientId, message });
      } catch {
        /* ignore */
      }
    },
    broadcast(message) {
      try {
        void plugin?.broadcast({ message });
      } catch {
        /* ignore */
      }
    },
    closeClient(clientId) {
      try {
        void plugin?.closeClient?.({ clientId });
      } catch {
        /* ignore */
      }
    },
    onEvent(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    async getIpAddress() {
      if (!plugin?.getIpAddress) return null;
      try {
        const res = await plugin.getIpAddress();
        return res?.ip ?? null;
      } catch {
        return null;
      }
    },
    async getGatewayIp() {
      if (!plugin?.getGatewayIp) return null;
      try {
        const res = await plugin.getGatewayIp();
        return res?.ip ?? null;
      } catch {
        return null;
      }
    },
  };
}

/** يرجع الجسر الأصلي إن وُجد، وإلا null (يتحول المضيف إلى الحلقة المحلية). */
export function tryCreateNativeWssBridge(): WssBridge | null {
  return getNativeWssPlugin() ? createNativeWssBridge() : null;
}

/** العناوين المرشحة للوصول إلى المضيف عند إدخال الرمز يدوياً فقط. */
export async function getJoinCandidateIps(): Promise<string[]> {
  const candidates: string[] = [];
  const bridge = tryCreateNativeWssBridge();
  if (bridge) {
    const gw = await bridge.getGatewayIp();
    if (gw) candidates.push(gw);
  }
  for (const fallback of ["192.168.43.1", "192.168.49.1", "192.168.1.1"]) {
    if (!candidates.includes(fallback)) candidates.push(fallback);
  }
  return candidates;
}
