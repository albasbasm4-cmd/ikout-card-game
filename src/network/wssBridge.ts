import { Capacitor, PluginListenerHandle, registerPlugin } from "@capacitor/core";
import { isValidLocalIpv4 } from "./localIp";
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
  readonly isNative: boolean;
  readonly isDestroyed: boolean;
  start(port: number): Promise<boolean>;
  stop(): Promise<void>;
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
  getIpAddress?(): Promise<{ ip?: string | null }>;
  getGatewayIp?(): Promise<{ ip?: string | null }>;
  addListener(eventName: string, cb: (evt: any) => void): Promise<PluginListenerHandle>;
}

const WebSocketServer = registerPlugin<NativeWssPlugin>("WebSocketServer");

export function getNativeWssPlugin(): NativeWssPlugin | null {
  if (typeof window === "undefined") return null;
  // المتصفح والتشغيل المحلي لا يملكان الإضافة
  if (!Capacitor.isNativePlatform()) return null;
  if (!Capacitor.isPluginAvailable("WebSocketServer")) {
    return null;
  }
  return WebSocketServer;
}

export function createNativeWssBridge(): WssBridge {
  const plugin = getNativeWssPlugin();
  const handlers = new Set<(evt: WssClientEvent) => void>();
  let listenerHandle: PluginListenerHandle | null = null;
  let isDestroyed = false;
  let isStarted = false;

  const emit = (evt: WssClientEvent) => {
    if (isDestroyed) return;
    for (const h of handlers) {
      try {
        h(evt);
      } catch (err) {
        console.error("[WssBridge] handler error:", err);
      }
    }
  };

  const setupListener = async (): Promise<boolean> => {
    if (!plugin) return false;
    if (listenerHandle) return true;

    try {
      listenerHandle = await plugin.addListener("wsEvent", (evt: any) => {
        if (isDestroyed || !evt || typeof evt.type !== "string") return;
        const type = evt.type as WssClientEvent["type"];
        if (
          type !== "CLIENT_CONNECTED" &&
          type !== "CLIENT_DISCONNECTED" &&
          type !== "CLIENT_MESSAGE"
        ) {
          return;
        }

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
      return true;
    } catch (err) {
      console.error("[WssBridge] Failed to register wsEvent listener:", err);
      listenerHandle = null;
      return false;
    }
  };

  return {
    get isNative() {
      return !!plugin;
    },
    get isDestroyed() {
      return isDestroyed;
    },
    async start(port: number): Promise<boolean> {
      if (isDestroyed) {
        console.warn("[WssBridge] Cannot start destroyed bridge");
        return false;
      }
      if (!plugin) return false;
      if (isStarted) return true;

      // 1. تسجيل مستمع wsEvent قبل تشغيل الخادم وانتظار اكتماله
      const listenerReady = await setupListener();
      if (!listenerReady) {
        console.error("[WssBridge] Cannot start server: wsEvent listener setup failed");
        return false;
      }

      // 2. تشغيل الخادم الأصلي
      try {
        await plugin.start({ port });
        isStarted = true;
        return true;
      } catch (err) {
        console.error("[WssBridge] plugin.start failed:", err);
        return false;
      }
    },
    async stop(): Promise<void> {
      if (isDestroyed) return;
      isDestroyed = true;
      isStarted = false;

      // 1. إيقاف الخادم الأصلي
      if (plugin) {
        try {
          await plugin.stop();
        } catch {
          /* ignore */
        }
      }

      // 2. إزالة مستمع الأحداث
      if (listenerHandle) {
        try {
          await listenerHandle.remove();
        } catch {
          /* ignore */
        }
        listenerHandle = null;
      }

      handlers.clear();
    },
    sendTo(clientId: string, message: string) {
      if (isDestroyed || !plugin) return;
      try {
        void plugin.send({ clientId, message });
      } catch (err) {
        console.warn("[WssBridge] sendTo error:", err);
      }
    },
    broadcast(message: string) {
      if (isDestroyed || !plugin) return;
      try {
        void plugin.broadcast({ message });
      } catch (err) {
        console.warn("[WssBridge] broadcast error:", err);
      }
    },
    closeClient(clientId: string) {
      if (isDestroyed || !plugin) return;
      try {
        void plugin.closeClient?.({ clientId });
      } catch (err) {
        console.warn("[WssBridge] closeClient error:", err);
      }
    },
    onEvent(handler: (evt: WssClientEvent) => void): () => void {
      if (isDestroyed) return () => {};
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    async getIpAddress(): Promise<string | null> {
      if (isDestroyed || !plugin?.getIpAddress) return null;
      try {
        const res = await plugin.getIpAddress();
        const ip = res?.ip ?? null;
        return isValidLocalIpv4(ip) ? ip : null;
      } catch {
        return null;
      }
    },
    async getGatewayIp(): Promise<string | null> {
      if (isDestroyed || !plugin?.getGatewayIp) return null;
      try {
        const res = await plugin.getGatewayIp();
        const ip = res?.ip ?? null;
        return isValidLocalIpv4(ip) ? ip : null;
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

/** العناوين المرشحة للوصول إلى المضيف عند إدخال الرمز يدوياً فقط (بدون QR). */
export async function getJoinCandidateIps(targetHostIp?: string | null): Promise<string[]> {
  const candidates: string[] = [];

  // إذا تم توفير IP محدد ومتحقق منه (من QR أو إدخال يدوي) نضعه أولاً
  if (targetHostIp && (isValidLocalIpv4(targetHostIp) || targetHostIp.trim().startsWith("127.0.0.1") || targetHostIp.trim().startsWith("localhost"))) {
    candidates.push(targetHostIp.trim());
    return candidates;
  }

  const bridge = tryCreateNativeWssBridge();
  if (bridge) {
    const gw = await bridge.getGatewayIp();
    if (gw && isValidLocalIpv4(gw) && !candidates.includes(gw)) {
      candidates.push(gw);
    }
  }

  // لا نستخدم أي عناوين افتراضية أو تخمينية إذا فشل الاكتشاف

  return candidates;
}
