/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * InlineQrScanner — كاميرا مسح رمز QR بملء الشاشة الحقيقي (True Fullscreen):
 * تفتح الكاميرا عبر createPortal على document.body لمنع أي تأثر بتحويلات المسرح (transform)،
 * وتغطي كامل الشاشة (100dvw/100dvh) مع فيديو fixed inset-0 وobject-fit: cover،
 * وإطار تسديد في المنتصف مناسب للأجهزة الأفقية، مع زر رجوع/إلغاء يراعي النوتش،
 * وضمان إيقاف مسارات الوسائط عند الانتهاء أو الإلغاء أو الفشل ومنع الجلسات المتزامنة.
 */

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import jsQR from "jsqr";

export interface InlineQrScannerProps {
  /** يُستدعى مرة واحدة عند قراءة رمز ناجح (بعد إيقاف الكاميرا). */
  onCode: (raw: string) => void;
  /** إلغاء المسح وإغلاق الكاميرا. */
  onCancel: () => void;
  /** نص إرشادي اختياري. */
  hint?: string;
}

/** متعقب عالمي للجلسة النشطة لمنع تشغيل أكثر من جلسة كاميرا بالتزامن */
let globalStopActiveScanner: (() => void) | null = null;

export const InlineQrScanner: React.FC<InlineQrScannerProps> = ({
  onCode,
  onCancel,
  hint = "وجّه الكاميرا نحو رمز الغرفة",
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** يمنع استدعاء onCode أكثر من مرة لنفس الرمز أو تكرار الاستدعاء */
  const doneRef = useRef(false);

  useEffect(() => {
    // إيقاف أي جلسة كاميرا نشطة سابقة قبل بدء الجلسة الجديدة
    if (globalStopActiveScanner) {
      try {
        globalStopActiveScanner();
      } catch {
        /* ignore */
      }
      globalStopActiveScanner = null;
    }

    let cancelled = false;
    let tries = 0;
    let timerId: number | null = null;

    const stopStream = () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
        timerId = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {
            /* ignore */
          }
        });
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };

    // تسجيل دالة الإيقاف لهذه الجلسة
    globalStopActiveScanner = stopStream;

    const tick = () => {
      if (cancelled || doneRef.current) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0) {
        timerId = window.setTimeout(tick, 100);
        return;
      }

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        stopStream();
        setError("تعذر تشغيل محلل الرمز — اكتب الرمز يدوياً");
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const found = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });

      if (found?.data && !doneRef.current) {
        doneRef.current = true;
        stopStream();
        onCode(found.data);
        return;
      }

      if (++tries > 600) {
        stopStream();
        setError("لم يُعثر على رمز QR — قرّب الرمز أكثر أو أدخله يدوياً");
        return;
      }

      timerId = window.setTimeout(tick, 66);
    };

    const start = async () => {
      // أولاً: ماسح الكاميرا الأصلي (Capacitor) إن كان متاحاً
      const win = window as unknown as {
        Capacitor?: {
          Plugins?: {
            BarcodeScanner?: {
              startScan(): Promise<{ hasContent: boolean; content?: string }>;
            };
          };
        };
      };

      if (win.Capacitor?.Plugins?.BarcodeScanner) {
        try {
          const res = await win.Capacitor.Plugins.BarcodeScanner.startScan();
          if (res?.hasContent && res.content && !doneRef.current) {
            doneRef.current = true;
            onCode(res.content);
            return;
          }
        } catch {
          // نتابع بكاميرا getUserMedia
        }
      }

      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          });
        } catch {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: "environment" },
            });
          } catch {
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
          }
        }

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        // انتظار استقرار العنصر في DOM
        await new Promise((r) => window.setTimeout(r, 40));
        if (cancelled || !videoRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
        tick();
      } catch (err: unknown) {
        if (cancelled) return;
        stopStream();
        const name = err instanceof Error ? err.name : "";
        setError(
          name === "NotAllowedError" || name === "SecurityError"
            ? "تم رفض إذن الكاميرا — امنح التطبيق الإذن من إعدادات النظام أو أدخل الرمز يدوياً"
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "لا توجد كاميرا متاحة على هذا الجهاز — أدخل الرمز يدوياً"
              : "تعذر تشغيل الكاميرا — أدخل الرمز يدوياً",
        );
      }
    };

    void start();

    return () => {
      cancelled = true;
      stopStream();
      if (globalStopActiveScanner === stopStream) {
        globalStopActiveScanner = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCancelClick = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (globalStopActiveScanner) {
      globalStopActiveScanner();
      globalStopActiveScanner = null;
    }
    onCancel();
  };

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        width: "100%",
        height: "100%",
        minWidth: "100vw",
        minHeight: "100vh",
        zIndex: 9999,
        background: "#000",
        overflow: "hidden",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="مسح رمز QR"
    >
      {/* فيديو الكاميرا بملء الشاشة الحقيقي */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
      />

      {/* إطار التسديد في منتصف الشاشة بحجم متناسق للأجهزة الأفقية */}
      <div
        aria-hidden="true"
        style={{
          pointerEvents: "none",
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(62vmin, 280px)",
          height: "min(62vmin, 280px)",
          border: "3px solid rgba(255,255,255,0.92)",
          borderRadius: 20,
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.48)",
        }}
      />

      {/* نص إرشادي علوي */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          padding: "max(10px, env(safe-area-inset-top, 10px)) 16px 12px",
          textAlign: "center",
          fontWeight: 800,
          color: "#fff",
          fontSize: "clamp(12px, 2.2vh, 18px)",
          background: "linear-gradient(180deg, rgba(0,0,0,0.65) 0%, transparent 100%)",
          pointerEvents: "none",
          zIndex: 2,
        }}
      >
        {hint}
      </div>

      {/* زر إلغاء المسح مع مراعاة منطقة النوتش على الأجهزة الأفقية */}
      <button
        type="button"
        onClick={handleCancelClick}
        aria-label="إلغاء المسح"
        style={{
          position: "absolute",
          top: "max(12px, env(safe-area-inset-top, 12px))",
          right: "max(16px, env(safe-area-inset-right, 16px))",
          width: "clamp(44px, 7vmin, 54px)",
          height: "clamp(44px, 7vmin, 54px)",
          borderRadius: "50%",
          border: "2px solid rgba(77,243,255,0.5)",
          background: "linear-gradient(135deg, rgba(60,188,255,0.35), rgba(14,134,224,0.55))",
          boxShadow: "0 2px 12px rgba(10,90,156,0.45)",
          cursor: "pointer",
          display: "grid",
          placeItems: "center",
          padding: 0,
          zIndex: 10,
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="54%"
          height="54%"
          fill="none"
          stroke="#fff"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>

      {/* رسالة الخطأ في حال تعذر تشغيل الكاميرا دون تجميد الشاشة */}
      {error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            textAlign: "center",
            background: "rgba(0,0,0,0.85)",
            color: "#ffb4ae",
            fontWeight: 800,
            fontSize: "clamp(13px, 2.5vh, 20px)",
            zIndex: 20,
          }}
        >
          <p style={{ maxWidth: 460, margin: "0 0 18px", lineHeight: 1.5 }}>{error}</p>
          <button
            type="button"
            onClick={handleCancelClick}
            style={{
              padding: "10px 26px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.18)",
              border: "1px solid rgba(255,255,255,0.45)",
              color: "#fff",
              fontWeight: 800,
              cursor: "pointer",
              fontSize: "15px",
            }}
          >
            إغلاق ومتابعة الإدخال اليدوي
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
};

export default InlineQrScanner;
