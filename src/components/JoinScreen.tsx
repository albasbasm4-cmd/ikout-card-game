/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import {
  Camera,
  Keyboard,
  ArrowRight,
  Wifi,
  AlertCircle,
  RotateCcw,
  CheckCircle2,
  Sparkles,
  Shield,
  Loader2,
} from "lucide-react";
import { parseRoomPayload } from "../network/localIp";
import { LocalClientSocket, ClientSocketStatus } from "../network/LocalClientSocket";
import { getJoinCandidateIps } from "../network/wssBridge";
import { setActiveKoutClient } from "../network/koutNet";
import jsQR from "jsqr";

/**
 * Pluggable Barcode / QR Scanner interface so native hardware scanners can be plugged in later
 */
export interface IBarcodeScanner {
  isAvailable(): Promise<boolean>;
  startScan(videoElement?: HTMLVideoElement | null): Promise<string>;
  stopScan(): Promise<void>;
}

/**
 * Standard Web Barcode / Camera scanner using BarcodeDetector API if available,
 * or simulated camera scanner fallback.
 */
export class WebBarcodeScanner implements IBarcodeScanner {
  private stream: MediaStream | null = null;
  private scanning = false;

  public async isAvailable(): Promise<boolean> {
    const win = window as any;
    if (win.Capacitor?.Plugins?.BarcodeScanner) return true;
    return (
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices &&
      !!navigator.mediaDevices.getUserMedia
    );
  }

  public async startScan(videoElement?: HTMLVideoElement | null): Promise<string> {
    this.scanning = true;
    const win = window as any;

    // Check for native Capacitor Barcode Scanner plugin first (fastest on Android)
    if (win.Capacitor?.Plugins?.BarcodeScanner) {
      try {
        const scanner = win.Capacitor.Plugins.BarcodeScanner;
        await scanner.checkPermission({ force: true });
        const result = await scanner.startScan();
        if (result && result.hasContent) {
          this.scanning = false;
          return result.content;
        }
      } catch (err) {
        console.warn("[Capacitor BarcodeScanner] fallback to WebRTC/WebView camera", err);
      }
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("الكاميرا غير مدعومة على هذا المتصفح");
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
    } catch {
      // بعض الأجهزة ترفض قيود facingMode: نجرّب الكاميرا الافتراضية
      this.stream = await navigator.mediaDevices.getUserMedia({ video: true });
    }

    if (videoElement) {
      videoElement.srcObject = this.stream;
      await videoElement.play();
    }

    // Check for native BarcodeDetector API in modern Chromium / Android
    const BarcodeDetectorClass = (window as any).BarcodeDetector;
    if (BarcodeDetectorClass && videoElement) {
      const detector = new BarcodeDetectorClass({ formats: ["qr_code"] });

      return new Promise<string>((resolve, reject) => {
        const interval = setInterval(async () => {
          if (!this.scanning) {
            clearInterval(interval);
            reject(new Error("تم إيقاف المسح"));
            return;
          }
          try {
            const barcodes = await detector.detect(videoElement);
            if (barcodes && barcodes.length > 0) {
              clearInterval(interval);
              this.stopScan();
              resolve(barcodes[0].rawValue);
            }
          } catch {
            // Frame detection error, keep trying
          }
        }, 250);
      });
    }

    // لا يوجد BarcodeDetector في WebView الأندرويد: نحلل الإطارات محلياً بـ jsQR
    if (!videoElement) {
      throw new Error("لا يوجد عنصر فيديو لعرض الكاميرا");
    }
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("تعذر تجهيز محلل الصور");

    return new Promise<string>((resolve, reject) => {
      let raf = 0;
      let tries = 0;
      const tick = () => {
        if (!this.scanning) {
          reject(new Error("تم إيقاف المسح"));
          return;
        }
        if (videoElement.readyState >= 2 && videoElement.videoWidth > 0) {
          canvas.width = videoElement.videoWidth;
          canvas.height = videoElement.videoHeight;
          ctx.drawImage(videoElement, 0, 0);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          if (code && code.data) {
            this.stopScan();
            resolve(code.data);
            return;
          }
        }
        if (++tries > 600) {
          // 600 إطار × 66ms ≈ 40 ثانية بلا نتيجة
          this.stopScan();
          reject(new Error("لم يُعثر على رمز QR — أقرب الرمز أكثر أو أدخله يدوياً"));
          return;
        }
        setTimeout(tick, 66);
      };
      raf = window.setTimeout(tick, 120);
      void raf;
    });
  }

  public async stopScan(): Promise<void> {
    this.scanning = false;
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }
}

