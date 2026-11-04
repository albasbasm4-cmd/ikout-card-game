/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * لوحة تشخيص الاتصال الجماعي: تعرض حالة الإضافة الأصلية، بوابة الشبكة،
 * ونتيجة كل محاولة ws:// للعناوين المرشحة — لتشخيص فشل hotspot على الجهاز.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw, CheckCircle2, XCircle, Clock3 } from "lucide-react";
import { runJoinDiagnostics, type JoinDiagnosticsReport } from "../network/diagnostics";

export interface NetworkDiagnosticsPanelProps {
  className?: string;
}

export const NetworkDiagnosticsPanel: React.FC<NetworkDiagnosticsPanelProps> = ({
  className = "",
}) => {
  const [report, setReport] = useState<JoinDiagnosticsReport | null>(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    try {
      setReport(await runJoinDiagnostics());
    } finally {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  return (
    <div
      dir="rtl"
      className={`rounded-2xl border border-amber-500/40 bg-[#101e2e]/90 p-3 text-right text-[11px] text-amber-50 ${className}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-bold text-amber-300">
          <Activity className="h-3.5 w-3.5" />
          <span>تشخيص الاتصال</span>
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={running}
          className="flex items-center gap-1 rounded-full border border-amber-500/40 px-2 py-0.5 text-amber-300 disabled:opacity-50 cursor-pointer active:scale-95 transition-transform"
          aria-label="إعادة الفحص"
        >
          <RefreshCw className={`h-3 w-3 ${running ? "animate-spin" : ""}`} />
          <span>إعادة الفحص</span>
        </button>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-amber-200/70">إضافة الخادم الأصلية</span>
          <span className={report?.pluginDetected ? "text-emerald-300" : "text-red-300"}>
            {report ? (report.pluginDetected ? "مكتشفة ✓" : "غير مكتشفة ✗") : "…"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-amber-200/70">بوابة الشبكة (عنوان المضيف)</span>
          <span className="font-mono text-amber-100">{report ? (report.gatewayIp ?? "غير معروف") : "…"}</span>
        </div>
      </div>

      {report && report.candidates.length > 0 && (
        <div className="mt-2 border-t border-amber-500/20 pt-2">
          <div className="mb-1 text-amber-200/70">محاولات الاتصال ws://</div>
          <div className="space-y-1">
            {report.candidates.map((c) => (
              <div key={c.ip} className="flex items-center justify-between gap-2">
                <span className="font-mono text-amber-100">
                  {c.ip}:{c.port}
                </span>
                <span className="flex items-center gap-1">
                  <span className="text-amber-200/50">{c.ms}ms</span>
                  {c.result === "open" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  ) : c.result === "timeout" ? (
                    <Clock3 className="h-3.5 w-3.5 text-amber-400" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-red-400" />
                  )}
                  <span
                    className={
                      c.result === "open"
                        ? "text-emerald-300"
                        : c.result === "timeout"
                          ? "text-amber-300"
                          : "text-red-300"
                    }
                  >
                    {c.result === "open" ? "متصل" : c.result === "timeout" ? "مهلة" : "فشل"}
                  </span>
                </span>
              </div>
            ))}
          </div>
          {report.candidates.every((c) => c.result !== "open") && (
            <p className="mt-2 leading-relaxed text-amber-200/80">
              لا يوجد مضيف على هذه العناوين. تأكد أن صاحب نقطة الاتصال فاتح غرفة اللعب وأن جهازك
              متصل بنقطة اتصاله، ثم أعد الفحص.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
