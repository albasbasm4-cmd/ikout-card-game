import { getNativeWssPlugin } from "./wssBridge";

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generates a random 6-digit room code (e.g. '482910')
 */
export function generateRoomCode(): string {
  const code = Math.floor(100000 + Math.random() * 900000);
  return String(code);
}

export function isValidIpv4(ip: string): boolean {
  if (!ip) return false;
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return false;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return false;
    const n = Number(p);
    if (n < 0 || n > 255) return false;
  }
  return true;
}

/**
 * Encodes the connection payload into a QR code string or URL
 */
export function encodeRoomPayload(ip: string, port: number = 8080, roomCode: string): string {
  const cleanIp = ip
    .trim()
    .replace(/^ws:\/\//i, "")
    .replace(/:\d+$/, "");
  return `ws://${cleanIp}:${port}?room=${roomCode}`;
}

/**
 * Parses a scanned QR payload or typed string into IP and room code
 */
export function parseRoomPayload(payload: string): { ip: string; port: number; roomCode?: string } {
  const trimmed = payload.trim();

  try {
    if (trimmed.startsWith("ws://") || trimmed.startsWith("wss://")) {
      const url = new URL(trimmed);
      const roomParam = url.searchParams.get("room");
      return {
        ip: url.hostname,
        port: Number(url.port) || 8080,
        roomCode: roomParam || undefined,
      };
    }
  } catch {
    // Fall through to manual parsing
  }

  // Format: "192.168.1.100:8080" or "192.168.1.100"
  const parts = trimmed.split(":");
  const ip = parts[0];
  const port = parts[1] ? Number(parts[1]) : 8080;

  return { ip, port };
}

/**
 * Attempts to detect the local network IP:
 * 1. Native WebSocketServer plugin (directly inspects active network interfaces)
 * 2. Capacitor NetworkServer / AndroidBridge if present
 * 3. WebRTC ICE candidate sniffing
 * Returns null if no valid local network IP could be detected.
 */
export async function getLocalIpAddress(): Promise<string | null> {
  if (typeof window === "undefined") {
    return null;
  }

  // 1. الإضافة الأصلية أولاً (الأكثر دقة على أجهزة أندرويد الفعلية)
  const wssPlugin = getNativeWssPlugin();
  if (wssPlugin?.getIpAddress) {
    try {
      const res = await wssPlugin.getIpAddress();
      if (res?.ip && isValidIpv4(res.ip) && !res.ip.startsWith("127.")) {
        return res.ip;
      }
    } catch (error) {
      console.error("[localIp] Native IP detection failed:", error);
    }
  }

  // 2. فحص جسور أندرويد الإضافية
  const win = window as any;
  if (win.Capacitor?.Plugins?.NetworkServer?.getIpAddress) {
    try {
      const res = await win.Capacitor.Plugins.NetworkServer.getIpAddress();
      if (res && res.ip && isValidIpv4(res.ip)) return res.ip;
    } catch {
      // ignore
    }
  }
  if (win.AndroidBridge?.getIpAddress) {
    try {
      const ip = win.AndroidBridge.getIpAddress();
      if (ip && isValidIpv4(ip)) return ip;
    } catch {
      // ignore
    }
  }

  // 3. WebRTC local candidate discovery
  try {
    const RTCPC =
      (window as any).RTCPeerConnection ||
      (window as any).webkitRTCPeerConnection ||
      (window as any).mozRTCPeerConnection;

    if (RTCPC) {
      const pc = new RTCPC({ iceServers: [] });
      pc.createDataChannel("");
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const webrtcIp = await new Promise<string | null>((resolve) => {
        const timeout = setTimeout(() => {
          try {
            pc.close();
          } catch {
            /* noop */
          }
          resolve(null);
        }, 800);

        pc.onicecandidate = (event: any) => {
          if (!event || !event.candidate) return;
          const candidate = event.candidate.candidate;
          const match = candidate.match(/([0-9]{1,3}(\.[0-9]{1,3}){3})/);
          if (match && match[1] && isValidIpv4(match[1]) && !match[1].startsWith("127.")) {
            clearTimeout(timeout);
            try {
              pc.close();
            } catch {
              /* noop */
            }
            resolve(match[1]);
          }
        };
      });

      if (webrtcIp) return webrtcIp;
    }
  } catch {
    // Ignore WebRTC permission errors
  }

  // 4. فحص اسم المضيف المحلي للمتصفح إذا كان IP محلياً صالحاً
  const hostname = window.location.hostname;
  if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1" && isValidIpv4(hostname)) {
    return hostname;
  }

  return null;
}
