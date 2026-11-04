/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * تشخيص الاتصال الجماعي على الجهاز الحقيقي:
 * يجمع بيانات البيئة (الإضافة الأصلية، بوابة الشبكة) ويتصل تجريبياً بكل
 * عنوان مرشح للمضيف عبر ws:// ويسجّل نتيجة كل محاولة وسبب فشلها.
 */

import { getJoinCandidateIps, tryCreateNativeWssBridge } from "./wssBridge";

export type ProbeResult = "open" | "closed" | "timeout";

export interface CandidateProbe {
  ip: string;
  port: number;
  result: ProbeResult;
  /** وصف قصير للسبب عند الفشل (مثل خطأ المتصفح أو انتهاء المهلة). */
  error?: string;
  ms: number;
}

export interface JoinDiagnosticsReport {
  /** هل إضافة خادم WebSocket الأصلية مكتشفة في هذه البيئة. */
  pluginDetected: boolean;
  /** بوابة الشبكة كما أبلغها الجهاز (عنوان المضيف على نقطة الاتصال عادة). */
  gatewayIp: string | null;
  candidates: CandidateProbe[];
  at: string;
}

/** محاولة فتح ws:// خام لعنوان معين وقياس النتيجة. */
export function probeWebSocket(
  ip: string,
  port = 8080,
  timeoutMs = 3000,
): Promise<CandidateProbe> {
  return new Promise((resolve) => {
    const started = Date.now();
    let settled = false;
    let ws: WebSocket | null = null;
    const finish = (result: ProbeResult, error?: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try {
        ws?.close();
      } catch {
        /* noop */
      }
      resolve({ ip, port, result, error, ms: Date.now() - started });
    };
    const timer = window.setTimeout(() => finish("timeout", "انتهت المهلة"), timeoutMs);
    try {
      ws = new WebSocket(`ws://${ip}:${port}`);
      ws.onopen = () => finish("open");
      ws.onerror = () => finish("closed", "رفض الاتصال أو حظرنا");
      ws.onclose = () => finish("closed", "أُغلق الاتصال");
    } catch (err) {
      finish("closed", err instanceof Error ? err.message : String(err));
    }
  });
}

/** تشغيل تقرير تشخيص كامل: البيئة + محاولة لكل عنوان مرشح. */
export async function runJoinDiagnostics(): Promise<JoinDiagnosticsReport> {
  const bridge = tryCreateNativeWssBridge();
  let gatewayIp: string | null = null;
  if (bridge) {
    try {
      gatewayIp = await bridge.getGatewayIp();
    } catch {
      gatewayIp = null;
    }
  }
  const candidates = await getJoinCandidateIps();
  const probes: CandidateProbe[] = [];
  for (const ip of candidates) {
    probes.push(await probeWebSocket(ip, 8080));
  }
  return {
    pluginDetected: !!bridge,
    gatewayIp,
    candidates: probes,
    at: new Date().toISOString(),
  };
}
