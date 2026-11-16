/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * InlineQrScanner — كاميرا مسح رمز QR بملء الشاشة الحقيقي (True Fullscreen):
 * - تفتح الكاميرا عبر createPortal على document.body لمنع أي تأثر بتحويلات المسرح (transform).
 * - تغطي كامل الشاشة باستخدام 100dvw و100dvh مع fallback ملائم (100vw/100vh وinset: 0).
 * - الفيديو يغطي كامل الغلاف عبر position: fixed وobject-fit: cover.
 * - إطار تسديد في المنتصف متناسق للأجهزة الأفقية، وزر إلغاء يراعي النوتش وأشرطة النظام.
 * - إدارة محكمة لجلسات الكاميرا لمنع الجلسات المتزامنة أو تسرب الـ Streams المتأخرة،
 *   مع إيقاف مسارات الوسائط فوراً عند الانتهاء أو الإلغاء أو الفشل.
 */

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import jsQR from "jsqr";

export interface InlineQrScannerProps {
  /** يُستدعى مرة واحدة فقط عند قراءة رمز ناجح (بعد إيقاف الكاميرا). */
  onCode: (raw: string) => void;
  /** إلغاء المسح وإغلاق الكاميرا. */
  onCancel: () => void;
  /** نص إرشادي اختياري. */
  hint?: string;
}

/** معرّف رقمي فريد للجلسة الحالية النشطة */
let activeSessionToken = 0;
/** دالة إيقاف عامة لأي ماسح نشط عبر التطبيق لمنع الجلسات المتزامنة */
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
    // 1. إيقاف وإلغاء أي جلسة سابقة كانت نشطة أو قيد الانتظار فوراً
    if (globalStopActiveScanner) {
      try {
        globalStopActiveScanner();
      } catch {
        /* ignore */
      }
      globalStopActiveScanner = null;
    }

    // توليد رمز جلسة جديد فريد لهذه الدورة
    const sessionToken = ++activeSessionToken;
    let isCancelled = false;
    let tries = 0;
    let timerId: number | null = null;

    const stopStream = () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
        timerId = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          try {
            track.stop();
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

    // تسجيل دالة الإلغاء العالمية لهذه الجلسة بالتحديد
    globalStopActiveScanner = () => {
      isCancelled = true;
      stopStream();
    };

    const tick = () => {
      if (isCancelled || sessionToken !== activeSessionToken || doneRef.current) {
        return;
      }
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
        // إلغاء الجلسة لمنع أي إطارات إضافية
        activeSessionToken++;
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
      // أولاً: فحص ماسح الباركود الأصلي (Capacitor) إن كان متاحاً
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
          // في حال إلغاء الجلسة أثناء عمل الماسح الأصلي
          if (isCancelled || sessionToken !== activeSessionToken) return;

          if (res?.hasContent && res.content && !doneRef.current) {
            doneRef.current = true;
            activeSessionToken++;
            stopStream();
            onCode(res.content);
            return;
          } else {
            // المستخدم ألغى المسح من الواجهة الأصلية: نغلق بدون التحول لكاميرا الويب
            stopStream();
            onCancel();
            return;
          }
        } catch (err: unknown) {
          if (isCancelled || sessionToken !== activeSessionToken) return;
          const msg = err instanceof Error ? err.message : String(err);
          // إذا كان الخطأ ناتجاً عن إلغاء المستخدم
          if (
            msg.toLowerCase().includes("cancel") ||
            msg.toLowerCase().includes("dismiss") ||
            msg.toLowerCase().includes("closed")
          ) {
            stopStream();
            onCancel();
            return;
          }
          // في حال عدم توفر الإضافة الأصلية نكمل بـ getUserMedia
        }
      }

      // ثانياً: تشغيل كاميرا getUserMedia بدون قيود دقة إجبارية قد تمنع بعض الهواتف
      const constraintsList: MediaStreamConstraints[] = [
        {
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        {
          video: {
            facingMode: { ideal: "environment" },
          },
        },
        {
          video: true,
        },
      ];

      let stream: MediaStream | null = null;
      let lastErr: unknown = null;

      for (const constraints of constraintsList) {
        if (isCancelled || sessionToken !== activeSessionToken) return;
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          break;
        } catch (err) {
          lastErr = err;
        }
      }

      // تحقق حاسم: هل تم إلغاء الجلسة أثناء انتظار وصول الـ MediaStream؟
      if (isCancelled || sessionToken !== activeSessionToken) {
        if (stream) {
          stream.getTracks().forEach((track) => {
            try {
              track.stop();
            } catch {
              /* ignore */
            }
          });
        }
        return;
      }

      if (!stream) {
        stopStream();
        const name = lastErr instanceof Error ? lastErr.name : "";
        setError(
          name === "NotAllowedError" || name === "SecurityError"
            ? "تم رفض إذن الكاميرا — امنح التطبيق الإذن من إعدادات النظام أو أدخل الرمز يدوياً"
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "لا توجد كاميرا متاحة على هذا الجهاز — أدخل الرمز يدوياً"
              : "تعذر تشغيل الكاميرا — أدخل الرمز يدوياً",
        );
        return;
      }

      streamRef.current = stream;

      // انتظار استقرار العنصر في الـ DOM
      await new Promise((r) => window.setTimeout(r, 40));
      if (isCancelled || sessionToken !== activeSessionToken || !videoRef.current) {
        stopStream();
        return;
      }

      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => {});
      tick();
    };

    void start();

    return () => {
      isCancelled = true;
      activeSessionToken++;
      stopStream();
      if (globalStopActiveScanner) {
        globalStopActiveScanner = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCancelClick = () => {
    activeSessionToken++;
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
        width: "100vw",
        height: "100vh",
        minWidth: "100%",
        minHeight: "100%",
        zIndex: 99999,
        background: "#000",
        overflow: "hidden",
      }}
      className="ikout-qr-scanner-portal"
      role="dialog"
      aria-modal="true"
      aria-label="مسح رمز QR"
    >
      {/* فيديو الكاميرا بملء الشاشة الحقيقي مع تغطية كاملة */}
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
          padding: "max(12px, env(safe-area-inset-top, 12px)) 16px 12px",
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

      {/* زر إلغاء المسح مع مراعاة كاملة لأشرطة النظام والنوتش */}
      <button
        type="button"
        onClick={handleCancelClick}
        aria-label="إلغاء المسح"
        style={{
          position: "absolute",
          top: "max(16px, env(safe-area-inset-top, 16px))",
          right: "max(16px, env(safe-area-inset-right, 16px))",
          width: "clamp(44px, 7vmin, 54px)",
          height: "clamp(44px, 7vmin, 54px)",
          borderRadius: "50%",
          border: "2px solid rgba(77,243,255,0.6)",
          background: "linear-gradient(135deg, rgba(60,188,255,0.4), rgba(14,134,224,0.65))",
          boxShadow: "0 2px 14px rgba(10,90,156,0.5)",
          cursor: "pointer",
          display: "grid",
          placeItems: "center",
          padding: 0,
          zIndex: 100,
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

      {/* رسالة الخطأ دون تجميد الشاشة مع زر للعودة للإدخال اليدوي */}
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
            zIndex: 110,
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
