import { getNativeWssPlugin } from "./wssBridge";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * يتحقق من أن العنوان عنوان IPv4 محلي صالح (خاص)، وليس Loopback أو غير صالح.
 */
export function isValidLocalIpv4(ip: string | null | undefined): boolean {
  if (!ip) return false;
  let trimmed = ip.trim();
  if (trimmed.includes(":")) trimmed = trimmed.split(":")[0].trim();
  const match = trimmed.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;

  const [_, a, b, c, d] = match.map(Number);
  if ([a, b, c, d].some((n) => n < 0 || n > 255)) return false;

  // استبعاد Loopback و Unspecified
  if (a === 127 || (a === 0 && b === 0 && c === 0 && d === 0)) return false;

  // 10.0.0.0/8
  if (a === 10) return true;

  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;

  // 169.254.0.0/16 (Link-local)
  if (a === 169 && b === 254) return true;

  return false;
}

/**
 * Generates a random 6-digit room code (e.g. '482910')
 */
export function generateRoomCode(): string {
  const code = Math.floor(100000 + Math.random() * 900000);
  return String(code);
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

export interface ParsedRoomPayload {
  ip: string;
  port: number;
  roomCode?: string;
  isVerifiedIp: boolean;
}

/**
 * Parses a scanned QR payload or typed string into IP and room code
 */
export function parseRoomPayload(payload: string): ParsedRoomPayload {
  const trimmed = payload.trim();

  try {
    if (trimmed.startsWith("ws://") || trimmed.startsWith("wss://")) {
      const url = new URL(trimmed);
      const roomParam = url.searchParams.get("room");
      const hostIp = url.hostname;
      return {
        ip: hostIp,
        port: Number(url.port) || 8080,
        roomCode: roomParam ? roomParam.trim().toUpperCase() : undefined,
        isVerifiedIp: isValidLocalIpv4(hostIp),
      };
    }
  } catch {
    // Fall through to manual parsing
  }

  // Format: "192.168.1.100:8080" or "192.168.1.100" or raw room code
  if (trimmed.includes(".")) {
    const parts = trimmed.split(":");
    const ip = parts[0].trim();
    const port = parts[1] ? Number(parts[1]) : 8080;
    return {
      ip,
      port,
      isVerifiedIp: isValidLocalIpv4(ip),
    };
  }

  // Pure room code or fallback
  return {
    ip: "",
    port: 8080,
    roomCode: trimmed.toUpperCase(),
    isVerifiedIp: false,
  };
}

/**
 * يكتشف عنوان IPv4 الفعلي للجهاز المضيف على الشبكة المحلية أو نقطة الاتصال.
 * يعيد null إذا لم يتم التحقق من عنوان محلي صالح، ولا يعيد أي عنوان افتراضي زائف.
 */
export async function getLocalIpAddress(): Promise<string | null> {
  if (typeof window === "undefined") {
    return null;
  }

  // 1. الإضافة الأصلية أولاً في بيئة Capacitor / Android
  const wssPlugin = getNativeWssPlugin();
  if (wssPlugin?.getIpAddress) {
    try {
      const res = await wssPlugin.getIpAddress();
      if (res?.ip && isValidLocalIpv4(res.ip)) {
        return res.ip;
      }
    } catch (error) {
      console.warn("[localIp] Native IP detection failed:", error);
    }
  }

  // فحص أجهزة أندرويد عبر أي كائن جسر إضافي مسجل
  const win = window as any;
  if (win.Capacitor?.Plugins?.NetworkServer?.getIpAddress) {
    try {
      const res = await win.Capacitor.Plugins.NetworkServer.getIpAddress();
      if (res?.ip && isValidLocalIpv4(res.ip)) return res.ip;
    } catch {
      // ignore
    }
  }
  if (win.AndroidBridge?.getIpAddress) {
    try {
      const ip = win.AndroidBridge.getIpAddress();
      if (isValidLocalIpv4(ip)) return ip;
    } catch {
      // ignore
    }
  }

  // 2. فحص hostname إذا كان المستعرض يعمل على عنوان IP محلي مباشر
  const hostname = window.location.hostname;
  if (isValidLocalIpv4(hostname)) {
    return hostname;
  }

  // 3. محاولة WebRTC ICE candidate sniffing للمتصفحات
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

      const detected = await new Promise<string | null>((resolve) => {
        const timeout = setTimeout(() => {
          try {
            pc.close();
          } catch {
            /* ignore */
          }
          resolve(null);
        }, 1200);

        pc.onicecandidate = (event: any) => {
          if (!event?.candidate?.candidate) return;
          const candidate = event.candidate.candidate;
          const match = candidate.match(/([0-9]{1,3}(\.[0-9]{1,3}){3})/);
          if (match && match[1] && isValidLocalIpv4(match[1])) {
            clearTimeout(timeout);
            try {
              pc.close();
            } catch {
              /* ignore */
            }
            resolve(match[1]);
          }
        };
      });

      if (detected) return detected;
    }
  } catch {
    // Ignore WebRTC errors
  }

  return null;
}
