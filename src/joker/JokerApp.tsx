import { NetworkLatencyBadge } from "@/components/NetworkLatencyBadge";
import { useEffect, useRef, useState } from "react";
import { useAppBack } from "@/utils/appBackNav";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Minus, Plus, Globe, Volume2, VolumeX, BookOpen, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProfileEditor } from "@/components/ProfileEditor";
import { characterFace, CHARACTER_IDS, useProfile } from "@/utils/profile";
import { useSettings } from "@/store/useSettings";
import { useStageFit } from "@/hooks/use-stage-fit";
import { playCardSound, playWinSound, playLoseSound } from "@/utils/audio";
import {
  actJoker,
  chooseJokerBot,
  createJokerGame,
  dealJoker,
  jokerMode,
  type JokerGame,
} from "./engine";
import "./styles.css";

const COPY = {
  pick: "لمّح للآخرين، ثم اختر من تظن أنه صاحب الجوكر",
  joker: "ورقتك هي الجوكر! أنزل ورقتك قبل أن تُكشف",
  wait: "بانتظار نزول ورقة الجوكر…",
  final: "بقيت وحدك! خمّن من هو صاحب ورقة الجوكر",
  out: "تم تسجيل اختيارك. تابع بقية اللاعبين",
};
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
  const [game, setGame] = useState<JokerGame | null>(null);
  const [holdingId, setHoldingId] = useState<string | null>(null);
  const [botPeekingId, setBotPeekingId] = useState<string | null>(null);
  const [modal, setModal] = useState<"rules" | "pick" | "confirm" | "network" | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const awarded = useRef<number>(0);
  const human = "p0";
  const players = Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: i === 0 ? profile.name : `لاعب ${i + 1}`,
    char: i === 0 ? profile.characterId : CHARACTER_IDS[(i * 5) % CHARACTER_IDS.length],
    score: 0,
    bot: i !== 0,
  }));
  const start = () => {
    setGame(dealJoker(createJokerGame(players)));
    setHoldingId(null);
    setScreen("game");
  };
  const act = (id: string, to?: string) => {
    setGame((prev) => (prev ? actJoker(prev, id, to) : prev));
    playCardSound();
  };
  useEffect(() => {
    if (!game || game.phase !== "play") return;
    const bot = game.players.find(
      (p) => p.bot && ["joker", "pick", "final"].includes(jokerMode(game, p.id)),
    );
    if (!bot) return;
    const timer = setTimeout(
      () => {
        setGame((prev) =>
          prev
            ? actJoker(
                prev,
                bot.id,
                jokerMode(prev, bot.id) === "joker" ? undefined : chooseJokerBot(prev, bot.id),
              )
            : prev,
        );
        playCardSound();
      },
      settings.botSpeed === "FAST" ? 650 : settings.botSpeed === "SLOW" ? 2200 : 1400,
    );
    const peekTimer = setTimeout(() => {
      setBotPeekingId(bot.id);
      setTimeout(() => setBotPeekingId(null), 600);
    }, 150);
    return () => {
      clearTimeout(timer);
      clearTimeout(peekTimer);
    };
  }, [game, settings.botSpeed]);
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
    if (screen === "room") setScreen("entry");
    else goHome();
  };

  // زر الرجوع النظامي يتبع نفس منطق زر الرجوع داخل الجوكر.
  useAppBack(() => back());
  const mode = game ? jokerMode(game, human) : "wait";
  const card = game?.cards[human];
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
                    <Button className="kb kr" onClick={() => setScreen("room")}>
                      اللعب ضد البوتات
                    </Button>
                    <Button className="kb kbl" onClick={() => setModal("network")}>
                      الانضمام إلى غرفة
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {screen === "room" && (
              <div className="kpg" id="kp2" style={{ display: "block" }}>
                <div id="kr" className="host">
                  <div className="kh">اللعب ضد البوتات</div>
                  <div className="kd">
                    <div className="klp">
                      <div className="ksb kdk">
                        <span className="t">اللاعبون</span>
                        <b className="n">{count} / 9</b>
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
                            disabled={count === 9}
                            aria-label="زيادة المقاعد"
                            onClick={() => setCount((c) => c + 1)}
                          >
                            <Plus />
                          </Button>
                        </div>
                      </div>
                      <Button id="go" className="kb kr ready" onClick={start}>
                        ابدأ التوزيع
                      </Button>
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
                            <b className={p.bot ? "bt" : "hu"}>{p.bot ? "بوت" : "أنت"}</b>
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
                  <div className="kh">الجوكر · الجولة {game.round}</div>
                  <div className="kd">
                    {game.phase === "play" ? (
                      <>
                        <div className="glp">
                          <Button
                            id="gcard"
                            variant="ghost"
                            className={`gcard ${holdingId !== human ? "back" : card === "JK" ? "jk" : /[♥♦]/.test(card ?? "") ? "r" : ""}`}
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
                          <div id="gst" className="gst kdk">
                            {COPY[mode]}
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
                                // صف أفقي واحد يبدأ من اليمين قليلاً فوق منتصف الشاشة
                                const n = game.players.length;
                                const rowLeft = n > 1 ? 90 - (80 * i) / (n - 1) : 50;
                                const isHolding = holdingId === p.id;
                                const playerCard = game.cards[p.id];
                                const isRed = /[♥♦]/.test(playerCard ?? "");
                                const isJk = playerCard === "JK";
                                const isDropped = Boolean(game.out[p.id]);
                                const isPeeking = botPeekingId === p.id;

                                return (
                                  <div
                                    key={p.id}
                                    className={`gs ${isDropped ? "o" : ""} ${p.id === human ? "me" : ""}`}
                                    style={{
                                      left: `${rowLeft}%`,
                                      top: `47%`,
                                    }}
                                  >
                                    <img className="gav" src={characterFace(p.char)} alt="" />
                                    <span>{p.name}</span>

                                    {/* ورقة اللاعب مقلوبة فوق الطاولة ولا تظهر إلا بالضغط المستمر */}
                                    <div
                                      className={`joker-table-card ${isHolding ? "revealed" : "face-down"} ${isHolding && isJk ? "jk" : ""} ${isHolding && isRed ? "r" : ""} ${isDropped ? "dropped" : ""} ${isPeeking ? "bot-peeking" : ""}`}
                                      title={p.id === human ? "اضغط باستمرار" : "ورقة مقلوبة"}
                                      onPointerDown={(e) => {
                                        e.preventDefault();
                                        setHoldingId(p.id);
                                        playCardSound();
                                      }}
                                      onPointerUp={() => setHoldingId(null)}
                                      onPointerLeave={() => setHoldingId(null)}
                                      onPointerCancel={() => setHoldingId(null)}
                                      onTouchStart={(e) => {
                                        e.preventDefault();
                                        setHoldingId(p.id);
                                        playCardSound();
                                      }}
                                      onTouchEnd={() => setHoldingId(null)}
                                      onTouchCancel={() => setHoldingId(null)}
                                      onContextMenu={(e) => e.preventDefault()}
                                    >
                                      {isHolding ? (isJk ? "🃏" : playerCard) : ""}
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
                                setGame(dealJoker(game));
                                setHoldingId(null);
                              }}
                            >
                              إعادة اللعب
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
        <div className="joker-tool">
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
        </div>
        {profileOpen && <ProfileEditor onClose={() => setProfileOpen(false)} />}
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
                    <h2>الانضمام إلى غرفة</h2>
                    <p>
                      اللعب بين أجهزة مختلفة يحتاج تطبيق الجوال ووصلة Hotspot؛ ليس متاحاً في نسخة
                      الويب.
                    </p>
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
