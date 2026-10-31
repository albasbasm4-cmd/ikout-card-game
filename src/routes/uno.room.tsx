import { formatHotspotQrString } from "@/network/multiplayerHub";
import { ClientOnly, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, Bot, User } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { newGame, type Difficulty } from "@/lib/uno/engine";
import { clearGame, saveGame } from "@/lib/uno/storage";
import { BOT_NAMES, DIFF_LABEL } from "@/lib/uno/names";
import { characterFace, useProfile } from "@/utils/profile";
import { useSettings } from "@/store/useSettings";
import { useStageFit } from "@/hooks/use-stage-fit";
import { ProfileEditor } from "@/components/ProfileEditor";
import { CitySkyline, Clouds } from "@/components/HomeScreen";
import { playTapSound } from "@/utils/audio";
import "@/components/uno/lobby.css";

export const Route = createFileRoute("/uno/room")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "iKout — أونو — إنشاء غرفة" },
      {
        name: "description",
        content: "أنشئ غرفة أونو، حدد المقاعد من 1 إلى 10، واختر لاعباً حقيقياً أو بوتاً لكل مقعد.",
      },
      { property: "og:title", content: "أونو — إنشاء غرفة" },
      { property: "og:description", content: "غرفة أونو جماعية مع رمز QR." },
    ],
  }),
  component: () => (
    <ClientOnly>
      <Room />
    </ClientOnly>
  ),
});

type Seat = { type: "human"; occupied: boolean } | { type: "bot"; difficulty: Difficulty };

export interface RoomProps {
  onBack?: () => void;
  onStartPlay?: () => void;
}

/**
 * شاشة إنشاء غرفة أونو — مسرح أفقي 1536×691 مطابق لهوية لوبي أونو
 * (نفس خلفية المدينة والسحب المتحركة وأزرار lobby.css مثل شاشة الغرفة في الجوكر).
 */
