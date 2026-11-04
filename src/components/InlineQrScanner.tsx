/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * InlineQrScanner — كاميرا مسح رمز QR بملء الشاشة دون أي واجهة إضافية:
 * تفتح الكاميرا بحجم الشاشة كاملاً وتقرأ الرمز مباشرة، مع زر رجوع أزرق
 * يعيد اللاعب إلى شاشة إنشاء/الانضمام الغرفة. تستخدمها الألعاب الأربعة بنفس الشكل.
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

export const InlineQrScanner: React.FC<InlineQrScannerProps> = ({
  onCode,
  onCancel,
  hint = "وجّه الكاميرا نحو رمز الغرفة",
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** يمنع تمرير أكثر من رمز (مثلاً رمزين متتاليين في نفس اللقطة). */
  const doneRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let tries = 0;

    const stopStream = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    const tick = async () => {
      if (cancelled || doneRef.current) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0) {
        window.setTimeout(tick, 100);
        return;
      }
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        setError("تعذر تشغيل محلل الرمز — اكتب الرمز يدوياً");
        stopStream();
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
        setError("لم يُعثر على رمز QR — أقرب الرمز أكثر أو أدخله يدوياً");
        return;
      }
      window.setTimeout(tick, 66);
    };

    const start = async () => {
      // أولاً: ماسح الكاميرا الأصلي (Capacitor) إن كان متاحاً — أسرع على أندرويد
      const win = window as unknown as {
        Capacitor?: { Plugins?: { BarcodeScanner?: { startScan(): Promise<{ hasContent: boolean; content?: string }> } } };
      };
      if (win.Capacitor?.Plugins?.BarcodeScanner) {
        try {
          await win.Capacitor.Plugins.BarcodeScanner.startScan().then((res) => {
            if (res?.hasContent && res.content && !doneRef.current) {
              doneRef.current = true;
              onCode(res.content);
            }
          });
          return;
        } catch {
          // نكمل بكاميرا الويب
        }
      }

      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
          });
        } catch {
          // بعض الأجهزة ترفض قيود facingMode: نجرّب الكاميرا الافتراضية
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        // نمنح الفيديو دورة تحديث ثم نشغّله
        await new Promise((r) => window.setTimeout(r, 50));
        if (!videoRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
        void tick();
      } catch (err: unknown) {
        if (cancelled) return;
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 120,
        background: "#000",
        overflow: "hidden",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="مسح رمز QR"
    >
      <video
        ref={videoRef}
        playsInline
        muted
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
      />
      {/* إطار التسديد في المنتصف */}
      <div
        aria-hidden
        style={{
          pointerEvents: "none",
          position: "absolute",
          inset: "6%",
          border: "3px solid rgba(255,255,255,0.9)",
          borderRadius: 20,
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          padding: "10px 16px",
          textAlign: "center",
          fontWeight: 800,
          color: "#fff",
          fontSize: "clamp(12px, 2.2vh, 20px)",
          background: "rgba(0,0,0,0.45)",
          pointerEvents: "none",
        }}
      >
        {hint}
      </div>
      {/* زر الرجوع: نفس الشكل الأزرق المستخدم في كل أيقونات التطبيق */}
      <button
        type="button"
        onClick={() => {
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          onCancel();
        }}
        aria-label="رجوع"
        style={{
          position: "absolute",
          top: "clamp(10px, 2.5vmin, 20px)",
          right: "clamp(12px, 2.5vmin, 24px)",
          width: "clamp(44px, 7vmin, 56px)",
          height: "clamp(44px, 7vmin, 56px)",
          borderRadius: "50%",
          border: "2px solid rgba(77,243,255,.45)",
          background: "linear-gradient(135deg,rgba(60,188,255,.25),rgba(14,134,224,.45))",
          boxShadow: "0 2px 10px rgba(10,90,156,.35)",
          cursor: "pointer",
          display: "grid",
          placeItems: "center",
          padding: 0,
          zIndex: 2,
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="55%"
          height="55%"
          fill="none"
          stroke="#fff"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "10%",
            textAlign: "center",
            background: "rgba(0,0,0,0.78)",
            color: "#ffb4ae",
            fontWeight: 800,
            fontSize: "clamp(12px, 2.4vh, 22px)",
          }}
        >
          {error}
        </div>
      )}
    </div>,
    document.body,
  );
};

export default InlineQrScanner;