export interface JoinScreenProps {
  onConnected?: (socket: LocalClientSocket, payload: any) => void;
  onBack: () => void;
  scannerOverride?: IBarcodeScanner;
  /** رمز غرفة مُدخل مسبقاً (من شاشة الغرفة). */
  initialCode?: string;
  /** افتح الشاشة مباشرة في وضع المسح أو الإدخال اليدوي. */
  initialMode?: "SCAN" | "MANUAL";
  className?: string;
}

export const JoinScreen: React.FC<JoinScreenProps> = ({
  onConnected,
  onBack,
  scannerOverride,
  initialCode,
  initialMode,
  className = "",
}) => {
  const [mode, setMode] = useState<"SCAN" | "MANUAL">(initialMode ?? "SCAN");
  const [playerName, setPlayerName] = useState<string>("لاعب");
  const [hostIp, setHostIp] = useState<string>("");
  const [roomCode, setRoomCode] = useState<string>(initialCode ?? "");
  const [status, setStatus] = useState<"IDLE" | "SCANNING" | "CONNECTING" | "ERROR" | "SUCCESS">(
    "IDLE",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<IBarcodeScanner>(scannerOverride || new WebBarcodeScanner());
  const socketRef = useRef<LocalClientSocket | null>(null);

  // Clean up scanner on unmount
  useEffect(() => {
    return () => {
      scannerRef.current.stopScan();
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const handleStartScan = async () => {
    setStatus("SCANNING");
    setErrorMessage(null);

    try {
      const rawPayload = await scannerRef.current.startScan(videoRef.current);
      handlePayloadScanned(rawPayload);
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : "";
      let reason: string;
      if (name === "NotAllowedError" || name === "SecurityError") {
        reason =
          "تم رفض إذن الكاميرا — امنح التطبيق إذن الكاميرا من إعدادات النظام ثم أعد المحاولة، أو أدخل الرمز يدوياً.";
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        reason = "لم تُعثر على كاميرا متاحة على هذا الجهاز — استخدم الإدخال اليدوي.";
      } else {
        reason = `${err instanceof Error ? err.message : String(err)}. يمكنك إدخال البيانات يدوياً.`;
      }
      setStatus("ERROR");
      setErrorMessage(`تعذر مسح رمز QR: ${reason}`);
    }
  };

  const handlePayloadScanned = (payload: string) => {
    const { ip, port, roomCode: parsedRoom } = parseRoomPayload(payload);
    setHostIp(ip);
    if (parsedRoom) setRoomCode(parsedRoom);
    connectToHost(ip, port, parsedRoom);
  };

  const connectToHost = (ip: string, port = 8080, code?: string, candidates?: string[]) => {
    setStatus("CONNECTING");
    setErrorMessage(null);

    const targetUrl = `ws://${ip}:${port}`;
    const token = `player_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    try {
      const socket = new LocalClientSocket({
        url: targetUrl,
        playerToken: token,
        playerName: playerName.trim() || "لاعب زائر",
        maxReconnectAttempts: 4,
        initialBackoffMs: 600,
        channel: "kout",
        roomCode: code,
      });

      socketRef.current = socket;

      const failOrFallback = () => {
        socket.disconnect();
        const rest = (candidates ?? []).filter((c) => c !== ip);
        if (rest.length > 0) {
          connectToHost(rest[0], port, code, rest);
          return;
        }
        setStatus("ERROR");
        setErrorMessage(
          "فشل الاتصال بمضيف الغرفة (انتهت المهلة). تأكد من أن المضيف فتح غرفة اللعب الجماعي وأن الجهازين متصلان بنفس نقطة الاتصال/الشبكة، أو أدخل عنوان IP الظاهر على شاشة المضيف (زر رمز QR).",
        );
      };

      const connectionTimeout = setTimeout(() => {
        if (socket.getStatus() !== "CONNECTED") failOrFallback();
      }, 4000);

      socket.onStatusChange((sockStatus: ClientSocketStatus) => {
        if (sockStatus === "CONNECTED") {
          clearTimeout(connectionTimeout);
          setStatus("SUCCESS");
          setActiveKoutClient({
            socket,
            mySeat: 0,
            playerToken: token,
            roomCode: code,
          });
          if (onConnected) {
            onConnected(socket, { ip, port, roomCode: code });
          }
        } else if (sockStatus === "HOST_DROPPED") {
          clearTimeout(connectionTimeout);
          setStatus("ERROR");
          setErrorMessage("تعذر العثور على المضيف أو غادر الغرفة.");
        }
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus("ERROR");
      setErrorMessage(`خطأ أثناء محاولة الاتصال: ${msg}`);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const typed = hostIp.trim();
    // العنوان القديم المعروض تلقائياً لا يُعامَل كإدخال حقيقي من اللاعب
    const typedIp = typed === "192.168.1.105" ? "" : typed;
    if (!typedIp && !roomCode.trim()) {
      setErrorMessage("يرجى إدخال عنوان IP الخاص بالمضيف أو رمز الغرفة.");
      return;
    }

    const tryConnect = async () => {
      const candidates: string[] = [];
      if (typedIp) {
        const { ip, port } = parseRoomPayload(typedIp);
        candidates.push(ip);
        connectToHost(ip, port, roomCode.trim() || undefined, candidates);
        return;
      }
      // رمز فقط بدون IP: نجرّب بوابة الشبكة (Hotspot) تلقائياً
      setStatus("CONNECTING");
      setErrorMessage(null);
      const auto = await getJoinCandidateIps();
      connectToHost(auto[0], 8080, roomCode.trim() || undefined, auto);
    };
    void tryConnect();
  };

  return (
    <div
      dir="rtl"
      className={`min-h-[100dvh] w-full bg-neutral-950 flex justify-center items-center p-0 sm:p-4 text-amber-50 select-none ${className}`}
    >
      <div className="relative w-full max-w-md h-[100dvh] pt-safe pb-safe px-safe sm:h-[844px] sm:max-h-[92vh] sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col wood-rail border border-amber-900/40">
        {/* Top Header */}
        <header className="relative z-10 px-4 py-3 flex items-center justify-between border-b border-amber-500/20 bg-gradient-to-b from-black/80 to-black/40 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                scannerRef.current.stopScan();
                onBack();
              }}
              className="w-8 h-8 rounded-full bg-neutral-800 text-amber-300 hover:text-white flex items-center justify-center cursor-pointer active:scale-95 transition-colors"
              aria-label="الرجوع"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-base font-bold text-amber-300 leading-none">الانضمام لغرفة</h1>
              <p className="text-[11px] text-amber-200/60 font-medium">
                الاتصال بشبكة اللعب المحلية
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300 bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-500/30">
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            <span>Wi-Fi محلي</span>
          </div>
        </header>

        {/* Tab Switcher: Scan vs Manual */}
        <div className="px-4 pt-3 pb-1">
          <div className="grid grid-cols-2 gap-2 bg-black/60 p-1 rounded-2xl border border-amber-500/20">
            <button
              type="button"
              onClick={() => {
                setMode("SCAN");
                setStatus("IDLE");
                setErrorMessage(null);
              }}
              className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                mode === "SCAN"
                  ? "bg-amber-400 text-black shadow-md font-extrabold"
                  : "text-amber-200/70 hover:text-white"
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>مسح رمز QR</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("MANUAL");
                scannerRef.current.stopScan();
                setStatus("IDLE");
                setErrorMessage(null);
              }}
              className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                mode === "MANUAL"
                  ? "bg-amber-400 text-black shadow-md font-extrabold"
                  : "text-amber-200/70 hover:text-white"
              }`}
            >
              <Keyboard className="w-4 h-4" />
              <span>إدخال يدوي</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {/* Player Name Input */}
          <div className="bg-black/40 border border-amber-500/20 rounded-2xl p-3 shadow-md backdrop-blur-xs">
            <label className="block text-[11px] font-bold text-amber-200/80 mb-1">
              اسمك في اللعبة:
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="مثال: فهد، محمد..."
              className="w-full bg-black/60 border border-neutral-700/60 rounded-xl px-3 py-2 text-sm text-white font-bold focus:outline-none focus:border-amber-400"
            />
          </div>

          {/* Mode 1: Camera QR Scanner */}
          {mode === "SCAN" && (
            <div className="bg-black/40 border border-amber-500/20 rounded-2xl p-4 shadow-md backdrop-blur-xs flex flex-col items-center text-center">
              <div className="relative w-60 h-60 rounded-2xl overflow-hidden border-2 border-dashed border-amber-400/50 bg-black flex items-center justify-center mb-3">
                <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                {status !== "SCANNING" && (
                  <div className="absolute inset-0 bg-neutral-900/90 flex flex-col items-center justify-center p-4">
                    <Camera className="w-10 h-10 text-amber-400/60 mb-2" />
                    <span className="text-xs text-amber-200/70">
                      اضغط بالأسفل لتشغيل الكاميرا ومسح رمز المضيف
                    </span>
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={status === "CONNECTING"}
                onClick={handleStartScan}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-700 to-emerald-800 hover:from-emerald-600 hover:to-emerald-700 text-white font-extrabold text-xs border border-emerald-400/40 shadow-lg active:scale-98 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Camera className="w-4 h-4" />
                <span>{status === "SCANNING" ? "جارِ المسح..." : "تشغيل الكاميرا للمسح"}</span>
              </button>
              {status === "SCANNING" && (
                <button
                  type="button"
                  onClick={() => {
                    scannerRef.current.stopScan();
                    setStatus("IDLE");
                  }}
                  className="mt-2 text-[11px] font-bold text-amber-200/70 hover:text-white cursor-pointer"
                >
                  إلغاء المسح
                </button>
              )}
            </div>
          )}

          {/* Mode 2: Manual IP & Room Code Form */}
          {mode === "MANUAL" && (
            <form
              onSubmit={handleManualSubmit}
              className="bg-black/40 border border-amber-500/20 rounded-2xl p-4 shadow-md backdrop-blur-xs space-y-3"
            >
              <div>
                <label className="block text-[11px] font-bold text-amber-200/80 mb-1">
                  عنوان السيرفر (IP الخاص بالمضيف):
                </label>
                <input
                  type="text"
                  value={hostIp}
                  onChange={(e) => setHostIp(e.target.value)}
                  placeholder="192.168.1.xxx أو ws://192.168.1.xxx:8080"
                  className="w-full bg-black/60 border border-neutral-700/60 rounded-xl px-3 py-2 text-sm text-emerald-300 font-mono font-bold focus:outline-none focus:border-amber-400"
                />
                <span className="text-[10px] text-amber-200/50 block mt-1">
                  يظهر هذا العنوان على شاشة المضيف عند فتح رمز QR.
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-amber-200/80 mb-1">
                  رمز الغرفة (اختياري - ٦ أرقام):
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  placeholder="مثال: 482910"
                  className="w-full bg-black/60 border border-neutral-700/60 rounded-xl px-3 py-2 text-sm text-amber-300 font-mono font-bold tracking-wider focus:outline-none focus:border-amber-400"
                />
              </div>

              <button
                type="submit"
                disabled={status === "CONNECTING"}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black text-sm shadow-xl active:scale-98 cursor-pointer flex items-center justify-center gap-2 mt-2"
              >
                {status === "CONNECTING" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جارِ الاتصال...</span>
                  </>
                ) : (
                  <>
                    <Wifi className="w-4 h-4" />
                    <span>اتصال بالغرفة</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Status / Error Box */}
          {status === "ERROR" && errorMessage && (
            <div className="bg-rose-950/80 border border-rose-500/50 rounded-2xl p-4 shadow-lg text-rose-200 animate-in fade-in duration-200">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1 text-right">
                  <h3 className="text-xs font-bold text-rose-300 mb-1">فشل الاتصال</h3>
                  <p className="text-[11px] leading-relaxed text-rose-200/80">{errorMessage}</p>
                </div>
              </div>

              {/* Retry Button */}
              <button
                type="button"
                onClick={() => {
                  if (mode === "SCAN") handleStartScan();
                  else handleManualSubmit({ preventDefault: () => {} } as any);
                }}
                className="w-full mt-3 py-2 rounded-xl bg-rose-900/80 hover:bg-rose-800 text-xs font-bold text-white border border-rose-500/40 flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer shadow"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>إعادة المحاولة (Retry)</span>
              </button>
            </div>
          )}

          {/* Connecting State */}
          {status === "CONNECTING" && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-center flex flex-col items-center">
              <Loader2 className="w-6 h-6 text-amber-400 animate-spin mb-2" />
              <span className="text-xs font-bold text-amber-300">
                جارِ التفاوض والاتصال بسيرفر المضيف...
              </span>
              <span className="text-[10px] text-amber-200/60 mt-0.5">
                تأكد من إبقاء شاشة المضيف مفتوحة
              </span>
            </div>
          )}

          {/* Success State */}
          {status === "SUCCESS" && (
            <div className="bg-emerald-950/80 border border-emerald-500/40 rounded-2xl p-4 text-center flex flex-col items-center text-emerald-200">
              <CheckCircle2 className="w-7 h-7 text-emerald-400 mb-1" />
              <span className="text-sm font-black text-white">تم الاتصال بالغرفة بنجاح!</span>
              <span className="text-[11px] text-emerald-300/80 mt-1">
                تم تثبيت مقعدك وجارِ مزامنة أوراق اللعبة...
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="relative z-10 px-4 py-2.5 border-t border-amber-500/20 bg-black/80 text-[10px] text-amber-200/50 flex items-center justify-between">
          <span>آي كوت • لعب جماعي محلي</span>
          <span>منفذ السيرفر: 8080</span>
        </footer>
      </div>
    </div>
  );
};

export default JoinScreen;
