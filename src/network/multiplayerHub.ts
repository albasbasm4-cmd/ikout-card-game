/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Universal Hotspot / Local Network Multiplayer Protocol & Manager
 * Unifies room creation, joining, QR generation, WebSocket client & server
 * for all 4 games: Kout, 187, Uno, Joker.
 */

export type SupportedGameType = "kout" | "187" | "uno" | "joker";

export interface RoomPeerInfo {
  token: string;
  name: string;
  characterId?: string;
  seatIndex: number;
  isHost: boolean;
  isBot: boolean;
  connected: boolean;
}

export interface UniversalRoomState {
  gameType: SupportedGameType;
  roomCode: string;
  hostIp: string;
  port: number;
  maxPlayers: number;
  peers: RoomPeerInfo[];
  gameStarted: boolean;
  gameData?: any;
}

export interface UniversalPacket {
  v: number;
  type: string;
  senderToken: string;
  roomCode: string;
  payload?: any;
}

/**
 * Generates uniform connection string for Hotspot QR codes
 * e.g.: ws://192.168.43.1:8080/ws?game=uno&room=123456
 */
export function formatHotspotQrString(
  gameType: SupportedGameType,
  hostIp: string,
  port: number = 8080,
  roomCode: string,
): string {
  const cleanIp = hostIp
    .trim()
    .replace(/^ws:\/\//i, "")
    .replace(/:\d+$/, "");
  return `ws://${cleanIp}:${port}/ws?game=${gameType}&room=${roomCode}`;
}

export function parseHotspotQrString(input: string): {
  gameType?: SupportedGameType;
  hostIp: string;
  port: number;
  roomCode: string;
} | null {
  const trimmed = input.trim();
  try {
    if (
      trimmed.startsWith("ws://") ||
      trimmed.startsWith("wss://") ||
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://")
    ) {
      const url = new URL(trimmed);
      const game = (url.searchParams.get("game") as SupportedGameType) || undefined;
      const room = url.searchParams.get("room") || "";
      return {
        gameType: game,
        hostIp: url.hostname,
        port: Number(url.port) || 8080,
        roomCode: room,
      };
    }
  } catch {
    // fallback to custom patterns
  }

  // Format: "joker-room:123456" or "uno-room:123456"
  if (trimmed.startsWith("joker-room:")) {
    return {
      gameType: "joker",
      hostIp: "192.168.43.1",
      port: 8080,
      roomCode: trimmed.replace("joker-room:", "").trim(),
    };
  }
  if (trimmed.startsWith("uno-room:")) {
    return {
      gameType: "uno",
      hostIp: "192.168.43.1",
      port: 8080,
      roomCode: trimmed.replace("uno-room:", "").trim(),
    };
  }
  if (trimmed.startsWith("187-room:")) {
    return {
      gameType: "187",
      hostIp: "192.168.43.1",
      port: 8080,
      roomCode: trimmed.replace("187-room:", "").trim(),
    };
  }
  if (trimmed.startsWith("kout-room:")) {
    return {
      gameType: "kout",
      hostIp: "192.168.43.1",
      port: 8080,
      roomCode: trimmed.replace("kout-room:", "").trim(),
    };
  }

  // Raw 6-digit code: assume Hotspot gateway IP 192.168.43.1 (default Android AP IP)
  if (/^[0-9A-Z]{4,6}$/i.test(trimmed)) {
    return {
      hostIp: "192.168.43.1",
      port: 8080,
      roomCode: trimmed.toUpperCase(),
    };
  }

  // Format: "192.168.43.1:8080" or "192.168.43.1:8080:123456"
  const parts = trimmed.split(":");
  if (parts.length >= 2) {
    if (parts.length === 3) {
      return {
        hostIp: parts[0],
        port: Number(parts[1]) || 8080,
        roomCode: parts[2],
      };
    }
    if (parts[1].length === 6 && !isNaN(Number(parts[1]))) {
      return { hostIp: parts[0], port: 8080, roomCode: parts[1] };
    }
    return { hostIp: parts[0], port: Number(parts[1]) || 8080, roomCode: "" };
  }

  return null;
}
