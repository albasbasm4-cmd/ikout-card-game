import {
  connectJokerClient,
  disconnectJokerClient,
  getJokerNetClient,
  isJokerHostActive,
  jokerClientSendAct,
  jokerHostNewGame,
  jokerHostPublish,
  onJokerClientSeats,
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
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProfileEditor } from "@/components/ProfileEditor";
import { characterFace, CHARACTER_IDS, useProfile } from "@/utils/profile";
import { NetworkDiagnosticsPanel } from "@/components/NetworkDiagnosticsPanel";
import { InlineQrScanner } from "@/components/InlineQrScanner";
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
  const [diagOpen, setDiagOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  /** دور هذا الجهاز: محلي، مستضيف عبر الشبكة، أو منضم لمضيف بعيد. */
  const [netRole, setNetRole] = useState<"local" | "host" | "client">("local");
  /** أسماء اللاعبين البعيدين الذين انضموا فعلياً (مفتاح = معرّف اللاعب). */
  const [remoteNames, setRemoteNames] = useState<Record<string, string>>({});
  /** مقاعد الغرفة كما يبثها المضيف (واجهة غرفة المضيف للمنضم). */
  const [clientSeats, setClientSeats] = useState<Record<string, string>>({});
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
  /** مقاعد غرفة المضيف مرتبة للمنضم: المضيف أولاً ثم المنضمون حسب رقم المقعد. */
  const clientSeatsRows: [string, string][] = (() => {
    const entries: [string, string][] = [];
    const names = netRole === "client" ? clientSeats : {};
    entries.push(["p0", names["p0"] || "المضيف"]);
    const rest = Object.entries(names).filter(([k]) => k !== "p0" && /^p\d+$/.test(k));
    rest.sort((a, b) => Number(a[0].slice(1)) - Number(b[0].slice(1)));
    for (const [k, v] of rest) entries.push([k, v]);
    if (!entries.some(([k]) => k === human)) {
      entries.splice(1, 0, [human, profile.name || "لاعب"]);
    }
    return entries;
  })();
  const clientSeatsNum = clientSeatsRows.length;
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
      setClientSeats({});
      setNetRole("client");
      setModal(null);
      setScreen("room");
    })();
  };

  /** تطبيع الرمز المقروء من QR: joker-room:CODE أو URL فيه room= أو رمز خام. */
  const normalizeScanned = (c: string) => {
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

  // عند قراءة رمز QR داخل اللعبة: اتصال مباشر دون أي واجهة إضافية
  const handleScannedCode = (raw: string) => {
    const v = normalizeScanned(raw);
    setScanOpen(false);
    if (!/^[0-9]{4,6}$/.test(v)) {
      setJoinError("رمز غير صالح في رمز QR — أدخل الرمز يدوياً");
      return;
    }
    const input = document.getElementById("joker-room-input") as HTMLInputElement | null;
    if (input) input.value = v;
    doJoin(v);
  };

  // المنضم: يتبع مقاعد الغرفة ليظهر مكانه في غرفة المضيف قبل بدء المباراة
  useEffect(() => {
    if (screen !== "room" || netRole !== "client") return;
    return onJokerClientSeats((names) => setClientSeats(names));
  }, [screen, netRole]);

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
                      أنت داخل غرفة المضيف · مقعدك: <b style={{ color: "#00e5ff" }}>{human.toUpperCase()}</b>
                    </div>
                    <div
                      id="ksa"
                      style={
                        {
                          "--c": Math.min(3, Math.max(2, clientSeatsNum)),
                          "--r": Math.ceil(Math.max(1, clientSeatsNum) / Math.min(3, Math.max(2, clientSeatsNum))),
                        } as React.CSSProperties
                      }
                    >
                      {Array.from(
                        { length: Math.max(4, clientSeatsNum) },
                        (_, idx) => idx,
                      ).map((idx) => {
                        const row = clientSeatsRows[idx];
                        if (!row) {
                          return (
                            <div className="ks empty" key={`cempty-${idx}`}>
                              <span className="knum">{idx + 1}</span>
                              <div className="kav">+</div>
                              <span className="ksn">مقعد فارغ</span>
                              <div className="kbg">
                                <b className="bt">بانتظار لاعب</b>
                              </div>
                            </div>
                          );
                        }
                        const [pid, name] = row;
                        return (
                        <div className={`ks ${pid === human ? "me" : "bot"}`} key={pid}>
                          <span className="knum">{idx + 1}</span>
                          <div className="kav">
                            {pid === human ? (
                              <img src={characterFace(profile.characterId)} alt="" />
                            ) : (
                              <span
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  width: "100%",
                                  height: "100%",
                                  fontWeight: 900,
                                  fontSize: "clamp(14px, 3vh, 26px)",
                                }}
                              >
                                {(name || "؟").slice(0, 1)}
                              </span>
                            )}
                          </div>
                          <span className="ksn">{pid === "p0" ? `${name} — المضيف` : name}</span>
                          <div className="kbg">
                            <b className={pid === human ? "hu" : "bt"}>
                              {pid === human ? "أنت" : pid === "p0" ? "المضيف" : "لاعب"}
                            </b>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                    <div className="kst kdk" style={{ marginTop: 14 }}>
                      في انتظار بدء المباراة من المضيف…
                    </div>
                    <Button className="kb kbl" style={{ marginTop: 10 }} onClick={back}>
                      خروج من الغرفة
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
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          top: 358,
                          height: 96,
                          display: "flex",
                          gap: 12,
                        }}
                      >
                        <Button
                          type="button"
                          className="kb kbl"
                          style={{ flex: 1, fontSize: 26 }}
                          onClick={() => setShowQr(true)}
                        >
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 8,
                              whiteSpace: "nowrap",
                            }}
                          >
                            <QrCode className="w-5 h-5" />
                            رمز QR
                          </span>
                        </Button>
                        <Button
                          id="go"
                          className="kb kr ready"
                          style={
                            canStart
                              ? { flex: 2, fontSize: 30, top: 0, height: "100%" }
                              : { flex: 2, fontSize: 30, top: 0, height: "100%", filter: "grayscale(.5)", opacity: 0.6 }
                          }
                          disabled={!canStart}
                          onClick={start}
                        >
                          <span>ابدأ اللعبة</span>
                        </Button>
                      </div>
                      <div
                        className="kst kdk"
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          top: 464,
                          height: 78,
                          fontSize: 24,
                          lineHeight: 1.4,
                        }}
                      >
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
                      {Array.from({ length: count }, (_, i) => {
                        const p = players[i];
                        return p ? (
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
                        ) : (
                          <div className="ks empty" key={`empty-${i}`}>
                            <span className="knum">{i + 1}</span>
                            <div className="kav">+</div>
                            <span className="ksn">مقعد فارغ</span>
                            <div className="kbg">
                              <b className="bt">بانتظار لاعب</b>
                            </div>
                          </div>
                        );
                      })}
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
                    <div className="kjoin-row">
                      <Button
                        className="kb kr"
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
                        onClick={() => {
                          setJoinError(null);
                          setScanOpen(true);
                        }}
                      >
                        <Camera className="w-5 h-5 ml-2" />
                        مسح رمز QR
                      </Button>
                    </div>
                    {scanOpen && (
                      <InlineQrScanner
                        hint="وجّه الكاميرا نحو رمز غرفة الجوكر"
                        onCode={handleScannedCode}
                        onCancel={() => setScanOpen(false)}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => setDiagOpen((v) => !v)}
                      style={{
                        marginTop: 12,
                        padding: "8px 14px",
                        borderRadius: 8,
                        background: "rgba(255,255,255,0.08)",
                        border: "1px solid rgba(255,255,255,0.25)",
                        color: "#fff",
                        fontSize: 14,
                        cursor: "pointer",
                      }}
                    >
                      تشخيص الاتصال
                    </button>
                    {diagOpen && <NetworkDiagnosticsPanel className="mt-3" />}
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
