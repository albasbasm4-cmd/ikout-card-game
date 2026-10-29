import { ClientOnly, createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Camera } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  component: () => <ClientOnly><div className="uno-app"><Join /></div></ClientOnly>,
});

function Join() {
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const activeStream = useRef<MediaStream | null>(null);
  useEffect(() => () => { activeStream.current?.getTracks().forEach((t) => t.stop()); activeStream.current = null; }, []);

  const join = (c = code) => {
    const v = c.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(v)) { toast.error("رمز غير صحيح: الرمز 6 أحرف أو أرقام"); return; }
    toast.error("الغرفة غير متاحة: اللعب عبر الأجهزة لم يُفعّل بعد في هذه النسخة");
  };

  const scan = async () => {
    type BD = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
    const Ctor = (window as unknown as { BarcodeDetector?: new (o: object) => BD }).BarcodeDetector;
    if (!Ctor) { toast.error("متصفحك لا يدعم قراءة QR — اكتب الرمز يدوياً"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      activeStream.current?.getTracks().forEach((t) => t.stop());
      activeStream.current = stream;
      setScanning(true);
      await new Promise((r) => setTimeout(r, 50));
      if (!video.current) { stream.getTracks().forEach((t) => t.stop()); return; }
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
    } catch { activeStream.current?.getTracks().forEach((t) => t.stop()); activeStream.current = null; toast.error("تعذر فتح الكاميرا"); setScanning(false); }
  };

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 py-8">
      <Link to="/uno/room" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowRight className="h-4 w-4" /> رجوع</Link>
      <h1 className="mt-3 font-display text-4xl text-accent">الانضمام لغرفة</h1>
      <div className="mt-6 flex gap-2">
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="رمز الغرفة" maxLength={6} dir="ltr" className="h-12 text-center text-xl tracking-widest uppercase" />
        <Button size="icon" variant="secondary" className="h-12 w-12" aria-label="مسح QR" onClick={scan}><Camera /></Button>
      </div>
      <Button className="mt-3 h-12 w-full" onClick={() => join()}>انضمام</Button>
      {scanning && <video ref={video} className="mt-4 w-full rounded-xl" muted playsInline />}
    </main>
  );
}
