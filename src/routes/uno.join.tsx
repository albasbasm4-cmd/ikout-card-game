/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * شاشة الانضمام لغرفة أونو: إدخال الرمز أو مسح QR ثم الانتقال
 * مباشرة إلى غرفة المضيف (رؤية المكان داخل الغرفة قبل بدء المباراة)
 * دون أي واجهة إضافية.
 */

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
import { InlineQrScanner } from "@/components/InlineQrScanner";
import {
  connectUnoClient,
  disconnectUnoClient,
  getUnoNetClient,
  onUnoClientSeats,
  onUnoClientState,
} from "@/lib/uno/unoNet";
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

/** تطبيع الرمز المقروء من QR: uno-room:CODE أو URL فيه room= أو رمز خام. */
function normalizeScannedCode(raw: string): string {
  let c = raw.trim();
  if (c.startsWith("uno-room:")) c = c.slice("uno-room:".length);
  else if (c.includes("room=")) {
    try {
      const u = new URL(c);
      c = u.searchParams.get("room") || c;
    } catch {
      // keep c
    }
  }
  return c.trim().toUpperCase();
}

export function Join({ onBack }: JoinProps = {}) {
  const nav = useNavigate();
  const { settings } = useSettings();
  const profile = useProfile();
  const stage = useRef<HTMLDivElement>(null);
  useStageFit(stage, 1536, 691, settings.orientationPreference);
  const [code, setCode] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  /** تم الاتصال بالمضيف: نعرض غرفة المضيف مباشرة — دون أي واجهة إضافية. */
  const [connected, setConnected] = useState(false);
  const [connectedCode, setConnectedCode] = useState("");
  const [seats, setSeats] = useState<(string | null)[]>([]);
  const [mySeat, setMySeat] = useState(0);
  const [joining, setJoining] = useState(false);
  /** هل دخلنا شاشة اللعب؟ لا نقطع الاتصال حينها. */
  const enteredPlay = useRef(false);

  useEffect(
    () => () => {
      if (!enteredPlay.current) disconnectUnoClient();
    },
    [],
  );

  // بعد الاتصال: اشترك في مقاعد الغرفة (غرفة المضيف) وانتقل تلقائياً عند بدء المباراة
  useEffect(() => {
    if (!connected) return;
    const cl = getUnoNetClient();
    if (cl) setMySeat(cl.mySeat);
    const offSeats = onUnoClientSeats((arr) => setSeats(arr));
    const offState = onUnoClientState((st) => {
      if (!enteredPlay.current && st) {
        enteredPlay.current = true;
        sessionStorage.setItem(
          "uno_active_room",
          JSON.stringify({ code: cl?.code ?? code.trim().toUpperCase(), role: "client" }),
        );
        nav({ to: "/uno/play" });
      }
    });
    return () => {
      offSeats();
      offState();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

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
    setJoining(true);
    toast.info("جارِ الاتصال بالمضيف…");
    const ok = await connectUnoClient({ code: v, name: profile.name || "لاعب" });
    setJoining(false);
    if (!ok) {
      toast.error(
        "تعذر الاتصال بالمضيف — تأكد أن المضيف فتح غرفة أونو وأن الجهازين على نفس الشبكة",
      );
      return;
    }
    toast.success("تم الاتصال بالمضيف بنجاح");
    setConnectedCode(v);
    setConnected(true);
  };

  const handleScanned = (raw: string) => {
    const c = normalizeScannedCode(raw);
    if (!c) {
      toast.error("رمز غير صالح في رمز QR");
      setScannerOpen(false);
      return;
    }
    setCode(c);
    setScannerOpen(false);
    void join(c);
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
        {connected ? (
          <div id="kr">
            <div id="ttl">غرفة المضيف</div>
            <div id="kjv">
              <div className="kjp">
                <div className="kjl">رمز الغرفة: {connectedCode}</div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    gap: 8,
                    margin: "12px 0",
                    minHeight: 72,
                  }}
                >
                  {(seats.length ? seats : [null]).map((n, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 4,
                        minWidth: 84,
                        padding: "8px 10px",
                        borderRadius: 12,
                        border:
                          i === mySeat ? "2px solid #f5b942" : "1px solid rgba(255,255,255,0.18)",
                        background:
                          n || i === mySeat ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.18)",
                      }}
                    >
                      <div style={{ fontSize: "clamp(11px, 2vh, 16px)", fontWeight: 800 }}>
                        {i === mySeat ? "أنت" : n || "مقعد فارغ"}
                      </div>
                      {n && i !== mySeat && (
                        <div style={{ fontSize: "clamp(10px, 1.7vh, 14px)", opacity: 0.8 }}>
                          {n}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="kjl" style={{ opacity: 0.9 }}>
                  في انتظار بدء المباراة من المضيف…
                </div>
                <button className="kb kbl" style={{ marginTop: 10 }} onClick={goLobby}>
                  <span>خروج من الغرفة</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
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
                  onKeyDown={(e) => e.key === "Enter" && !joining && join()}
                />
                <button className="kb kr2" onClick={() => join()} disabled={joining}>
                  <span>انضمام</span>
                </button>
                <div className="kor">— أو —</div>
                <button className="kb kbl" onClick={() => setScannerOpen(true)}>
                  <Camera className="inline-block ml-1 h-5 w-5" />
                  <span>مسح رمز QR</span>
                </button>
              </div>
            </div>
          </div>
        )}
        {scannerOpen && (
          <InlineQrScanner
            hint="وجّه الكاميرا نحو رمز غرفة أونو"
            onCode={handleScanned}
            onCancel={() => setScannerOpen(false)}
          />
        )}
        {profileOpen && <ProfileEditor onClose={() => setProfileOpen(false)} />}
      </div>
    </main>
  );
}
