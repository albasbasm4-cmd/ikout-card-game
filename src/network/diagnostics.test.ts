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

  it("runs a diagnostic report without guessing IPs when none provided, and probes target IP when provided", async () => {
    // بدون عنوان مدخل ودون جسر أصلي: لا يتم تخمين أي عناوين عشوائية
    const emptyReport = await runJoinDiagnostics();
    expect(emptyReport.pluginDetected).toBe(false);
    expect(emptyReport.gatewayIp).toBeNull();
    expect(emptyReport.candidates).toHaveLength(0);

    // عند توفير عنوان مستهدف: يتم فحصه بدقة
    const report = await runJoinDiagnostics("192.168.43.1");
    expect(report.candidates.map((c) => c.ip)).toEqual(["192.168.43.1"]);
    expect(report.candidates[0].result).toBe("open");
  });
});
