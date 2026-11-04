/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { probeWebSocket, runJoinDiagnostics } from "./diagnostics";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
    // يشابه سلوك الشبكة الحقيقية: أول مرشح (بوابة الشبكة) متاح، والبقية ترفض
    queueMicrotask(() => {
      if (url.includes("192.168.43.1")) this.onopen?.();
      else this.onerror?.();
    });
  }
  close() {
    /* noop */
  }
}

describe("network diagnostics", () => {
  beforeEach(() => {
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
    FakeWebSocket.instances = [];
    vi.stubGlobal("window", { setTimeout: setTimeout, clearTimeout: clearTimeout });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports an open connection for a reachable host", async () => {
    const p = probeWebSocket("192.168.43.1", 8080);
    const ws = FakeWebSocket.instances[0];
    expect(ws.url).toBe("ws://192.168.43.1:8080");
    ws.onopen!();
    const res = await p;
    expect(res.result).toBe("open");
    expect(res.ip).toBe("192.168.43.1");
  });

  it("reports closed when the host refuses", async () => {
    const p = probeWebSocket("10.0.0.1", 8080);
    FakeWebSocket.instances[0].onerror!();
    const res = await p;
    expect(res.result).toBe("closed");
    expect(res.error).toBeTruthy();
  });

  it("runs a full report with fallback candidates outside Capacitor", async () => {
    const report = await runJoinDiagnostics();
    expect(report.pluginDetected).toBe(false);
    expect(report.gatewayIp).toBeNull();
    expect(report.candidates.map((c) => c.ip)).toEqual([
      "192.168.43.1",
      "192.168.49.1",
      "192.168.1.1",
    ]);
    expect(report.candidates[0].result).toBe("open");
  });
});
