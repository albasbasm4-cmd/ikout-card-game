import { ClientOnly, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { characterFace, useProfile } from "@/utils/profile";
import { useSettings } from "@/store/useSettings";
import { useStageFit } from "@/hooks/use-stage-fit";
import { ProfileEditor } from "@/components/ProfileEditor";
import { CitySkyline, Clouds } from "@/components/HomeScreen";
import { playTapSound } from "@/utils/audio";
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

/**
 * شاشة الانضمام لغرفة أونو — مسرح أفقي 1536×691 مطابق لهوية لوبي أونو.
 * زر الرجوع يعود دائماً إلى لوبي أونو مباشرة (/uno) وليس شاشة إنشاء الغرفة.
 */
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
  useEffect(
    () => () => {
      activeStream.current?.getTracks().forEach((t) => t.stop());
      activeStream.current = null;
    },
    [],
  );

  const goLobby = () => {
    playTapSound();
    if (onBack) onBack();
    else nav({ to: "/uno" });
  };

  const join = (c = code) => {
    const v = c.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(v)) {
      toast.error("رمز غير صحيح: الرمز 6 أحرف أو أرقام");
      return;
    }
    // Connect via Hotspot or local room
    toast.success("جاري الانضمام إلى غرفة أونو...");
    // Save joined room info
    sessionStorage.setItem("uno_active_room", JSON.stringify({ code: v, role: "client" }));
    nav({ to: "/uno/play" });
  };

  const scan = async () => {
    type BD = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
    const Ctor = (window as unknown as { BarcodeDetector?: new (o: object) => BD }).BarcodeDetector;
    if (!Ctor) {
      toast.error("متصفحك لا يدعم قراءة QR — اكتب الرمز يدوياً");
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
      const det = new Ctor({ formats: ["qr_code"] });
      const tick = async () => {
        if (!video.current || activeStream.current !== stream) return;
        const res = await det.detect(video.current).catch(() => []);
        const hit = res.find((r) => r.rawValue.startsWith("uno-room:"));
        if (hit) {
          stream.getTracks().forEach((t) => t.stop());
          setScanning(false);
          const c = hit.rawValue.slice(9);
          setCode(c);
          join(c);
        } else requestAnimationFrame(tick);
      };
      tick();
    } catch {
      activeStream.current?.getTracks().forEach((t) => t.stop());
      activeStream.current = null;
      toast.error("تعذر فتح الكاميرا");
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
                <span>📷 مسح رمز QR</span>
              </button>
              {scanning && <video ref={video} className="kscan" muted playsInline />}
            </div>
          </div>
        </div>
        {profileOpen && <ProfileEditor onClose={() => setProfileOpen(false)} />}
      </div>
    </main>
  );
}
