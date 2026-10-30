import { useSettings } from "../store/useSettings";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * شاشة الغرفة — نقل حرفي من تصميم شاشة_الغرفة.html (مسرح 2400×1080)
 * مع ربط كل زر بوظائف التطبيق الحقيقية (useRoom، QrModal، JoinScreen).
 */

import React, { useEffect, useRef, useState } from "react";
import { RoomConfig, useRoom } from "../store/useRoom";
import type { Difficulty } from "../types/kout";
import { loadProfile, characterFace, useProfile } from "../utils/profile";
import { countryName, flagUrl } from "../utils/countries";
import { useXp } from "../utils/xp";
import { useStageFit } from "../hooks/use-stage-fit";
import { playTapSound } from "../utils/audio";
import { ProfileEditor } from "./ProfileEditor";
import { QrModal } from "./QrModal";
import { JoinScreen } from "./JoinScreen";
import { generateRoomCode } from "../network/localIp";

export interface RoomScreenProps {
  /** host = إنشاء غرفة، join = الانضمام إلى غرفة */
  mode?: "host" | "join";
  initialConfig?: Partial<RoomConfig>;
  onStartGame: (config: RoomConfig) => void;
  onBack: () => void;
  className?: string;
}

const PLAYERS = [4, 6];
const TARGETS = [26, 51, 101];
const LEVELS = ["سهل", "متوسط", "صعب"] as const;
const LEVEL_KEYS: Difficulty[] = ["EASY", "MEDIUM", "EXPERT"];
/** نفس تخزين شاشة الإعداد (شاشة التدريب) لتبقى القيم متزامنة. */
const CFG_KEY = "ikout_setup2_cfg";

interface StepperIndex {
  p: number;
  t: number;
  l: number;
}
const readIndex = (fallback: StepperIndex): StepperIndex => {
  try {
    const raw = JSON.parse(localStorage.getItem(CFG_KEY) ?? "null") as Partial<StepperIndex> | null;
    if (raw && typeof raw === "object") {
      return {
        p: PLAYERS[raw.p as number] !== undefined ? (raw.p as number) : fallback.p,
        t: TARGETS[raw.t as number] !== undefined ? (raw.t as number) : fallback.t,
        l: LEVELS[raw.l as number] !== undefined ? (raw.l as number) : fallback.l,
      };
    }
  } catch {
    /* ignore */
  }
  return fallback;
};
const writeIndex = (value: StepperIndex) => {
  try {
    localStorage.setItem(CFG_KEY, JSON.stringify(value));
  } catch {
    /* ignore */
  }
};

