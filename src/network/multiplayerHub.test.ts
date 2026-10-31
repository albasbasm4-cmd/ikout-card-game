import { describe, it, expect } from "vitest";
import { formatHotspotQrString, parseHotspotQrString } from "./multiplayerHub";

describe("multiplayerHub", () => {
  it("formats and parses Hotspot QR string for Uno", () => {
    const formatted = formatHotspotQrString("uno", "192.168.43.1", 8080, "123456");
    expect(formatted).toBe("ws://192.168.43.1:8080/ws?game=uno&room=123456");

    const parsed = parseHotspotQrString(formatted);
    expect(parsed).toEqual({
      gameType: "uno",
      hostIp: "192.168.43.1",
      port: 8080,
      roomCode: "123456",
    });
  });

  it("parses legacy and raw room codes", () => {
    const p1 = parseHotspotQrString("joker-room:889900");
    expect(p1?.gameType).toBe("joker");
    expect(p1?.roomCode).toBe("889900");

    const p2 = parseHotspotQrString("456789");
    expect(p2?.roomCode).toBe("456789");
  });
});
