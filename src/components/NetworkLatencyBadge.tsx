/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Wifi, Signal, ChevronUp, ChevronDown } from "lucide-react";
import { useNetworkLatency } from "../network/NetworkLatencyContext";

export interface NetworkLatencyBadgeProps {
  /** أسماء ومقاعد اللاعبين المتاحين على الطاولة الحالية */
  players?: Array<{ seatIndex: number; name: string; isBot?: boolean }>;
  /** إمكانية إجبار الظهور في وضع اللعب مع الأصدقاء حتى لو لم يكن السياق مفعلاً بعد */
  forceShow?: boolean;
  className?: string;
}

/**
 * دالة استخراج اللون والحالة بناءً على الشروط المحددة:
 * 0 إلى 200: أخضر
 * 201 إلى 400: برتقالي
 * 401 إلى 700 فما فوق (الحد الأخير): أحمر
 */
export function getPingColor(pingMs: number): {
  colorClass: string;
  dotBg: string;
  badgeBg: string;
  textColor: string;
  borderClass: string;
  status: "good" | "fair" | "poor";
} {
  if (pingMs <= 200) {
    return {
      colorClass: "text-emerald-400",
      dotBg: "bg-emerald-400",
      badgeBg: "bg-emerald-950/80",
      textColor: "#34d399",
      borderClass: "border-emerald-500/40",
      status: "good",
    };
  }
  if (pingMs <= 400) {
    return {
      colorClass: "text-amber-400",
      dotBg: "bg-amber-400",
      badgeBg: "bg-amber-950/80",
      textColor: "#fbbf24",
      borderClass: "border-amber-500/40",
      status: "fair",
    };
  }
  return {
    colorClass: "text-rose-500",
    dotBg: "bg-rose-500",
    badgeBg: "bg-rose-950/80",
    textColor: "#f43f5e",
    borderClass: "border-rose-500/50",
    status: "poor",
  };
}

export const NetworkLatencyBadge: React.FC<NetworkLatencyBadgeProps> = ({
  players,
  forceShow = false,
  className = "",
}) => {
  const { isHotspotActive, playersPing, mySeatIndex } = useNetworkLatency();
  const [expanded, setExpanded] = useState(false);

  // يظهر فقط عندما تلعب عن طريق الـ Hotspot مع الأصدقاء، ولا يظهر في اللعب العادي
  if (!isHotspotActive && !forceShow) {
    return null;
  }

  // بنق اللاعب المحلي أو الافتراضي للشبكة
  const myPing = playersPing[mySeatIndex] ?? 45;
  const myColor = getPingColor(myPing);

  return (
    <div
      dir="rtl"
      className={`absolute bottom-3 left-3 z-40 flex flex-col items-start select-none font-sans text-xs ${className}`}
      style={{ pointerEvents: "auto" }}
    >
      {/* القائمة الموسعة لعرض سرعة الاتصال عند كل لاعب */}
      {expanded && players && players.length > 0 && (
        <div className="mb-1.5 w-48 rounded-xl border border-white/15 bg-black/85 p-2 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="mb-1 flex items-center justify-between border-b border-white/10 pb-1 text-[11px] font-bold text-white/80">
            <span className="flex items-center gap-1">
              <Wifi className="h-3 w-3 text-cyan-400" />
              <span>بنق الأصدقاء (Hotspot)</span>
            </span>
          </div>
          <div className="flex flex-col gap-1 max-h-36 overflow-y-auto pr-0.5">
            {players.map((p) => {
              if (p.isBot) return null;
              const pPing = playersPing[p.seatIndex] ?? (p.seatIndex === mySeatIndex ? myPing : 65);
              const pColor = getPingColor(pPing);
              const isMe = p.seatIndex === mySeatIndex;
              return (
                <div
                  key={p.seatIndex}
                  className="flex items-center justify-between rounded-md bg-white/5 px-2 py-0.5 text-[11px]"
                >
                  <span className="flex items-center gap-1.5 truncate text-white/90">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${pColor.dotBg} animate-pulse`}
                    />
                    <span className="truncate">
                      {p.name} {isMe ? "(أنت)" : ""}
                    </span>
                  </span>
                  <span className={`font-mono font-bold ${pColor.colorClass}`} dir="ltr">
                    {pPing} ms
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* الرمز الرئيسي المصغر في أسفل اليسار */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 shadow-lg backdrop-blur-md transition-all active:scale-95 ${myColor.badgeBg} ${myColor.borderClass}`}
        title="حالة اتصال Hotspot - اضغط لعرض بقية اللاعبين"
        aria-label={`سرعة الاتصال ${myPing} ملي ثانية`}
      >
        <span className={`inline-block h-2 w-2 rounded-full ${myColor.dotBg} animate-pulse`} />
        <Signal className={`h-3 w-3 ${myColor.colorClass}`} />
        <span className={`font-mono text-[11px] font-black ${myColor.colorClass}`} dir="ltr">
          {myPing} ms
        </span>
        {players && players.length > 1 && (
          <span className="text-white/60 -mr-0.5">
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          </span>
        )}
      </button>
    </div>
  );
};

export default NetworkLatencyBadge;
