import {
  connectJokerClient,
  disconnectJokerClient,
  getJokerNetClient,
  isJokerHostActive,
  jokerClientSendAct,
  jokerHostNewGame,
  jokerHostPublish,
  onJokerClientState,
  onJokerHostSeats,
  onJokerHostState,
  startJokerHost,
  stopJokerHost,
} from "./jokerNet";
import { NetworkLatencyBadge } from "@/components/NetworkLatencyBadge";
import { useEffect, useRef, useState } from "react";
import { useAppBack } from "@/utils/appBackNav";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Minus,
  Plus,
  Globe,
  Volume2,
  VolumeX,
  BookOpen,
  Home,
  QrCode,
  Wifi,
  Users,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import jsQR from "jsqr";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProfileEditor } from "@/components/ProfileEditor";
import { characterFace, CHARACTER_IDS, useProfile } from "@/utils/profile";
import { useSettings } from "@/store/useSettings";
import { useStageFit } from "@/hooks/use-stage-fit";
import { playCardSound, playWinSound, playLoseSound } from "@/utils/audio";
import { actJoker, createJokerGame, dealJoker, jokerMode, type JokerGame } from "./engine";
import "./styles.css";

// إرشادات اللعب تظهر لكل اللاعبين دون أي نص يكشف حامل الجوكر
const HINTS = [
  "إذا كان عندك الجوكر: لمّح للاعبين دون أن تكشف، وترك لاعباً واحداً أخيراً",
  "إذا لم يكن لديك الجوكر: ركز على أعين اللاعبين، إذا لمّح لك شخص ما أدخل اسمه هنا حتى تنزل بطاقتك وتفوز باللعبة",
  "إذا لم يلمح لك أي شخص: حاول تخمين صاحب الجوكر",
];
export interface JokerAppProps {
  onBack?: () => void;
}

