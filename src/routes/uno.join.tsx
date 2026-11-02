import { ClientOnly, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Camera } from "lucide-react";
import { toast } from "sonner";
import { characterFace, useProfile } from "@/utils/profile";
import { useSettings } from "@/store/useSettings";
import { useStageFit } from "@/hooks/use-stage-fit";
import { ProfileEditor } from "@/components/ProfileEditor";
import { CitySkyline, Clouds } from "@/components/HomeScreen";
import { playTapSound } from "@/utils/audio";
import { connectUnoClient, disconnectUnoClient } from "@/lib/uno/unoNet";
import jsQR from "jsqr";
import "@/components/uno/lobby.css";

export const Route = createFileRoute("/uno/join")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "iKout — أونو — الانضمام لغرفة" },
      { name: "description", content: "ادخل رمز غرفة أونو أو امسح رمز QR للانضمام." },
      { property: "og:title", content: "أونو — الانضمام لغرفة" },
      { property: "og:description", content: "انضم إلى غرفة أونو برمز أو QR." },
    ],
  }),
  component: () => (
    <ClientOnly>
      <Join />
    </ClientOnly>
  ),
});

export interface JoinProps {
  onBack?: () => void;
}

export function Join({ onBack }: JoinProps = {}) {
  const nav = useNavigate();
  const { settings } = useSettings();
  const profile = useProfile();
  const stage = useRef<HTMLDivElement>(null);
  useStageFit(stage, 1536, 691, settings.orientationPreference);
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const activeStream = useRef<MediaStream | null>(null);
  /** هل دخلنا شاشة اللعب؟ لا نقطع الاتصال حينها. */
  const enteredPlay = useRef(false);

  useEffect(
    () => () => {
      activeStream.current?.getTracks().forEach((t) => t.stop());
      activeStream.current = null;
      if (!enteredPlay.current) disconnectUnoClient();
    },
    [],
  );

  const goLobby = () => {
    playTapSound();
    if (onBack) onBack();
    else nav({ to: "/uno" });
  };

  const join = async (c = code) => {
    const v = c.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,6}$/.test(v)) {
      toast.error("رمز غير صحيح: الرمز يتكون من 4 إلى 6 أحرف أو أرقام");
      return;
    }
    toast.info("جارِ البحث عن المضيف عبر نقطة الاتصال…");
    const ok = await connectUnoClient({ code: v, name: profile.name || "لاعب" });
    if (!ok) {
      toast.error(
        "تعذر الاتصال بالمضيف — تأكد أن المضيف فتح غرفة أونو وأن الجهازين على نفس الشبكة",
      );
      return;
    }
    toast.success("تم الاتصال بالمضيف بنجاح");
    enteredPlay.current = true;
    sessionStorage.setItem("uno_active_room", JSON.stringify({ code: v, role: "client" }));
    nav({ to: "/uno/play" });
  };

  const scan = async () => {
    type BD = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
    const Ctor = (window as unknown as { BarcodeDetector?: new (o: object) => BD }).BarcodeDetector;
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("الكاميرا غير مدعومة على هذا الجهاز — اكتب الرمز يدوياً");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      activeStream.current?.getTracks().forEach((t) => t.stop());
      activeStream.current = stream;
      setScanning(true);
      await new Promise((r) => setTimeout(r, 50));
      if (!video.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.current.srcObject = stream;
      await video.current.play();

      if (Ctor) {
        const det = new Ctor({ formats: ["qr_code"] });
        const tick = async () => {
          if (!video.current || activeStream.current !== stream) return;
          const res = await det.detect(video.current).catch(() => []);
          const hit = res.find(
            (r) =>
              r.rawValue.startsWith("uno-room:") ||
              r.rawValue.includes("game=uno") ||
              /^[A-Z0-9]{4,6}$/i.test(r.rawValue),
          );
          if (hit) {
            stream.getTracks().forEach((t) => t.stop());
            setScanning(false);
            let c = hit.rawValue;
            if (c.startsWith("uno-room:")) c = c.slice(9);
            else if (c.includes("room=")) {
              try {
                const u = new URL(c);
                c = u.searchParams.get("room") || c;
              } catch {
                // keep c
              }
            }
            setCode(c);
            join(c);
          } else {
            requestAnimationFrame(tick);
          }
        };
        tick();
      } else {
        // لا يوجد BarcodeDetector في WebView الأندرويد: تحليل الإطارات محلياً بـ jsQR
        toast.info("وجه الكاميرا نحو الرمز");
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          toast.error("تعذر تشغيل محلل الرمز — اكتب الرمز يدوياً");
          setScanning(false);
          return;
        }
        let tries = 0;
        const jsTick = async () => {
          if (!video.current || activeStream.current !== stream) return;
          if (video.current.readyState >= 2 && video.current.videoWidth > 0) {
            canvas.width = video.current.videoWidth;
            canvas.height = video.current.videoHeight;
            ctx.drawImage(video.current, 0, 0);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const found = jsQR(img.data, img.width, img.height, {
              inversionAttempts: "dontInvert",
            });
            if (found?.data) {
              let c = found.data;
              if (c.startsWith("uno-room:")) c = c.slice(9);
              else if (c.includes("room=")) {
                try {
                  const u = new URL(c);
                  c = u.searchParams.get("room") || c;
                } catch {
                  // keep c
                }
              }
              stream.getTracks().forEach((t) => t.stop());
              setScanning(false);
              setCode(c);
              void join(c);
              return;
            }
          }
          if (++tries > 600) {
            stream.getTracks().forEach((t) => t.stop());
            setScanning(false);
            toast.error("لم يُعثر على رمز QR — أقرب الرمز أكثر أو أدخله يدوياً");
            return;
          }
          setTimeout(jsTick, 66);
        };
        void jsTick();
      }
    } catch {
      activeStream.current?.getTracks().forEach((t) => t.stop());
      activeStream.current = null;
      toast.error("يرجى منح إذن الكاميرا لمسح الرمز أو إدخاله يدوياً");
      setScanning(false);
    }
  };

  return (
    <main className="uno-lobby" dir="rtl">
      <div id="rscr" ref={stage}>
        <Clouds />
        <CitySkyline />
        <div className="ksun" />
        <div className="ik-gd" />
        <button id="kback" aria-label="رجوع إلى لوبي أونو" onClick={goLobby}>
          <ArrowRight />
        </button>
        <div
          id="kprof"
          role="button"
          tabIndex={0}
          aria-label="الملف الشخصي"
          onClick={() => setProfileOpen(true)}
          onKeyDown={(e) => e.key === "Enter" && setProfileOpen(true)}
        >
          <div className="kav2">
            <img src={characterFace(profile.characterId)} alt="" />
          </div>
          <div className="kun">{profile.name}</div>
        </div>
        <div id="kr" className="join">
          <div id="ttl">الانضمام لغرفة</div>
          <div id="kjv">
            <div className="kjp">
              <div className="kjl">أدخل رمز الغرفة</div>
              <input
                id="ci"
                dir="ltr"
                maxLength={6}
                placeholder="• • • • •"
                autoComplete="off"
                aria-label="رمز الغرفة"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && join()}
              />
              <button className="kb kr2" onClick={() => join()}>
                <span>انضمام</span>
              </button>
              <div className="kor">— أو —</div>
              <button className="kb kbl" onClick={scan}>
                <Camera className="inline-block ml-1 h-5 w-5" />
                <span>مسح رمز QR</span>
              </button>
              {scanning && (
                <div className="relative mt-2 flex flex-col items-center">
                  <video
                    ref={video}
                    className="kscan rounded-lg border-2 border-white/20"
                    muted
                    playsInline
                  />
                  <button
                    className="mt-2 text-xs text-white/70 hover:text-white"
                    onClick={() => {
                      activeStream.current?.getTracks().forEach((t) => t.stop());
                      activeStream.current = null;
                      setScanning(false);
                    }}
                  >
                    إلغاء المسح
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        {profileOpen && <ProfileEditor onClose={() => setProfileOpen(false)} />}
      </div>
    </main>
  );
}
