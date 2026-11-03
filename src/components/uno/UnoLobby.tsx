import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Camera, ChevronLeft, ChevronRight, Globe, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProfileEditor } from "@/components/ProfileEditor";
import { newGame, type Difficulty } from "@/lib/uno/engine";
import { clearGame, loadGame, saveGame } from "@/lib/uno/storage";
import { BOT_NAMES } from "@/lib/uno/names";
import { characterFace, useProfile } from "@/utils/profile";
import { useSettings } from "@/store/useSettings";
import { useStageFit } from "@/hooks/use-stage-fit";
import { connectUnoClient, disconnectUnoClient } from "@/lib/uno/unoNet";
import { toast } from "sonner";
import jsQR from "jsqr";
import { CitySkyline, Clouds } from "@/components/HomeScreen";
import "./lobby.css";

const LEVELS: Difficulty[] = ["easy", "medium", "hard"];
const LABELS = ["سهل", "متوسط", "صعب"];
export interface UnoLobbyProps {
  onBack?: () => void;
  onStartPlay?: () => void;
  onCreateRoom?: () => void;
  onJoinRoom?: (code: string) => void;
}

export default function UnoLobby({
  onBack,
  onStartPlay,
  onCreateRoom,
  onJoinRoom,
}: UnoLobbyProps = {}) {
  const nav = useNavigate();
  const profile = useProfile();
  const { settings } = useSettings();
  const stage = useRef<HTMLDivElement>(null);
  useStageFit(stage, 2400, 1080, settings.orientationPreference);
  const [players, setPlayers] = useState(4);
  const [level, setLevel] = useState(1);
  const [hasSave, setHasSave] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const joinRoomRef = useRef<((code: string) => Promise<void>) | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);
  useEffect(() => {
    if (!scanning || !videoRef.current || !streamRef.current) return;
    let cancelled = false;
    let tries = 0;
    const video = videoRef.current;
    const stream = streamRef.current;
    const tick = () => {
      if (cancelled || streamRef.current !== stream) return;
      if (video.readyState >= 2 && video.videoWidth > 0) {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const found = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
          if (found?.data) {
            let value = found.data;
            if (value.startsWith("uno-room:")) value = value.slice(9);
            else if (value.includes("room=")) {
              try { value = new URL(value).searchParams.get("room") || value; } catch { /* keep raw */ }
            }
            stopScanner();
            setJoinCode(value.trim().toUpperCase());
            void joinRoomRef.current?.(value);
            return;
          }
        }
      }
      if (++tries > 600) {
        stopScanner();
        toast.error("لم يُعثر على رمز QR؛ أدخل الرمز يدوياً");
        return;
      }
      window.setTimeout(tick, 70);
    };
    const stopScanner = () => {
      stream.getTracks().forEach((track) => track.stop());
      if (streamRef.current === stream) streamRef.current = null;
      setScanning(false);
    };
    void tick();
    return () => { cancelled = true; };
  }, [scanning]);
  useEffect(() => {
    const s = loadGame();
    setHasSave(!!s && s.status !== "matchOver");
  }, []);
  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  };
  const joinRoom = async (rawCode = joinCode) => {
    const code = rawCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,6}$/.test(code)) {
      toast.error("رمز غير صحيح: أدخل من 4 إلى 6 أحرف أو أرقام");
      return;
    }
    toast.info("جارِ الاتصال بالغرفة…");
    const connected = await connectUnoClient({ code, name: profile.name || "لاعب" });
    if (!connected) {
      toast.error("تعذر الاتصال بالمضيف؛ تأكد من فتح الغرفة والاتصال بالشبكة نفسها");
      return;
    }
    sessionStorage.setItem("uno_active_room", JSON.stringify({ code, role: "client" }));
    setJoinOpen(false);
    if (onJoinRoom) onJoinRoom(code);
    else nav({ to: "/uno/play" });
  };
  joinRoomRef.current = joinRoom;
  const openScanner = async () => {
    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setScanning(true);
      await new Promise((resolve) => window.setTimeout(resolve, 50));
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      toast.error("تعذر تشغيل الكاميرا؛ أدخل الرمز يدوياً");
      stopCamera();
    }
  };
  const start = () => {
    clearGame();
    saveGame(
      newGame(
        [
          { name: profile.name || "أنت", isBot: false, difficulty: "easy" },
          ...Array.from({ length: players - 1 }, (_, i) => ({
            name: BOT_NAMES[i] ?? `بوت ${i + 1}`,
            isBot: true,
            difficulty: LEVELS[level],
          })),
        ],
        "bots",
      ),
    );
    if (onStartPlay) onStartPlay();
    else nav({ to: "/uno/play" });
  };
  return (
    <main className="uno-lobby" dir="rtl">
      <div id="st" ref={stage}>
        <div className="uno-lobby-scenery">
          <Clouds />
          <CitySkyline />
        </div>
        <Button
          id="prof"
          variant="ghost"
          aria-label="خيارات اللاعب"
          onClick={() => setProfileOpen(true)}
        >
          <div className="av">
            <img src={characterFace(profile.characterId)} alt="" />
          </div>
          <span className="un">{profile.name}</span>
        </Button>
        <Button
          id="back"
          variant="ghost"
          aria-label="رجوع"
          onClick={() => {
            if (onBack) onBack();
            else nav({ to: "/" });
          }}
        >
          <ArrowRight />
        </Button>
        <div id="card">
          <div className="hd">تدريب</div>
          <div className="bd">
            <div className="rp">
              <div className="rq">الإعدادات المختارة</div>
              <div className="rb">
                <div className="inf-row">
                  <span className="inf-lbl">اللاعبون:</span>
                  <b className="inf-val">{players}</b>
                </div>
                <div className="inf-bot">
                  البوت: <em>{LABELS[level]}</em>
                </div>
              </div>
              <Button className="btn red" onClick={start}>
                مباراة جديدة
              </Button>
            </div>
            <div className="col">
              <div className="lb" style={{ top: 4 }}>
                اللاعبين:
              </div>
              <div className="sp" style={{ top: 40 }}>
                <Button
                  className="ab l"
                  aria-label="تقليل اللاعبين"
                  disabled={players <= 2}
                  onClick={() => setPlayers((p) => p - 1)}
                >
                  <ChevronLeft />
                </Button>
                <div className="nm">{players}</div>
                <Button
                  className="ab r"
                  aria-label="زيادة اللاعبين"
                  disabled={players >= 10}
                  onClick={() => setPlayers((p) => p + 1)}
                >
                  <ChevronRight />
                </Button>
              </div>
              <div className="lb" style={{ top: 118 }}>
                مستوى البوتات:
              </div>
              <div className="sp" style={{ top: 154 }}>
                <Button
                  className="ab l"
                  aria-label="مستوى أسهل"
                  disabled={level === 0}
                  onClick={() => setLevel((l) => l - 1)}
                >
                  <ChevronLeft />
                </Button>
                <div className="nm t">{LABELS[level]}</div>
                <Button
                  className="ab r"
                  aria-label="مستوى أصعب"
                  disabled={level === 2}
                  onClick={() => setLevel((l) => l + 1)}
                >
                  <ChevronRight />
                </Button>
              </div>
              <Button className="btn nb" onClick={start}>
                ابدأ
              </Button>
            </div>
          </div>
        </div>
        <div id="net">
          <div className="hd">لعب مشترك</div>
          <div className="bd">
            <div className="ic">
              <Globe />
            </div>
            <Button
              className="btn red c1"
              onClick={() => {
                if (onCreateRoom) onCreateRoom();
                else nav({ to: "/uno/room" });
              }}
            >
              إنشاء غرفة
            </Button>
            <Button
              className="btn red"
              onClick={() => setJoinOpen(true)}
            >
              الانضمام إلى غرفة
            </Button>
          </div>
        </div>
        {joinOpen && (
          <div className="uno-join-modal" role="dialog" aria-modal="true" aria-label="الانضمام إلى غرفة" onClick={() => { stopCamera(); setJoinOpen(false); }}>
            <div className="uno-join-panel" onClick={(event) => event.stopPropagation()}>
              <button type="button" className="uno-join-close" onClick={() => { stopCamera(); setJoinOpen(false); }} aria-label="إغلاق">×</button>
              <h2>الانضمام إلى غرفة</h2>
              <label htmlFor="uno-room-code">رمز الغرفة</label>
              <input id="uno-room-code" dir="ltr" maxLength={6} value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="AB12CD" />
              <button type="button" className="uno-join-action" onClick={() => void joinRoom()}>انضمام</button>
              <button type="button" className="uno-join-camera" onClick={() => void openScanner()}><Camera size={20} /> مسح QR</button>
              {scanning && <div className="uno-viewfinder"><video ref={videoRef} muted playsInline /><div className="uno-viewfinder-frame"/><button type="button" onClick={stopCamera}>إلغاء المسح</button></div>}
            </div>
          </div>
        )}
        {hasSave && (
          <Button
            className="resume"
            onClick={() => {
              if (onStartPlay) onStartPlay();
              else nav({ to: "/uno/play" });
            }}
          >
            <RotateCcw />
            استئناف المباراة
          </Button>
        )}
        {profileOpen && <ProfileEditor onClose={() => setProfileOpen(false)} />}
      </div>
    </main>
  );
}