export const RoomScreen: React.FC<RoomScreenProps> = ({
  mode = "host",
  initialConfig,
  onStartGame,
  onBack,
  className = "",
}) => {
  const isHost = mode === "host";
  const stageRef = useRef<HTMLDivElement | null>(null);
  const { settings } = useSettings();
  useStageFit(stageRef, 2400, 1080, settings.orientationPreference);
  const profile = useProfile();
  const { level, inLevel, needed } = useXp();

  const {
    variant,
    setVariant,
    targetScore,
    setTargetScore,
    botDifficulty,
    setBotDifficulty,
    players,
    setSeatKind,
    setPlayerName,
    swapSeats,
    getConfig,
  } = useRoom(initialConfig);

  const [cfg, setCfg] = useState<StepperIndex>(() =>
    readIndex({
      p: variant === "BO4" ? 0 : 1,
      t: Math.max(0, TARGETS.indexOf(initialConfig?.targetScore ?? 51)),
      l: 1,
    }),
  );
  const [sel, setSel] = useState<number | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [showScanner, setShowScanner] = useState<null | { code?: string; manual?: boolean }>(null);
  /** join: 'code' = إدخال الرمز، 'room' = داخل الغرفة بانتظار المضيف */
  const [joined, setJoined] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [roomCode] = useState<string>(() => generateRoomCode());
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const n = loadProfile().name;
    if (n) setPlayerName(0, n);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const toast = (m: string) => {
    setToastMsg(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2200);
  };

  const count = PLAYERS[cfg.p];

  /** زر مستوى البوت الديناميكي: يتبدل بالأسهم مثل بقية العدادات. */
  const step = (k: keyof StepperIndex, d: number) => {
    if (!isHost) return;
    playTapSound();
    const n = { p: PLAYERS.length, t: TARGETS.length, l: LEVELS.length }[k];
    const next: StepperIndex = { ...cfg, [k]: (cfg[k] + d + n) % n };
    setCfg(next);
    writeIndex(next);
    if (k === "p") setVariant(next.p === 0 ? "BO4" : "BO6");
    else if (k === "t") setTargetScore(TARGETS[next.t]);
    else setBotDifficulty(LEVEL_KEYS[next.l]);
  };

  const copyCode = () => {
    playTapSound();
    try {
      navigator.clipboard.writeText(roomCode).then(
        () => toast("تم نسخ الرمز"),
        () => toast("الرمز: " + roomCode),
      );
    } catch {
      toast("الرمز: " + roomCode);
    }
  };

  const seatFilled = (kind: string, connected?: boolean) => kind !== "HUMAN_REMOTE" || !!connected;
  const allFilled = players.every((p) => seatFilled(p.kind, p.connected));

  const startRoom = () => {
    playTapSound();
    if (!allFilled) {
      toast("أكمل جميع المقاعد أولاً");
      return;
    }
    onStartGame(getConfig());
  };

  const onSeatClick = (seatIndex: number) => {
    playTapSound();
    if (sel === null) {
      const slot = players.find((p) => p.seatIndex === seatIndex);
      if (!slot || !seatFilled(slot.kind, slot.connected)) {
        toast("اختر لاعباً أولاً ثم المقعد الذي تريد نقله إليه");
        return;
      }
      setSel(seatIndex);
      return;
    }
    if (sel === seatIndex) {
      setSel(null);
      return;
    }
    if (!isHost) {
      toast("المضيف فقط يبدّل مقاعد الآخرين");
      setSel(null);
      return;
    }
    swapSeats(sel, seatIndex);
    setSel(null);
  };

  /* ===== داخل الغرفة (المنضم): المضيف + أنت، والمقاعد الباقية فارغة ===== */
  const joinerSeats = Array.from({ length: count }, (_, i) => {
    if (i === 0) return { name: "المضيف", host: true, me: false, bot: false, empty: false };
    if (i === 1)
      return { name: profile.name || "أنت", host: false, me: true, bot: false, empty: false };
    return { name: "مقعد فارغ", host: false, me: false, bot: false, empty: true };
  });

  const renderSeat = (index: number) => {
    if (!isHost) {
      const s = joinerSeats[index];
      return (
        <div className={`rm-seat ${s.me ? "me" : ""} ${s.empty ? "empty" : ""}`} key={`j${index}`}>
          <div className="rm-av2">
            {s.empty ? (
              "+"
            ) : s.host ? (
              "🧔"
            ) : (
              <img src={characterFace(profile.characterId)} alt={s.name} />
            )}
          </div>
          <div className="rm-inf">
            <div className="rm-sn" dir="auto">
              {s.name}
            </div>
            <div className="rm-bg">
              {s.host && <b className="rm-ho">المضيف</b>}
              {s.me && <b className="rm-hu">أنت</b>}
            </div>
          </div>
        </div>
      );
    }
    const slot = players.find((p) => p.seatIndex === index);
    if (!slot) return null;
    const filled = seatFilled(slot.kind, slot.connected);
    const isBot = slot.kind === "AI_BOT";
    const isMe = slot.kind === "HUMAN_LOCAL" && index === 0;
    if (!filled) {
      return (
        <div className="rm-seat empty" key={index}>
          <div className="rm-av2">+</div>
          <div className="rm-inf">
            <div className="rm-sn">مقعد فارغ</div>
          </div>
          <button
            type="button"
            className="rm-chip"
            onClick={(e) => {
              e.stopPropagation();
              playTapSound();
              setSeatKind(index, "AI_BOT");
            }}
            aria-label="أضف بوت"
          >
            + بوت
          </button>
        </div>
      );
    }
    return (
      <div
        className={`rm-seat ${isBot ? "bot" : ""} ${isMe ? "me" : ""} ${sel === index ? "sel" : ""}`}
        key={index}
        onClick={() => onSeatClick(index)}
      >
        <div className="rm-av2">
          {isBot ? (
            "🤖"
          ) : isMe ? (
            <img src={characterFace(profile.characterId)} alt={slot.name} />
          ) : (
            "🧔"
          )}
        </div>
        <div className="rm-inf">
          <div className="rm-sn" dir="auto">
            {slot.name}
          </div>
          <div className="rm-bg">
            <b className={isBot ? "rm-bt" : "rm-hu"}>{isBot ? "بوت" : "بشري"}</b>
            {isMe && <b className="rm-ho">المضيف</b>}
            {slot.kind === "HUMAN_REMOTE" && slot.connected && <b className="rm-hu">عن بعد</b>}
          </div>
        </div>
        {!isMe && (
          <button
            type="button"
            className="rm-xb"
            onClick={(e) => {
              e.stopPropagation();
              playTapSound();
              setSeatKind(index, "HUMAN_REMOTE");
              setSel(null);
            }}
            aria-label="إزالة"
          >
            ✕
          </button>
        )}
      </div>
    );
  };

  const seatColumns = (n: number, renderOne: (i: number) => React.ReactNode) => {
    const h = n / 2;
    const col = (a: number, b: number, cls: string, name: string) => (
      <div className="rm-tm" key={cls}>
        <div className={`rm-th ${cls}`}>{name}</div>
        <div className="rm-sl">
          {Array.from({ length: n }, (_, i) => (i >= a && i < b ? renderOne(i) : null))}
        </div>
      </div>
    );
    return (
      <div className={`rm-sa rm-n${n}`}>
        {col(0, h, "ta", "الفريق أ")}
        {col(h, n, "tb", "الفريق ب")}
      </div>
    );
  };

  return (
    <div dir="rtl" className={`ik-home su2-root ${className}`} style={{ background: "#1a2128" }}>
      <div ref={stageRef} className="su2-stage">
        <div className="su2-glow" />

        {/* بطاقة الغرفة */}
        <div className="rm-card">
          <div className="rm-hd">{isHost ? "إنشاء غرفة" : "الانضمام إلى غرفة"}</div>
          <div className="rm-bd">
            {/* واجهة إدخال الرمز (المنضم قبل الدخول) */}
            {!isHost && !joined && (
              <div className="rm-jp rm-dk">
                <div className="rm-lbl">أدخل رمز الغرفة</div>
                <input
                  className="rm-ci"
                  maxLength={6}
                  dir="ltr"
                  placeholder="• • • • •"
                  autoComplete="off"
                  aria-label="رمز الغرفة"
                  value={joinCode}
                  onChange={(e) =>
                    setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
                  }
                />
                <button
                  type="button"
                  className="rm-btn rm-red"
                  style={{ top: 216 }}
                  onClick={() => {
                    playTapSound();
                    if (joinCode.trim().length < 4) {
                      toast("أدخل رمز الغرفة");
                      return;
                    }
                    setShowScanner({ code: joinCode.trim(), manual: true });
                  }}
                >
                  <span>انضمام</span>
                </button>
                <div className="rm-or">— أو —</div>
                <button
                  type="button"
                  className="rm-btn rm-blue"
                  style={{ top: 372 }}
                  onClick={() => {
                    playTapSound();
                    setShowScanner({});
                  }}
                >
                  <span>📷 مسح رمز QR</span>
                </button>
              </div>
            )}

            {/* داخل الغرفة */}
            {(!isHost ? joined : true) && (
              <>
                <div className="rm-lp">
                  <div className="rm-cb rm-dk">
                    <div className="rm-t">رمز الغرفة</div>
                    <div className="rm-code">{roomCode}</div>
                    {isHost && (
                      <button type="button" className="rm-btn rm-blue" onClick={copyCode}>
                        <span>نسخ</span>
                      </button>
                    )}
                  </div>
                  <div className="rm-sb rm-dk">
                    <div className="rm-srow">
                      اللاعبين:
                      <span className="rm-stp">
                        {isHost && (
                          <button
                            type="button"
                            className="rm-ab l"
                            onClick={() => step("p", -1)}
                            aria-label="السابق"
                          >
                            <i />
                          </button>
                        )}
                        <em>{count}</em>
                        {isHost && (
                          <button
                            type="button"
                            className="rm-ab r"
                            onClick={() => step("p", 1)}
                            aria-label="التالي"
                          >
                            <i />
                          </button>
                        )}
                      </span>
                    </div>
                    <div className="rm-srow">
                      النتيجة:
                      <span className="rm-stp">
                        {isHost && (
                          <button
                            type="button"
                            className="rm-ab l"
                            onClick={() => step("t", -1)}
                            aria-label="السابق"
                          >
                            <i />
                          </button>
                        )}
                        <em>{TARGETS[cfg.t]}</em>
                        {isHost && (
                          <button
                            type="button"
                            className="rm-ab r"
                            onClick={() => step("t", 1)}
                            aria-label="التالي"
                          >
                            <i />
                          </button>
                        )}
                      </span>
                    </div>
                    <div className="rm-srow">
                      مستوى البوتات:
                      <span className="rm-stp">
                        {/* زر ديناميكي: يتبدل سهل ← متوسط ← صعب بالأسهم */}
                        {isHost && (
                          <button
                            type="button"
                            className="rm-ab l"
                            onClick={() => step("l", -1)}
                            aria-label="السابق"
                          >
                            <i />
                          </button>
                        )}
                        <em>{LEVELS[cfg.l]}</em>
                        {isHost && (
                          <button
                            type="button"
                            className="rm-ab r"
                            onClick={() => step("l", 1)}
                            aria-label="التالي"
                          >
                            <i />
                          </button>
                        )}
                      </span>
                    </div>
                  </div>
                  {isHost ? (
                    <>
                      <button
                        type="button"
                        className="rm-btn rm-blue rm-qrb"
                        onClick={() => {
                          playTapSound();
                          setQrOpen(true);
                        }}
                      >
                        <span>رمز QR</span>
                      </button>
                      <button
                        type="button"
                        className={`rm-btn rm-red rm-go ${allFilled ? "" : "rm-gray"}`}
                        onClick={startRoom}
                      >
                        <span>ابدأ المباراة</span>
                      </button>
                    </>
                  ) : (
                    <div className="rm-stt rm-dk">
                      <div>
                        بانتظار مضيفك يبدأ المباراة
                        <br />
                        <span className="rm-dots">
                          <i />
                          <i />
                          <i />
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                {seatColumns(count, renderSeat)}
              </>
            )}
          </div>
        </div>

        {/* الملف الشخصي */}
        <div
          className="su2-prof"
          onClick={() => {
            playTapSound();
            setProfileOpen(true);
          }}
          role="button"
          aria-label="الملف الشخصي"
        >
          <div className="ik-prof">
            <div className="ik-av">
              <img src={characterFace(profile.characterId)} alt={profile.name} />
            </div>
            <div className="ik-ls">
              <svg viewBox="0 0 40 40">
                <polygon
                  points="20,2 25,14 38,15 28,24 31,37 20,30 9,37 12,24 2,15 15,14"
                  fill="#1fa3e6"
                  stroke="#fff"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </svg>
              <b>{level}</b>
            </div>
            <div className="ik-xpb" aria-label="شريط الخبرة">
              <i style={{ width: `${Math.round((inLevel / needed) * 100)}%` }} />
            </div>
            {profile.country ? (
              <img
                className="ik-fb"
                src={flagUrl(profile.country) ?? undefined}
                alt={countryName(profile.country) ?? profile.country}
                style={{
                  width: 44,
                  height: 30,
                  objectFit: "cover",
                  borderRadius: 6,
                  border: "2px solid #fff",
                }}
              />
            ) : (
              <div className="ik-fb">🌐</div>
            )}
            <div className="ik-un" dir="ltr">
              {profile.name || "أنت"}
            </div>
          </div>
        </div>

        {/* رجوع */}
        <button
          type="button"
          className="su2-back"
          onClick={() => {
            playTapSound();
            onBack();
          }}
          aria-label="رجوع"
        >
          <svg viewBox="0 0 100 80">
            <path
              fill="#fff"
              d="M6 40 L42 8 L42 28 C66 26 86 26 96 8 C98 40 78 58 42 56 L42 72 Z"
            />
          </svg>
        </button>

        {toastMsg && <div className="su2-toast on">{toastMsg}</div>}
        {profileOpen && <ProfileEditor onClose={() => setProfileOpen(false)} />}
        {qrOpen && <QrModal roomCode={roomCode} isOpen onClose={() => setQrOpen(false)} />}
      </div>

      {/* شاشة الانضمام والمسح كطبقة فوقية تحافظ على بنية المسرح وملاءمته للشاشة */}
      {showScanner && (
        <div className="fixed inset-0 z-50 bg-black">
          <JoinScreen
            initialCode={showScanner.code}
            initialMode={showScanner.manual ? "MANUAL" : undefined}
            onBack={() => {
              setShowScanner(null);
              setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
              setTimeout(() => window.dispatchEvent(new Event("resize")), 300);
            }}
            onConnected={() => {
              setShowScanner(null);
              setJoined(true);
              setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
              setTimeout(() => window.dispatchEvent(new Event("resize")), 300);
            }}
          />
        </div>
      )}
    </div>
  );
};

export default RoomScreen;
