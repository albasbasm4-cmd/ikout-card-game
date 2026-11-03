/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * InlineQrScanner — كاميرا مسح رمز QR تعمل داخل اللعبة دون أي شاشة إضافية:
 * تظهر مباشرة بحجم 80% من الشاشة في المنتصف، وتستخدمها الألعاب الأربع
 * (كوت، 187، أونو، الجوكر) بنفس الشكل.
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
        background: "rgba(0,0,0,0.82)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="مسح رمز QR"
    >
      <div
        style={{
          width: "80%",
          height: "80%",
          position: "relative",
          borderRadius: 24,
          overflow: "hidden",
          border: "3px solid #f5b942",
          background: "#000",
          boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "10px 16px",
            textAlign: "center",
            fontWeight: 800,
            color: "#f5b942",
            fontSize: "clamp(12px, 2.2vh, 20px)",
            background: "rgba(0,0,0,0.6)",
          }}
        >
          {hint}
        </div>
        <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
          <video
            ref={videoRef}
            playsInline
            muted
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
          {/* إطار التسديد في المنتصف */}
          <div
            aria-hidden
            style={{
              pointerEvents: "none",
              position: "absolute",
              inset: "8%",
              border: "2px solid rgba(255,255,255,0.85)",
              borderRadius: 16,
            }}
          />
          {error && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "8%",
                textAlign: "center",
                background: "rgba(0,0,0,0.72)",
                color: "#ffb4ae",
                fontWeight: 800,
                fontSize: "clamp(12px, 2.4vh, 22px)",
              }}
            >
              {error}
            </div>
          )}
        </div>
        <div
          style={{
            padding: "10px 16px 14px",
            display: "flex",
            justifyContent: "center",
            background: "rgba(0,0,0,0.6)",
          }}
        >
          <button
            type="button"
            onClick={() => {
              streamRef.current?.getTracks().forEach((t) => t.stop());
              streamRef.current = null;
              onCancel();
            }}
            style={{
              padding: "10px 34px",
              borderRadius: 14,
              border: "2px solid rgba(245,185,66,0.5)",
              background: "linear-gradient(180deg,#1b2733,#101820)",
              color: "#ffe9c2",
              fontWeight: 900,
              fontSize: "clamp(12px, 2.2vh, 20px)",
              cursor: "pointer",
            }}
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default InlineQrScanner;