export default function JokerApp({ onBack }: JokerAppProps = {}) {
  const nav = useNavigate();
  const profile = useProfile();
  const { settings, toggleSound } = useSettings();
  const stage = useRef<HTMLDivElement>(null);
  useStageFit(stage, 1536, 691, settings.orientationPreference);
  const [screen, setScreen] = useState<"entry" | "room" | "game">("entry");
  const [count, setCount] = useState(4);
  const [roomCode, setRoomCode] = useState(() =>
    String(Math.floor(100000 + Math.random() * 900000)),
  );
  const [showQr, setShowQr] = useState(false);
  const [game, setGame] = useState<JokerGame | null>(null);
  const [holdingId, setHoldingId] = useState<string | null>(null);
  const [modal, setModal] = useState<"rules" | "pick" | "confirm" | "network" | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const scanVideo = useRef<HTMLVideoElement>(null);
  const scanStream = useRef<MediaStream | null>(null);
  /** دور هذا الجهاز: محلي، مستضيف عبر الشبكة، أو منضم لمضيف بعيد. */
  const [netRole, setNetRole] = useState<"local" | "host" | "client">("local");
  /** أسماء اللاعبين البعيدين الذين انضموا فعلياً (مفتاح = معرّف اللاعب). */
  const [remoteNames, setRemoteNames] = useState<Record<string, string>>({});
  const awarded = useRef<number>(0);
  const netClient = getJokerNetClient();
  const netHostActive = isJokerHostActive();
  const human = netClient ? netClient.myPid : "p0";
  // لاعبون حقيقيون فقط: المضيف + من انضم فعلياً عبر الشبكة — لا بوتات إطلاقاً
  const players = [
    {
      id: "p0",
      name: profile.name || "أنت",
      char: profile.characterId,
      score: 0,
      bot: false,
    },
  ];
  for (let i = 1; i < count; i++) {
    const remoteName = netRole === "local" ? undefined : remoteNames[`p${i}`];
    if (remoteName)
      players.push({
        id: `p${i}`,
        name: remoteName,
        char: CHARACTER_IDS[(i * 5) % CHARACTER_IDS.length],
        score: 0,
        bot: false,
      });
  }
  // لا بداية إلا بأربعة لاعبين حقيقيين على الأقل
  const canStart = players.length >= 4 && players.length <= 15;
  const start = () => {
    if (!canStart) return;
    const g = dealJoker(createJokerGame(players));
    setGame(g);
    setHoldingId(null);
    if (netHostActive) jokerHostNewGame(g);
    setScreen("game");
  };
  const act = (id: string, to?: string) => {
    playCardSound();
    if (netClient) {
      // المنضم: يرسل أمره إلى المضيف والحالة تعود عبر الشبكة
      jokerClientSendAct(id, to);
      return;
    }
    setGame((prev) => {
      const next = prev ? actJoker(prev, id, to) : prev;
      if (next && netHostActive && next !== prev) jokerHostPublish(next);
      return next;
    });
  };
  const doJoin = (v: string) => {
    if (!/^[0-9]{4,6}$/.test(v)) {
      setJoinError("رمز غير صحيح: الرمز يتكون من 4 إلى 6 أرقام");
      return;
    }
    void (async () => {
      setJoining(true);
      setJoinError(null);
      const ok = await connectJokerClient({
        code: v,
        name: profile.name || "لاعب",
      });
      setJoining(false);
      if (!ok) {
        setJoinError(
          "تعذر الاتصال بالمضيف — تأكد أن المضيف فتح غرفة وأن الجهازين على نفس الشبكة، أو أدخل عنوان IP الظاهر على شاشة المضيف",
        );
        return;
      }
      setJoinError(null);
      setRoomCode(v);
      setNetRole("client");
      setModal(null);
      setScreen("room");
    })();
  };

  const stopScan = () => {
    scanStream.current?.getTracks().forEach((t) => t.stop());
    scanStream.current = null;
    setScanOpen(false);
  };

  const startScan = async () => {
    type BD = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
    const Ctor = (window as unknown as { BarcodeDetector?: new (o: object) => BD }).BarcodeDetector;
    if (!navigator.mediaDevices?.getUserMedia) {
      setJoinError("الكاميرا غير مدعومة على هذا الجهاز — اكتب الرمز يدوياً");
      return;
    }
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }
      scanStream.current?.getTracks().forEach((t) => t.stop());
      scanStream.current = stream;
      setScanOpen(true);
      setJoinError(null);
      await new Promise((r) => setTimeout(r, 50));
      if (!scanVideo.current) {
        stream.getTracks().forEach((t) => t.stop());
        setScanOpen(false);
        return;
      }
      scanVideo.current.srcObject = stream;
      await scanVideo.current.play();

      const handle = (raw: string) => {
        stream.getTracks().forEach((t) => t.stop());
        scanStream.current = null;
        setScanOpen(false);
        const input = document.getElementById("joker-room-input") as HTMLInputElement | null;
        if (input) input.value = raw;
        doJoin(raw);
      };
      const normalize = (c: string) => {
        let x = c.trim();
        if (x.startsWith("joker-room:")) x = x.slice(11);
        else if (x.includes("room=")) {
          try {
            const u = new URL(x);
            x = u.searchParams.get("room") || x;
          } catch {
            // keep x
          }
        }
        return x;
      };
      if (Ctor) {
        const det = new Ctor({ formats: ["qr_code"] });
        const tick = async () => {
          if (!scanVideo.current || scanStream.current !== stream) return;
          const res = await det.detect(scanVideo.current).catch(() => []);
          const hit = res.find(
            (r) =>
              r.rawValue.startsWith("joker-room:") ||
              r.rawValue.includes("room=") ||
              /^[0-9]{4,6}$/.test(r.rawValue),
          );
          if (hit) handle(normalize(hit.rawValue));
          else requestAnimationFrame(tick);
        };
        tick();
      } else {
        // لا يوجد BarcodeDetector في WebView الأندرويد: تحليل الإطارات محلياً بـ jsQR
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          setJoinError("تعذر تشغيل محلل الرمز — اكتب الرمز يدوياً");
          stopScan();
          return;
        }
        let tries = 0;
        const jsTick = async () => {
          if (!scanVideo.current || scanStream.current !== stream) return;
          if (scanVideo.current.readyState >= 2 && scanVideo.current.videoWidth > 0) {
            canvas.width = scanVideo.current.videoWidth;
            canvas.height = scanVideo.current.videoHeight;
            ctx.drawImage(scanVideo.current, 0, 0);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const found = jsQR(img.data, img.width, img.height, {
              inversionAttempts: "dontInvert",
            });
            if (found?.data) {
              const v = normalize(found.data);
              if (/^[0-9]{4,6}$/.test(v)) {
                handle(v);
                return;
              }
            }
          }
          if (++tries > 600) {
            stopScan();
            setJoinError("لم يُعثر على رمز QR — أقرب الرمز أكثر أو أدخله يدوياً");
            return;
          }
          setTimeout(jsTick, 66);
        };
        void jsTick();
      }
    } catch (err: unknown) {
      scanStream.current?.getTracks().forEach((t) => t.stop());
      scanStream.current = null;
      setScanOpen(false);
      const name = err instanceof Error ? err.name : "";
      setJoinError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "تم رفض إذن الكاميرا — امنح التطبيق الإذن من إعدادات النظام أو اكتب الرمز يدوياً"
          : "تعذر تشغيل الكاميرا — اكتب الرمز يدوياً",
      );
    }
  };

  // المنضم: يستقبل الحالة من المضيف ويبدأ اللعب تلقائياً عند وصولها
  useEffect(() => {
    if (!netClient) return;
    const off = onJokerClientState((st) => {
      setGame(st);
      setHoldingId(null);
      setModal(null);
      setScreen("game");
    });
    return off;
  }, [netClient]);

  // المضيف: يتبع حالة اللاعبين البعيدين (تتحرك عند أعمالهم على أجهزتهم)
  useEffect(() => {
    if (!netHostActive) return;
    return onJokerHostState((st) => setGame(st));
  }, [netHostActive]);

  // المضيف: أسماء المنضمين لعرضها في لوبي الغرفة
  useEffect(() => {
    if (screen !== "room" || netRole === "client" || netRole === "local") return;
    const off = onJokerHostSeats((names) => setRemoteNames(names));
    return off;
  }, [screen, netRole]);

  useEffect(() => {
    if (game?.phase !== "results" || awarded.current === game.round) return;
    awarded.current = game.round;
    if (game.results.find((r) => r.id === human)?.outcome === "فائز") playWinSound();
    else playLoseSound();
    setModal(null);
  }, [game]);
  const goHome = () => {
    if (onBack) onBack();
    else nav({ to: "/" });
  };
  // التدفق المطلوب: من طاولة الجوكر الزرجوع يعود إلى الشاشة الرئيسية مباشرة،
  // ومن شاشة إعداد المباراة خطوة واحدة إلى شاشة الدخول، ومن الدخول إلى الرئيسية.
  const back = () => {
    setGame(null);
    setModal(null);
    if (netClient) disconnectJokerClient();
    if (netHostActive) void stopJokerHost();
    setNetRole("local");
    setRemoteNames({});
    if (screen === "room") setScreen("entry");
    else goHome();
  };

  // زر الرجوع النظامي يتبع نفس منطق زر الرجوع داخل الجوكر.
  useAppBack(() => back());
  const mode = game ? jokerMode(game, human) : "wait";
  const card = game?.cards[human];
  // أزرار الصوت والقواعد والرئيسية مشتركة بين اللوبي وشاشة اللعب
  const toolButtons = (
    <>
      <Button variant="ghost" size="icon" aria-label="كتم الصوت" onClick={toggleSound}>
        {settings.soundEnabled ? <Volume2 /> : <VolumeX />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="قواعد اللعبة"
        onClick={() => setModal("rules")}
      >
        <BookOpen />
      </Button>
      <Button variant="ghost" size="icon" aria-label="الشاشة الرئيسية" onClick={back}>
        <Home />
      </Button>
    </>
  );
  return (
    <main className="joker-app" dir="rtl">
      <div ref={stage} id="st">
        <div id="scr" className={screen === "game" ? "wood" : ""}>
          <div id="kin">
            {screen !== "game" && (
              <Button id="kback" variant="ghost" aria-label="رجوع" onClick={back}>
                <ArrowRight />
              </Button>
            )}
            {screen === "entry" && (
              <div className="kpg" id="kp1" style={{ display: "block" }}>
                <div className="kc" id="kc2">
                  <div className="kh">الجوكر</div>
                  <div className="kem">
                    <Globe size={210} />
                  </div>
                  <div className="kbt">
                    <Button
                      className="kb kr"
                      onClick={() => {
                        const c = String(Math.floor(100000 + Math.random() * 900000));
                        setRoomCode(c);
                        setNetRole("host");
                        setRemoteNames({});
                        void startJokerHost(c);
                        setScreen("room");
                      }}
                    >
                      <Users className="w-5 h-5 ml-2" />
                      إنشاء غرفة
                    </Button>
                    <Button className="kb kbl" onClick={() => setModal("network")}>
                      <Wifi className="w-5 h-5 ml-2" />
                      الانضمام إلى غرفة
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {screen === "room" && netRole === "client" && (
              <div className="kpg" id="kp2" style={{ display: "block" }}>
                <div id="kr" className="host">
                  <div className="kh flex items-center justify-center gap-3">
                    <span>
                      غرفة الجوكر · رمز الغرفة: <b style={{ color: "#00e5ff" }}>{roomCode}</b>
                    </span>
                  </div>
                  <div className="kd">
                    <div className="ksb kdk" style={{ marginBottom: 16 }}>
                      تم الاتصال بالمضيف — بانتظار بدء المباراة…
                    </div>
                    <Button className="kb kbl" onClick={back}>
                      رجوع
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {screen === "room" && netRole !== "client" && (
              <div className="kpg" id="kp2" style={{ display: "block" }}>
                <div id="kr" className="host">
                  <div className="kh flex items-center justify-center gap-3">
                    <span>
                      غرفة الجوكر · رمز الغرفة: <b style={{ color: "#00e5ff" }}>{roomCode}</b>
                    </span>
                  </div>
                  <div className="kd">
                    <div className="klp">
                      <div className="ksb kdk">
                        <span className="t">اللاعبون</span>
                        <b className="n">{count} / 15</b>
                        <div className="kstp">
                          <Button
                            className="kchip"
                            disabled={count === 4}
                            aria-label="تقليل المقاعد"
                            onClick={() => setCount((c) => c - 1)}
                          >
                            <Minus />
                          </Button>
                          <span>المقاعد</span>
                          <Button
                            className="kchip"
                            disabled={count === 15}
                            aria-label="زيادة المقاعد"
                            onClick={() => setCount((c) => c + 1)}
                          >
                            <Plus />
                          </Button>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "12px", width: "100%" }}>
                        <Button
                          type="button"
                          className="kb kbl"
                          style={{ flex: 1 }}
                          onClick={() => setShowQr(true)}
                        >
                          <QrCode className="w-5 h-5 ml-2" />
                          رمز QR
                        </Button>
                        <Button
                          id="go"
                          className="kb kr ready"
                          style={
                            canStart
                              ? { flex: 2 }
                              : { flex: 2, filter: "grayscale(.5)", opacity: 0.6 }
                          }
                          disabled={!canStart}
                          onClick={start}
                        >
                          ابدأ اللعبة
                        </Button>
                      </div>
                      <div className="kst kdk">
                        {canStart
                          ? "الكل جاهز — ابدأ المباراة"
                          : `تحتاج ${4 - players.length} لاعبين إضافيين على الأقل لبدء المباراة`}
                      </div>
                    </div>
                    <div
                      id="ksa"
                      className={count > 6 ? "dn" : ""}
                      style={
                        {
                          "--c": count <= 4 ? 2 : 3,
                          "--r": Math.ceil(count / (count <= 4 ? 2 : 3)),
                        } as React.CSSProperties
                      }
                    >
                      {players.map((p, i) => (
                        <div className={`ks ${i === 0 ? "me" : "bot"}`} key={p.id}>
                          <span className="knum">{i + 1}</span>
                          <div className="kav">
                            <img src={characterFace(p.char)} alt="" />
                          </div>
                          <span className="ksn">{p.name}</span>
                          <div className="kbg">
                            <b className={i === 0 ? "hu" : "bt"}>
                              {i === 0 ? "المضيف (أنت)" : "لاعب"}
                            </b>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {screen === "game" && game && (
              <div className="kpg" id="kp3" style={{ display: "block" }}>
                <div id="kg">
                  <div className="joker-tool">{toolButtons}</div>
                  <div className="kh">الجوكر · الجولة {game.round}</div>
                  <div className="kd">
                    {game.phase === "play" ? (
                      <>
                        <div className="glp">
                          <Button
                            id="gcard"
                            variant="ghost"
                            className={`gcard ${holdingId !== human ? "back" : card === "JK" ? "jk" : /[\u2665\u2666]/.test(card ?? "") ? "r" : ""}`}
                            onPointerDown={(e) => {
                              e.preventDefault();
                              setHoldingId(human);
                              playCardSound();
                            }}
                            onPointerUp={() => setHoldingId(null)}
                            onPointerLeave={() => setHoldingId(null)}
                            onPointerCancel={() => setHoldingId(null)}
                            onTouchStart={(e) => {
                              e.preventDefault();
                              setHoldingId(human);
                              playCardSound();
                            }}
                            onTouchEnd={() => setHoldingId(null)}
                            onTouchCancel={() => setHoldingId(null)}
                            onContextMenu={(e) => e.preventDefault()}
                          >
                            {holdingId === human
                              ? card === "JK"
                                ? "🃏 الجوكر"
                                : card
                              : "اضغط باستمرار"}
                          </Button>
                          <div id="gst" className="gst kdk ghints">
                            {HINTS.map((h, i) => (
                              <div key={i}>
                                <b>{i + 1}-</b> {h}
                              </div>
                            ))}
                          </div>
                          {["pick", "final", "joker"].includes(mode) && (
                            <Button
                              id="gact"
                              className={`kb ${mode === "pick" ? "kbl" : "kr"}`}
                              onClick={() => (mode === "joker" ? act(human) : setModal("pick"))}
                            >
                              {mode === "joker"
                                ? "أنزل الورقة"
                                : mode === "final"
                                  ? "من هو صاحب الجوكر؟"
                                  : "اختيار صاحب الجوكر"}
                            </Button>
                          )}
                        </div>
                        <div className="gmain">
                          <div className="grem">
                            الباقون على الطاولة{" "}
                            <b>{game.players.filter((p) => !game.out[p.id]).length}</b>
                          </div>
                          <div id="glog" className="kdk">
                            {game.log.length ? (
                              game.log.map((l, i) => (
                                <div key={i}>
                                  خرج {l.name} — باقي {l.remaining} لاعبين
                                </div>
                              ))
                            ) : (
                              <div>لم يخرج أحد بعد</div>
                            )}
                          </div>
                          <div id="gsa">
                            <div className="gtab">
                              {game.players.map((p, i) => {
                                // صف أفقي واحد في المنتصف: عرض المقعد 210px وفاصل بين مقعدين نصف عرض المقعد
                                const n = game.players.length;
                                // مقعد 210px على لوحة 1340px: الخطوة تتقلص تلقائياً حتى لا يخرج الصف عن الطاولة
                                const stepPct = Math.min(
                                  (315 / 1340) * 100,
                                  (100 - (210 / 1340) * 100) / Math.max(n - 1, 1),
                                );
                                const rowLeft =
                                  n > 1 ? 50 - ((n - 1) * stepPct) / 2 + stepPct * i : 50;
                                const isHuman = p.id === human;
                                const isHolding = isHuman && holdingId === p.id;
                                const playerCard = game.cards[p.id];
                                const isRed = /[♥♦]/.test(playerCard ?? "");
                                const isJk = playerCard === "JK";
                                const isDropped = Boolean(game.out[p.id]);

                                return (
                                  <div
                                    key={p.id}
                                    className={`gs ${isDropped ? "o" : ""} ${isHuman ? "me" : ""}`}
                                    style={{
                                      left: `${rowLeft}%`,
                                      top: `47%`,
                                    }}
                                  >
                                    <img className="gav" src={characterFace(p.char)} alt="" />
                                    <span>{p.name}</span>

                                    {/* ورقة اللاعب مقلوبة فوق الطاولة؛ الحساب البشري يرى ورقته هو فقط بالضغط المستمر */}
                                    <div
                                      className={`joker-table-card ${isHolding ? "revealed" : "face-down"} ${isHolding && isJk ? "jk" : ""} ${isHolding && isRed ? "r" : ""} ${isDropped ? "dropped" : ""}`}
                                      title={isHuman ? "اضغط باستمرار لرؤية ورقتك" : "ورقة مقلوبة"}
                                      onPointerDown={(e) => {
                                        if (!isHuman) return;
                                        e.preventDefault();
                                        setHoldingId(p.id);
                                        playCardSound();
                                      }}
                                      onPointerUp={() => {
                                        if (isHuman) setHoldingId(null);
                                      }}
                                      onPointerLeave={() => {
                                        if (isHuman) setHoldingId(null);
                                      }}
                                      onPointerCancel={() => {
                                        if (isHuman) setHoldingId(null);
                                      }}
                                      onTouchStart={(e) => {
                                        if (!isHuman) return;
                                        e.preventDefault();
                                        setHoldingId(p.id);
                                        playCardSound();
                                      }}
                                      onTouchEnd={() => {
                                        if (isHuman) setHoldingId(null);
                                      }}
                                      onTouchCancel={() => {
                                        if (isHuman) setHoldingId(null);
                                      }}
                                      onContextMenu={(e) => e.preventDefault()}
                                    >
                                      {isHolding && isHuman ? (isJk ? "🃏" : playerCard) : ""}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div id="gres">
                        <div className="glp">
                          <div className="gst kdk" id="rsum">
                            <div>
                              🃏 صاحب الجوكر:{" "}
                              <b>{game.players.find((p) => p.id === game.joker)?.name}</b>
                            </div>
                            <div>
                              الفائزون:{" "}
                              {game.results
                                .filter((r) => r.outcome === "فائز")
                                .map((r) => r.name)
                                .join("، ")}
                            </div>
                          </div>
                          <div className="rq">هل تريد اللعب مرة أخرى؟</div>
                          <div className="rbb">
                            <Button
                              className="kb kr"
                              onClick={() => {
                                if (netClient) return; // المضيف يبدأ الجولة التالية
                                const g2 = dealJoker(game);
                                setGame(g2);
                                setHoldingId(null);
                                if (netHostActive) jokerHostPublish(g2);
                              }}
                            >
                              {netClient ? "بانتظار المضيف…" : "إعادة اللعب"}
                            </Button>
                            <Button className="kb kbl" onClick={back}>
                              رجوع
                            </Button>
                          </div>
                        </div>
                        <div className="gmain">
                          <div id="rtb" className="kdk">
                            <div className="rr h">
                              <span>اللاعب</span>
                              <span>ورقته</span>
                              <span>اختياره</span>
                              <span>النتيجة</span>
                            </div>
                            {game.results.map((r) => (
                              <div className={`rr ${r.joker ? "j" : ""}`} key={r.id}>
                                <span>
                                  {r.name} ({game.players.find((p) => p.id === r.id)?.score})
                                </span>
                                <span dir="ltr">{r.card === "JK" ? "🃏" : r.card}</span>
                                <span>
                                  {game.players.find((p) => p.id === r.pick)?.name ?? "—"}
                                </span>
                                <b
                                  className={
                                    r.outcome === "فائز" ? "hu" : r.outcome === "غشاش" ? "bt" : "rd"
                                  }
                                >
                                  {r.outcome}
                                </b>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    {/* مؤشر سرعة الاتصال (البنق) في أسفل يسار طاولة الجوكر عند اللعب عبر Hotspot */}
                    <NetworkLatencyBadge
                      className="!absolute bottom-3 left-3 z-30"
                      players={game.players.map((p, idx) => ({
                        seatIndex: idx,
                        name: p.name,
                        isBot: p.bot,
                      }))}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        {screen !== "game" && (
          <Button
            id="prof"
            variant="ghost"
            aria-label="خيارات اللاعب"
            onClick={() => setProfileOpen(true)}
          >
            <img className="av" src={characterFace(profile.characterId)} alt="" />
            <span className="un">{profile.name}</span>
          </Button>
        )}
        {screen !== "game" && <div className="joker-tool">{toolButtons}</div>}
        {profileOpen && <ProfileEditor onClose={() => setProfileOpen(false)} />}
        {showQr && (
          <div className="km" style={{ display: "flex", zIndex: 100 }}>
            <div className="kmb">
              <div className="kmc" style={{ textAlign: "center" }}>
                <h2>امسح الرمز للانضمام للغرفة</h2>
                <div
                  style={{
                    background: "#fff",
                    padding: 16,
                    borderRadius: 16,
                    display: "inline-block",
                    margin: "16px auto",
                  }}
                >
                  <QRCodeSVG value={`joker-room:${roomCode}`} size={220} level="M" />
                </div>
                <p style={{ fontSize: 20, fontWeight: "bold", margin: "10px 0" }}>
                  رمز الغرفة: <span style={{ color: "#00e5ff" }}>{roomCode}</span>
                </p>
                <p style={{ fontSize: 14, opacity: 0.8, marginBottom: 16 }}>
                  تأكد أن اللاعبين متصلون بنفس نقطة الاتصال (Hotspot)
                </p>
                <Button className="kb kr" onClick={() => setShowQr(false)}>
                  إغلاق
                </Button>
              </div>
            </div>
          </div>
        )}
        {modal && (
          <div id="md" className="on">
            <div id="mdin">
              <div
                id="mc"
                className="kmc"
                role="dialog"
                aria-modal="true"
                aria-label={modal === "rules" ? "قواعد الجوكر" : "اختيار صاحب الجوكر"}
              >
                {modal === "rules" && (
                  <>
                    <h2>قواعد الجوكر</h2>
                    <div className="rules">
                      <p>من ٤ إلى ٩ لاعبين، ورقة لكل لاعب وجوكر واحد فقط.</p>
                      <p>
                        اللاعب العادي يختار صاحب الجوكر ويخرج. الاختيار الصحيح فوز، والخاطئ غشاش.
                      </p>
                      <p>
                        آخر لاعب عادي ينتظر نزول الجوكر ثم يختار: الصحيح فائز والخاطئ خاسر. يفوز
                        الجوكر إذا أخطأ آخر لاعب.
                      </p>
                      <p>كل فوز يضيف نقطة إلى نتيجة اللاعب.</p>
                    </div>
                  </>
                )}
                {modal === "network" && (
                  <>
                    <h2>الانضمام إلى غرفة جوكر</h2>
                    <p style={{ marginBottom: 16 }}>
                      اتصل بنقطة اتصال المضيف (Hotspot) ثم أدخل رمز الغرفة أو امسح رمز الـ QR:
                    </p>
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="أدخل رمز الغرفة (4–6 أرقام)"
                      dir="ltr"
                      style={{
                        width: "100%",
                        padding: "12px",
                        borderRadius: "8px",
                        background: "rgba(0,0,0,0.4)",
                        border: "1px solid rgba(255,255,255,0.2)",
                        color: "#fff",
                        textAlign: "center",
                        fontSize: "20px",
                        letterSpacing: "4px",
                        marginBottom: "16px",
                      }}
                      id="joker-room-input"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const val = (
                            document.getElementById("joker-room-input") as HTMLInputElement
                          )?.value;
                          doJoin((val || "").trim());
                        }
                      }}
                    />
                    <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
                      <Button
                        className="kb kr"
                        style={{ width: 200 }}
                        onClick={() => {
                          const val = (
                            document.getElementById("joker-room-input") as HTMLInputElement
                          )?.value;
                          doJoin((val || "").trim());
                        }}
                      >
                        {joining ? "جارِ الاتصال…" : "دخول الغرفة"}
                      </Button>
                      <Button
                        className="kb kbl"
                        style={{ width: 200 }}
                        onClick={() => void startScan()}
                      >
                        <Camera className="w-5 h-5 ml-2" />
                        مسح رمز QR
                      </Button>
                    </div>
                    {scanOpen && (
                      <div style={{ marginTop: 16 }}>
                        <video
                          ref={scanVideo}
                          muted
                          playsInline
                          style={{
                            width: "100%",
                            height: 300,
                            objectFit: "cover",
                            borderRadius: "12px",
                            background: "rgba(0,0,0,0.6)",
                          }}
                        />
                        <Button className="kb kbl" style={{ width: 200 }} onClick={stopScan}>
                          إلغاء المسح
                        </Button>
                      </div>
                    )}
                    {joinError && (
                      <p style={{ color: "#ff6b6b", fontWeight: 700, marginTop: 14 }}>
                        {joinError}
                      </p>
                    )}
                  </>
                )}
                {modal === "pick" && (
                  <>
                    <h2>من هو صاحب ورقة الجوكر؟</h2>
                    <div className="pl">
                      {game?.players
                        .filter((p) => p.id !== human)
                        .map((p) => (
                          <Button
                            key={p.id}
                            className="kb kbl"
                            onClick={() => {
                              setTarget(p.id);
                              setModal("confirm");
                            }}
                          >
                            {p.name}
                          </Button>
                        ))}
                    </div>
                  </>
                )}
                {modal === "confirm" && (
                  <>
                    <h2>هل أنت متأكد؟</h2>
                    <p>اختيارك: {game?.players.find((p) => p.id === target)?.name}</p>
                    <Button
                      className="kb kr"
                      onClick={() => {
                        if (target) act(human, target);
                        setModal(null);
                      }}
                    >
                      تأكيد
                    </Button>
                    <Button className="kb kbl" onClick={() => setModal("pick")}>
                      رجوع
                    </Button>
                  </>
                )}
                {modal !== "confirm" && (
                  <Button className="kb kr" onClick={() => setModal(null)}>
                    إغلاق
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