export function Room({ onBack, onStartPlay }: RoomProps = {}) {
  const nav = useNavigate();
  const { settings } = useSettings();
  const profile = useProfile();
  const stage = useRef<HTMLDivElement>(null);
  useStageFit(stage, 1536, 691, settings.orientationPreference);
  const code = useMemo(() => Math.random().toString(36).slice(2, 8).toUpperCase(), []);
  // Seat 0 is always the host.
  const [seats, setSeats] = useState<Seat[]>([{ type: "human", occupied: true }]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const setCount = (n: number) => {
    n = Math.max(1, Math.min(10, n));
    setSeats((s) =>
      n > s.length
        ? [
            ...s,
            ...Array.from(
              { length: n - s.length },
              () => ({ type: "bot", difficulty: "medium" }) as Seat,
            ),
          ]
        : s.slice(0, n),
    );
  };
  const waiting = seats.filter((s) => s.type === "human" && !s.occupied).length;
  const canStart = seats.length >= 2 && waiting === 0;
  const botName = (i: number) =>
    BOT_NAMES[seats.slice(1, i).filter((x) => x.type === "bot").length] ?? "بوت";
  const seatLabel = (i: number) =>
    i === 0 ? "أنت (المستضيف)" : seats[i].type === "bot" ? botName(i) : "لاعب حقيقي";

  const goLobby = () => {
    playTapSound();
    if (onBack) onBack();
    else nav({ to: "/uno" });
  };
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("تم نسخ رمز الغرفة");
    } catch {
      toast.error("تعذر النسخ — انسخ الرمز يدوياً");
    }
  };
  const start = () => {
    if (!canStart) return;
    playTapSound();
    clearGame();
    let b = 0;
    const g = newGame(
      seats.map((s, i) =>
        i === 0
          ? {
              name: profile.name || "أنت (المستضيف)",
              isBot: false,
              difficulty: "easy" as Difficulty,
            }
          : {
              name: BOT_NAMES[b++] ?? "بوت",
              isBot: true,
              difficulty: s.type === "bot" ? s.difficulty : "medium",
            },
      ),
      "room",
    );
    saveGame(g);
    if (onStartPlay) onStartPlay();
    else nav({ to: "/uno/play" });
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
        <div id="kr" className="host">
          <div id="ttl">إنشاء غرفة</div>
          <div id="krv">
            <div className="kd">
              <div className="klp">
                <div className="kcb kdk">
                  <div className="t">رمز الغرفة</div>
                  <div className="c">{code}</div>
                  <button className="kb kbl" onClick={copyCode}>
                    <span>نسخ</span>
                  </button>
                </div>
                <div className="ksb kdk">
                  <div className="t">اللاعبون</div>
                  <div className="n">
                    <span>{seats.length}</span> <small>/ 10</small>
                  </div>
                  <div className="kstp">
                    <button
                      className="kchip"
                      aria-label="إنقاص المقاعد"
                      disabled={seats.length <= 1}
                      style={seats.length <= 1 ? { opacity: 0.4 } : undefined}
                      onClick={() => setCount(seats.length - 1)}
                    >
                      −
                    </button>
                    <span>المقاعد</span>
                    <button
                      className="kchip"
                      aria-label="زيادة المقاعد"
                      disabled={seats.length >= 10}
                      style={seats.length >= 10 ? { opacity: 0.4 } : undefined}
                      onClick={() => setCount(seats.length + 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
                <button
                  className="kb kbl"
                  onClick={() => {
                    playTapSound();
                    setQrOpen(true);
                  }}
                >
                  <span>رمز QR</span>
                </button>
                <button
                  className="kb kr2"
                  onClick={start}
                  disabled={!canStart}
                  style={canStart ? undefined : { filter: "grayscale(.5)", opacity: 0.6 }}
                >
                  <span>ابدأ اللعبة</span>
                </button>
                <div className="kst kdk">
                  {seats.length < 2
                    ? "تحتاج مقعدين على الأقل لبدء المباراة"
                    : waiting > 0
                      ? `بانتظار ${waiting} لاعب حقيقي — أكمل المقاعد أولاً`
                      : "الكل جاهز — ابدأ المباراة"}
                </div>
              </div>
              <div
                id="ksa"
                className={seats.length > 6 ? "dn" : undefined}
                style={{ "--c": seats.length > 6 ? 5 : 3 } as CSSProperties}
              >
                {seats.map((seat, i) => (
                  <div
                    key={i}
                    className={`ks${i === 0 ? " me" : ""}${i > 0 && seat.type === "human" && !seat.occupied ? " empty" : ""}`}
                  >
                    <span className="knum">{i + 1}</span>
                    <div className="kav">
                      {i === 0 ? (
                        <img src={characterFace(profile.characterId)} alt="" />
                      ) : seat.type === "bot" ? (
                        <Bot />
                      ) : (
                        <User />
                      )}
                    </div>
                    <div className="ksn">{seatLabel(i)}</div>
                    <div className="kbg">
                      {i === 0 ? (
                        <span className="hu">جاهز</span>
                      ) : seat.type === "bot" ? (
                        <span className="ho">{DIFF_LABEL[seat.difficulty]}</span>
                      ) : (
                        <span className="hu">بانتظار الانضمام…</span>
                      )}
                    </div>
                    {i > 0 && (
                      <>
                        <div className="kbg">
                          <button
                            className="kchip"
                            onClick={() => {
                              playTapSound();
                              setSeats((s) =>
                                s.map((x, j) => (j === i ? { type: "human", occupied: false } : x)),
                              );
                            }}
                          >
                            لاعب
                          </button>
                          <button
                            className="kchip"
                            onClick={() => {
                              playTapSound();
                              setSeats((s) =>
                                s.map((x, j) =>
                                  j === i ? { type: "bot", difficulty: "medium" } : x,
                                ),
                              );
                            }}
                          >
                            بوت
                          </button>
                        </div>
                        {seat.type === "bot" && (
                          <div className="kbg">
                            {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
                              <button
                                key={d}
                                className="kchip"
                                style={seat.difficulty === d ? undefined : { opacity: 0.55 }}
                                onClick={() => {
                                  playTapSound();
                                  setSeats((s) =>
                                    s.map((x, j) => (j === i ? { type: "bot", difficulty: d } : x)),
                                  );
                                }}
                              >
                                {DIFF_LABEL[d]}
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        {qrOpen && (
          <div id="md" className="on" onClick={() => setQrOpen(false)}>
            <div id="mdin" onClick={(e) => e.stopPropagation()}>
              <h2>رمز QR للغرفة</h2>
              <div className="qbox">
                <QRCodeSVG
                  value={formatHotspotQrString("uno", "192.168.43.1", 8080, code)}
                  size={190}
                />
              </div>
              <p>امسح الرمز من جهاز آخر أو شارك رمز الغرفة للانضمام.</p>
              <button className="kb kr2" onClick={() => setQrOpen(false)}>
                <span>إغلاق</span>
              </button>
            </div>
          </div>
        )}
        {profileOpen && <ProfileEditor onClose={() => setProfileOpen(false)} />}
      </div>
    </main>
  );
}
