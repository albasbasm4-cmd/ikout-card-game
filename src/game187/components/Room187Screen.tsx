import { useSettings } from "../../store/useSettings";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";
import { Player187 } from "../types";
import { useProfile, characterFace } from "../../utils/profile";
import { flagUrl, countryName } from "../../utils/countries";
import { useXp } from "../../utils/xp";
import { useStageFit } from "../../hooks/use-stage-fit";
import { playTapSound } from "../../utils/audio";
import { ProfileEditor } from "../../components/ProfileEditor";
import {
  Room187Channel,
  Client187Packet,
  Host187Packet,
  findMySeat187,
} from "../network/network187";
import "../styles/room187.css";

export interface Room187ScreenProps {
  onBack: () => void;
  onStartMatch: (
    players: Player187[],
    mode: "single" | "room",
    roomCode?: string,
    /** مقعد الجهاز في الغرفة: المضيف مقعد 0، وكل منضم يحدد مقعده برمز جهازه. */
    seatInfo?: { isHost: boolean; mySeat: number },
  ) => void;
  onResumeMatch: () => void;
  hasSavedGame?: boolean;
}

type ScreenMode = "main" | "room" | "join";

export const Room187Screen: React.FC<Room187ScreenProps> = ({
  onBack,
  onStartMatch,
  onResumeMatch,
  hasSavedGame = false,
}) => {
  const profile = useProfile();
  const { level, inLevel, needed } = useXp();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const { settings } = useSettings();

  const [screen, setScreen] = useState<ScreenMode>("main");
  const [roomMode, setRoomMode] = useState<"host" | "join">("host");
  const [roomCode, setRoomCode] = useState("");
  const [inputCode, setInputCode] = useState("");
  const [seats, setSeats] = useState<(Player187 | null)[]>([null, null, null, null, null]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const channelRef = useRef<Room187Channel | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);
  /** رمز جهاز هذا المنضم؛ يحدد مقعده عند بدء المباراة بدل افتراض مقعد ثابت. */
  const myTokenRef = useRef<string>(`${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  const seatsRef = useRef(seats);
  seatsRef.current = seats;
  const onStartMatchRef = useRef(onStartMatch);
  onStartMatchRef.current = onStartMatch;
  /** يُرفع مع كل فتح غرفة/انضمام لإعادة إنشاء القناة حتى مع تكرار نفس الرمز. */
  const [joinNonce, setJoinNonce] = useState(0);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = window.setTimeout(() => setToastMsg(null), 2500);
  };

  useStageFit(stageRef, 2400, 1080, settings.orientationPreference);

  const generateCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let res = "";
    for (let i = 0; i < 5; i++) res += chars[Math.floor(Math.random() * chars.length)];
    return res;
  };

  // قناة الغرفة: تُنشأ مرة واحدة لكل فتح غرفة/انضمام (نظيفة مع StrictMode)،
  // والمضيف يستقبل الانضمامات ويخزن رمز جهاز كل منضم في مقعده.
  useEffect(() => {
    if (roomMode !== "host" && roomMode !== "join") return;
    if (!roomCode) return;

    channelRef.current?.close();
    const ch = new Room187Channel(roomCode);
    channelRef.current = ch;

    if (roomMode === "host") {
      ch.onMessage((msg: Client187Packet) => {
        if (msg.type !== "JOIN") return;
        // منضم معاد (إعادة إرسال بعد إعادة تركيب القناة): أعد إرسال المقاعد فقط.
        const existingIdx = seatsRef.current.findIndex(
          (seat) => seat && seat.clientToken && seat.clientToken === msg.clientToken,
        );
        if (existingIdx !== -1) {
          ch.send({ type: "ROOM_SEATS_UPDATE", seats: seatsRef.current });
          return;
        }
        const emptyIdx = seatsRef.current.findIndex((seat, idx) => idx > 0 && seat === null);
        if (emptyIdx === -1) {
          ch.send({ type: "ERROR", message: "الغرفة ممتلئة" });
          return;
        }
        setSeats((prev) => {
          if (prev[emptyIdx] !== null) return prev;
          const updated = [...prev];
          updated[emptyIdx] = {
            seatIndex: emptyIdx,
            kind: "REMOTE",
            name: msg.playerName,
            characterId: msg.characterId,
            clientToken: msg.clientToken,
          };
          return updated;
        });
      });
    } else {
      ch.onMessage((msg: Host187Packet) => {
        if (msg.type === "ROOM_SEATS_UPDATE") {
          setSeats(msg.seats);
        } else if (msg.type === "GAME_START") {
          // كل منضم يحدد مقعده من رمز جهازه بدل مقعد ثابت لجميع المنضمين.
          const mySeat = findMySeat187(msg.state.players, myTokenRef.current);
          onStartMatchRef.current(msg.state.players, "room", roomCode, {
            isHost: false,
            mySeat,
          });
        } else if (msg.type === "ERROR") {
          showToast(msg.message);
        }
      });
      // طلب الانضمام (تكراره غير ضار: المضيف يزيل التكرار برمز الجهاز)
      ch.send({
        type: "JOIN",
        playerName: profile.name || "لاعب",
        characterId: profile.characterId,
        clientToken: myTokenRef.current,
      });
    }

    return () => {
      ch.close();
      if (channelRef.current === ch) channelRef.current = null;
    };
  }, [roomMode, roomCode, joinNonce]);

  // بث المقاعد من المضيف عند كل تغيير (إضافة/إزالة بوت أو انضمام)
  useEffect(() => {
    if (roomMode !== "host" || !roomCode) return;
    channelRef.current?.send({ type: "ROOM_SEATS_UPDATE", seats });
  }, [roomMode, roomCode, seats]);

  const openHostRoom = () => {
    playTapSound();
    const code = generateCode();
    setRoomCode(code);
    setRoomMode("host");
    setJoinNonce((n) => n + 1);

    const initialSeats: (Player187 | null)[] = [
      {
        seatIndex: 0,
        kind: "HUMAN_LOCAL",
        name: profile.name || "أنت",
        isHost: true,
        characterId: profile.characterId,
      },
      null,
      null,
      null,
      null,
    ];
    setSeats(initialSeats);

    setScreen("room");
  };

  const openJoinScreen = () => {
    playTapSound();
    setInputCode("");
    setScreen("join");
  };

  // إلغاء وضع الانضمام عند الخروج من شاشة الانضمام/الغرفة حتى لا تبقى القناة تعمل
  const exitRoomMode = () => {
    setRoomMode("host");
    setRoomCode("");
  };

  const handleJoinByCode = (code: string) => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) {
      showToast("أدخل رمز الغرفة بشكل صحيح");
      return;
    }
    setRoomCode(trimmed);
    setRoomMode("join");
    // رفع العداد يجدّد القناة ويعيد إرسال طلب الانضمام حتى مع نفس الرمز
    setJoinNonce((n) => n + 1);
    setScreen("room");
  };

  const addBotToSeat = (idx: number) => {
    playTapSound();
    const botNames = ["سالم", "فهد", "مبارك", "طلال", "سعد"];
    const usedNames = seats.filter((s) => s && s.kind === "AI_BOT").map((s) => s!.name);
    const availableName = botNames.find((n) => !usedNames.includes(n)) || `بوت ${idx + 1}`;

    const newSeats = [...seats];
    newSeats[idx] = {
      seatIndex: idx,
      kind: "AI_BOT",
      name: availableName,
    };
    setSeats(newSeats);
  };

  const removeSeat = (idx: number) => {
    playTapSound();
    const newSeats = [...seats];
    newSeats[idx] = null;
    setSeats(newSeats);
  };

  const handleStartRoomGame = () => {
    playTapSound();
    if (!seats.every(Boolean)) {
      showToast("أكمل جميع المقاعد الـ 5 أولاً");
      return;
    }
    const finalPlayers: Player187[] = seats.map((s, i) => ({
      ...s!,
      seatIndex: i,
    }));

    // إرسال بدء المباراة لجميع المنضمين في الغرفة
    // (كل منضم يحدد مقعده بنفسه من رمز جهازه، فلا مقعد ثابت للجميع)
    channelRef.current?.send({
      type: "GAME_START",
      state: {
        roundNo: 1,
        dealer: 0,
        currentSeat: 1,
        hands: [[], [], [], [], []],
        tableCards: [],
        bids: [],
        passedSeats: [false, false, false, false, false],
        highBid: null,
        bidderSeat: null,
        trump: null,
        currentTrick: [],
        trickHistory: [],
        tricksWon: [0, 0, 0, 0, 0],
        capturedCards: [[], [], [], [], []],
        hakemPoints: 0,
        opponentsPoints: 0,
        earlySettled: false,
        earlySettledWinner: null,
        continueAfterEarlySettle: false,
        phase: "DEAL",
        players: finalPlayers,
        winner: null,
        version: 1,
      },
    });

    onStartMatch(finalPlayers, "room", roomCode, { isHost: true, mySeat: 0 });
  };

  const handleStartTrainingNew = () => {
    playTapSound();
    const trainingPlayers: Player187[] = [
      {
        seatIndex: 0,
        kind: "HUMAN_LOCAL",
        name: profile.name || "أنت",
        characterId: profile.characterId,
      },
      { seatIndex: 1, kind: "AI_BOT", name: "سالم" },
      { seatIndex: 2, kind: "AI_BOT", name: "فهد" },
      { seatIndex: 3, kind: "AI_BOT", name: "مبارك" },
      { seatIndex: 4, kind: "AI_BOT", name: "طلال" },
    ];
    onStartMatch(trainingPlayers, "single");
  };

  const handleResumeTraining = () => {
    playTapSound();
    if (hasSavedGame) {
      onResumeMatch();
    } else {
      showToast("لا توجد مباراة محفوظة");
    }
  };

  const handleBack = () => {
    playTapSound();
    if (screen === "room" || screen === "join") {
      channelRef.current?.close();
      exitRoomMode();
      setScreen("main");
    } else {
      onBack();
    }
  };

  const copyCode = () => {
    playTapSound();
    try {
      navigator.clipboard.writeText(roomCode);
      showToast("تم نسخ رمز الغرفة");
    } catch {
      showToast(`الرمز: ${roomCode}`);
    }
  };

  return (
    <div dir="rtl" className="r187-root">
      <div id="st" ref={stageRef} className="r187-st">
        {/* Glow & Sun */}
        <div className="r187-glow" />
        <div className="r187-sun" />

        {/* Clouds */}
        <svg className="r187-cl" viewBox="0 0 300 100" style={{ left: 215, top: 150, width: 430 }}>
          <path fill="#eef2ea" d="M150,58 a145,20 0 1,0 1,0 Z" />
        </svg>
        <svg className="r187-cl" viewBox="0 0 300 100" style={{ left: 1030, top: 150, width: 445 }}>
          <path fill="#eef2ea" d="M150,58 a145,20 0 1,0 1,0 Z" />
        </svg>
        <svg className="r187-cl" viewBox="0 0 300 100" style={{ left: 1930, top: 160, width: 440 }}>
          <path fill="#eef2ea" d="M150,58 a145,20 0 1,0 1,0 Z" />
        </svg>

        {/* Skyline */}
        <svg className="r187-sk" viewBox="0 0 1536 691" preserveAspectRatio="none">
          <g fill="#3b4247">
            <rect x="764" y="500" width="10" height="200" />
            <ellipse cx="769" cy="494" rx="16" ry="30" />
            <rect x="767" y="430" width="4" height="64" />
          </g>
        </svg>

        {/* Profile Cluster HUD */}
        <div
          className="r187-prof"
          onClick={() => {
            playTapSound();
            setProfileOpen(true);
          }}
          role="button"
          aria-label="الملف الشخصي"
        >
          <div className="r187-av">
            <img
              src={characterFace(profile.characterId)}
              alt={profile.name}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
          <div className="r187-ls">
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
          <div className="r187-xpb" aria-label="شريط الخبرة">
            <i style={{ width: `${Math.round((inLevel / needed) * 100)}%` }} />
          </div>
          {profile.country ? (
            <img
              className="r187-fb"
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
            <div className="r187-fb">🌐</div>
          )}
          <div className="r187-un" dir="ltr">
            {profile.name || "أنت"}
          </div>
        </div>

        {/* Back Button */}
        <button type="button" className="r187-back" onClick={handleBack} aria-label="رجوع">
          <svg viewBox="0 0 100 80">
            <path
              fill="#fff"
              d="M6 40 L42 8 L42 28 C66 26 86 26 96 8 C98 40 78 58 42 56 L42 72 Z"
            />
          </svg>
        </button>

        {/* ===== Main Menu: تدريب / لعب مشترك ===== */}
        {screen === "main" && (
          <div className="r187-mm">
            {/* بطاقة التدريب */}
            <div className="r187-mm-card pk">
              <div className="r187-mm-hd">تدريب</div>
              <div className="r187-mm-ring">
                <svg viewBox="0 0 100 100">
                  <circle cx="50" cy="35.4" r="14.8" fill="#fff" />
                  <path
                    fill="#fff"
                    d="M23 86.8V67.2A14 14 0 0 1 37 53.2H63A14 14 0 0 1 77 67.2V86.8Z"
                  />
                </svg>
              </div>
              <button
                type="button"
                className="r187-btn r187-red r187-mm-b b1"
                onClick={handleResumeTraining}
              >
                <span>استئناف</span>
              </button>
              <button
                type="button"
                className="r187-btn r187-lpink r187-mm-b b2"
                onClick={handleStartTrainingNew}
              >
                <span>بدء مباراة جديدة</span>
              </button>
            </div>

            {/* بطاقة اللعب المشترك */}
            <div className="r187-mm-card bl">
              <div className="r187-mm-hd">لعب مشترك</div>
              <div className="r187-mm-globe">
                <svg viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="46.4" fill="none" stroke="#fff" strokeWidth="7.2" />
                  <ellipse
                    cx="50"
                    cy="50"
                    rx="19.5"
                    ry="44"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="6.5"
                  />
                  <path d="M4 50H96 M12 25H88 M12 75H88" stroke="#fff" strokeWidth="5.5" />
                </svg>
              </div>
              <button
                type="button"
                className="r187-btn r187-red r187-mm-b b1"
                onClick={openHostRoom}
              >
                <span>إنشاء غرفة</span>
              </button>
              <button
                type="button"
                className="r187-btn r187-red r187-mm-b b2"
                onClick={openJoinScreen}
              >
                <span>الانضمام إلى غرفة</span>
              </button>
            </div>
          </div>
        )}

        {/* ===== Join Screen ===== */}
        {screen === "join" && (
          <div className="r187-card r187-jv-card">
            <div className="r187-hd">الانضمام إلى غرفة</div>
            <div className="r187-bd">
              <input
                className="r187-ci"
                maxLength={6}
                dir="ltr"
                placeholder="• • • • •"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                autoComplete="off"
                aria-label="رمز الغرفة"
              />
              <button
                type="button"
                className="r187-btn r187-red"
                style={{
                  position: "relative",
                  width: 340,
                  height: 78,
                  margin: "0 auto 16px",
                  display: "grid",
                }}
                onClick={() => handleJoinByCode(inputCode)}
              >
                <span>انضمام</span>
              </button>
              <div className="r187-or">— أو —</div>
              <button
                type="button"
                className="r187-btn r187-blue"
                style={{
                  position: "relative",
                  width: 380,
                  height: 72,
                  margin: "0 auto",
                  display: "grid",
                }}
                onClick={() => setScanOpen(true)}
              >
                <span>📷 مسح رمز QR</span>
              </button>
            </div>
          </div>
        )}

        {/* ===== Room Screen (5 مقاعد) ===== */}
        {screen === "room" && (
          <div className="r187-card r187-rm-card">
            <div className="r187-hd">
              {roomMode === "host" ? "إنشاء غرفة (187)" : "الانضمام إلى غرفة (187)"}
            </div>
            <div className="r187-bd">
              {/* Left Panel */}
              <div className="r187-lp">
                <div className="r187-cb r187-dk">
                  <div className="t">رمز الغرفة</div>
                  <div className="c">{roomCode}</div>
                  <button type="button" className="r187-btn r187-blue" onClick={copyCode}>
                    <span>نسخ</span>
                  </button>
                </div>

                <div className="r187-sb r187-dk">
                  <div>
                    اللاعبون <em>{seats.filter(Boolean).length}</em> / <em>5</em>
                  </div>
                </div>

                {roomMode === "host" ? (
                  <>
                    <button
                      type="button"
                      id="r187-qrb"
                      className="r187-btn r187-blue"
                      onClick={() => setQrOpen(true)}
                    >
                      <span>رمز QR</span>
                    </button>
                    <button
                      type="button"
                      id="r187-go"
                      className={`r187-btn r187-red ${seats.every(Boolean) ? "" : "r187-gray"}`}
                      onClick={handleStartRoomGame}
                    >
                      <span>ابدأ المباراة</span>
                    </button>
                  </>
                ) : (
                  <div className="r187-stt r187-dk">
                    <div>
                      بانتظار المضيف يبدأ المباراة...
                      <br />
                      <span style={{ fontSize: 22, color: "var(--cyan)" }}>• • •</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Seats Grid: 5 Seats */}
              <div className="r187-sa">
                {seats.map((seat, idx) => {
                  if (!seat) {
                    return (
                      <div key={idx} className="r187-seat empty">
                        <div className="r187-seatnum">{idx + 1}</div>
                        <div className="r187-av2">+</div>
                        <div className="r187-sn">مقعد فارغ</div>
                        {roomMode === "host" && (
                          <button
                            type="button"
                            className="r187-chip"
                            onClick={() => addBotToSeat(idx)}
                          >
                            + بوت
                          </button>
                        )}
                      </div>
                    );
                  }

                  const isBot = seat.kind === "AI_BOT";
                  const isMe = idx === (roomMode === "host" ? 0 : 1);

                  return (
                    <div
                      key={idx}
                      className={`r187-seat ${isBot ? "bot" : ""} ${isMe ? "me" : ""}`}
                    >
                      <div className="r187-seatnum">{idx + 1}</div>
                      <div className="r187-av2">
                        {isBot ? (
                          "🤖"
                        ) : (
                          <img
                            src={characterFace(profile.characterId)}
                            alt=""
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        )}
                      </div>
                      <div className="r187-sn" dir="auto">
                        {seat.name}
                      </div>
                      <div className="r187-bg">
                        {seat.isHost && <b className="r187-ho">المضيف</b>}
                        <b className={isBot ? "r187-bt" : "r187-hu"}>{isBot ? "بوت" : "بشري"}</b>
                      </div>
                      {roomMode === "host" && !seat.isHost && (
                        <button
                          type="button"
                          className="r187-chip"
                          style={{
                            background: "linear-gradient(var(--red-top), var(--red-bot))",
                            borderColor: "#ff948a",
                          }}
                          onClick={() => removeSeat(idx)}
                        >
                          ✕ إزالة
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Profile Editor Modal */}
        {profileOpen && <ProfileEditor game="187" onClose={() => setProfileOpen(false)} />}

        {/* QR Code Modal */}
        {qrOpen && (
          <div className="r187-md" onClick={() => setQrOpen(false)}>
            <div className="r187-mc" onClick={(e) => e.stopPropagation()}>
              <h2 style={{ fontSize: 32, fontWeight: 900, marginBottom: 16 }}>رمز QR للغرفة</h2>
              <div
                style={{
                  background: "#fff",
                  padding: 16,
                  borderRadius: 16,
                  display: "inline-block",
                  marginBottom: 16,
                }}
              >
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=ikout187:${roomCode}`}
                  alt="QR Code"
                  style={{ width: 220, height: 220 }}
                />
              </div>
              <p style={{ fontSize: 24, fontWeight: 800, marginBottom: 20 }}>
                رمز الغرفة:{" "}
                <span dir="ltr" style={{ color: "var(--cyan)" }}>
                  {roomCode}
                </span>
              </p>
              <button
                type="button"
                className="r187-btn r187-red"
                style={{
                  position: "relative",
                  width: 200,
                  height: 60,
                  margin: "0 auto",
                  display: "grid",
                }}
                onClick={() => setQrOpen(false)}
              >
                <span>إغلاق</span>
              </button>
            </div>
          </div>
        )}

        {/* Scan Camera Modal */}
        {scanOpen && (
          <div className="r187-md" onClick={() => setScanOpen(false)}>
            <div className="r187-mc" onClick={(e) => e.stopPropagation()}>
              <h2 style={{ fontSize: 28, fontWeight: 900, marginBottom: 16 }}>مسح رمز QR</h2>
              <p style={{ fontSize: 18, marginBottom: 20 }}>وجّه الكاميرا نحو رمز الغرفة</p>
              <button
                type="button"
                className="r187-btn r187-red"
                style={{
                  position: "relative",
                  width: 200,
                  height: 60,
                  margin: "0 auto",
                  display: "grid",
                }}
                onClick={() => setScanOpen(false)}
              >
                <span>إلغاء</span>
              </button>
            </div>
          </div>
        )}

        {/* Toast Alert */}
        {toastMsg && (
          <div
            style={{
              position: "absolute",
              bottom: 40,
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(0,0,0,0.85)",
              border: "2px solid var(--cyan)",
              color: "#fff",
              padding: "12px 28px",
              borderRadius: 30,
              fontSize: 22,
              fontWeight: 800,
              zIndex: 200,
            }}
          >
            {toastMsg}
          </div>
        )}
      </div>
    </div>
  );
};

export default Room187Screen;
