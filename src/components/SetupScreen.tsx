import { useSettings } from "../store/useSettings";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";
import { RoomConfig, createDefaultPlayers } from "../store/useRoom";
import type { Difficulty } from "../types/kout";
import { hasSavedGame, loadSavedGameState } from "../utils/persist";
import { loadProfile, characterFace, useProfile } from "../utils/profile";
import { countryName, flagUrl } from "../utils/countries";
import { useXp } from "../utils/xp";
import { useStageFit } from "../hooks/use-stage-fit";
import { playTapSound } from "../utils/audio";
import { ProfileEditor } from "./ProfileEditor";
import type { GameState } from "../types/kout";

export interface SetupScreenProps {
  onBack: () => void;
  onStartGame: (config: RoomConfig) => void;
  onResumeGame: (state: GameState) => void;
  /** Fired from the right card: إنشاء غرفة (host a room for a real player). */
  onHostRoom?: (config: RoomConfig) => void;
  /** Fired from the right card: الانضمام إلى غرفة. */
  onJoinRoom?: () => void;
  className?: string;
}

const PLAYERS = [4, 6];
const TARGETS = [26, 51, 101];
const LEVELS = ["سهل", "متوسط", "صعب"] as const;
const LEVEL_KEYS: Difficulty[] = ["EASY", "MEDIUM", "EXPERT"];
const CFG_KEY = "ikout_setup2_cfg";
const PREV_KEY = "ikout_setup2_prev";

interface StepperIndex {
  p: number;
  t: number;
  l: number;
}
const readIndex = (key: string, fallback: StepperIndex): StepperIndex => {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "null") as Partial<StepperIndex> | null;
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
const writeIndex = (key: string, value: StepperIndex) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
};

function buildConfig(
  variant: "BO6" | "BO4",
  targetScore: number,
  botDifficulty: Difficulty,
): RoomConfig {
  const players = createDefaultPlayers(variant, botDifficulty).map((p) =>
    p.seatIndex === 0 ? { ...p, name: loadProfile().name || "أنت" } : p,
  );
  return { variant, targetScore, botDifficulty, players };
}

/** The city skyline of the 2400x1080 design, drawn once as SVG rects. */
const CitySkyline: React.FC = () => {
  const B: Array<[number, number, number]> = [
    [0, 60, 482],
    [60, 60, 512],
    [120, 70, 532],
    [190, 60, 500],
    [250, 50, 542],
    [300, 60, 490],
    [360, 60, 532],
    [420, 50, 512],
    [470, 40, 562],
    [505, 55, 440],
    [560, 45, 522],
    [600, 50, 578],
    [650, 50, 546],
    [700, 45, 582],
    [800, 50, 572],
    [850, 50, 536],
    [900, 60, 592],
    [960, 60, 546],
    [1020, 50, 510],
    [1070, 40, 552],
    [1110, 38, 468],
    [1148, 52, 522],
    [1200, 60, 562],
    [1260, 60, 536],
    [1320, 50, 502],
    [1370, 50, 546],
    [1420, 50, 486],
    [1470, 66, 530],
  ];
  return (
    <svg className="su2-sk" viewBox="0 0 1536 691" preserveAspectRatio="none">
      <g fill="#3b4247">
        {B.map(([x, w, t], i) => (
          <rect key={`a${i}`} x={x + w / 2} y={t - 38} width={w} height={500} />
        ))}
      </g>
      <g fill="#4b5359">
        <rect x={764} y={500} width={10} height={200} />
        <ellipse cx={769} cy={494} rx={16} ry={30} />
        <rect x={767} y={430} width={4} height={64} />
      </g>
      <g fill="#232628">
        {B.map(([x, w, t], i) => (
          <g key={`b${i}`}>
            <rect x={x} y={t} width={w + 1} height={700 - t} />
            {t < 500 && <rect x={x + w / 2 - 1} y={t - 26} width={3} height={27} />}
          </g>
        ))}
      </g>
    </svg>
  );
};

/** The seven drifting cloud clusters of the design. */
const Su2Clouds: React.FC = () => {
  const clouds = [
    { left: 215, top: 150, w: 430, dur: 24, delay: 0 },
    { left: 1030, top: 150, w: 445, dur: 30, delay: -8 },
    { left: 1930, top: 160, w: 440, dur: 27, delay: -14 },
    { left: 1285, top: 295, w: 255, dur: 20, delay: -5 },
    { left: 400, top: 390, w: 185, dur: 26, delay: -11 },
    { left: -40, top: 325, w: 100, dur: 18, delay: 0 },
    { left: 1720, top: 390, w: 160, dur: 23, delay: -3 },
  ];
  return (
    <>
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <linearGradient id="su2-cg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#eef2ea" />
            <stop offset="1" stopColor="#bfc9bb" />
          </linearGradient>
        </defs>
      </svg>
      {clouds.map((c, i) => (
        <svg
          key={i}
          className="su2-cl"
          viewBox="0 0 300 100"
          style={{
            left: c.left,
            top: c.top,
            width: c.w,
            animationDuration: `${c.dur}s`,
            animationDelay: `${c.delay}s`,
          }}
        >
          <g fill="url(#su2-cg)">
            <ellipse cx={150} cy={78} rx={145} ry={20} />
            <circle cx={85} cy={58} r={30} />
            <circle cx={145} cy={42} r={40} />
            <circle cx={210} cy={56} r={32} />
          </g>
        </svg>
      ))}
    </>
  );
};

/**
 * The second screen (after the ikout card), ported 1:1 from the approved
 * شاشة_التدريب design on a fixed 2400x1080 stage: the training card with
 * resume + players + score limit (القيد) + bot level, the network card with
 * room buttons on the right, and the profile chip opening the editor.
 * Every button is wired to its real app function.
 */
export const SetupScreen: React.FC<SetupScreenProps> = ({
  onBack,
  onStartGame,
  onResumeGame,
  onHostRoom,
  onJoinRoom,
  className = "",
}) => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const { settings } = useSettings();
  useStageFit(stageRef, 2400, 1080, settings.orientationPreference);
  const profile = useProfile();
  const { level, inLevel, needed } = useXp();
  const [profileOpen, setProfileOpen] = useState(false);
  const [cfg, setCfgState] = useState<StepperIndex>(() => readIndex(CFG_KEY, { p: 0, t: 0, l: 1 }));
  const [prev, setPrev] = useState<StepperIndex>(() => readIndex(PREV_KEY, { p: 0, t: 0, l: 1 }));
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saved = hasSavedGame() ? loadSavedGameState() : null;

  const setCfg = (next: StepperIndex) => {
    setCfgState(next);
    writeIndex(CFG_KEY, next);
  };

  const toast = (m: string) => {
    setToastMsg(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2200);
  };

  const step = (k: keyof StepperIndex, d: number) => {
    playTapSound();
    const n = { p: PLAYERS.length, t: TARGETS.length, l: LEVELS.length }[k];
    setCfg({ ...cfg, [k]: (cfg[k] + d + n) % n });
  };

  const config = () => buildConfig(cfg.p === 0 ? "BO4" : "BO6", TARGETS[cfg.t], LEVEL_KEYS[cfg.l]);

  const newGame = () => {
    playTapSound();
    setPrev(cfg);
    writeIndex(PREV_KEY, cfg);
    onStartGame(config());
  };

  const resume = () => {
    playTapSound();
    const state = loadSavedGameState();
    if (state) onResumeGame(state);
    else toast("لا توجد لعبة محفوظة");
  };

  const createRoom = () => {
    playTapSound();
    if (onHostRoom) onHostRoom(config());
    else toast("إنشاء الغرفة غير متاح حالياً");
  };

  const joinRoom = () => {
    playTapSound();
    if (onJoinRoom) onJoinRoom();
    else toast("الانضمام غير متاح حالياً");
  };

  // Resume panel numbers: the saved game's own match when one exists, else the last started config.
  const savedPlayers = saved?.players?.length ?? PLAYERS[prev.p];
  const savedTarget = saved?.targetScore ?? TARGETS[prev.t];
  const savedLevel = LEVELS[prev.l];

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  return (
    <div dir="rtl" className={`ik-home su2-root ${className}`} style={{ background: "#1a2128" }}>
      <div ref={stageRef} className="su2-stage">
        <div className="su2-glow" />
        <Su2Clouds />
        <div className="su2-sun" />
        <CitySkyline />
        <div className="su2-haze" />

        {/* Profile chip (top-left, enlarged) — opens the profile editor */}
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

        {/* Back */}
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

        {/* Training / setup card */}
        <div className="su2-card">
          <div className="su2-hd">تدريب</div>
          <div className="su2-bd">
            <div className="su2-rp">
              <div className="su2-rq">
                هل تريد متابعة
                <br />
                اللعبة السابقة؟
              </div>
              <div className="su2-rb">
                <div className="su2-r1">
                  <div className="su2-tx">
                    <div className="su2-s">النتيجة:</div>
                    <div className="su2-v">{savedTarget}</div>
                  </div>
                  <div className="su2-dm">
                    <b>{savedPlayers}</b>
                  </div>
                </div>
                <div className="su2-r2">
                  المستوى: <em>{savedLevel}</em>
                </div>
              </div>
              <button type="button" className="su2-btn su2-red" onClick={resume}>
                <span>استمرار</span>
              </button>
            </div>

            <div className="su2-col">
              <div className="su2-lb" style={{ top: 4 }}>
                اللاعبين:
              </div>
              <div className="su2-sp" style={{ top: 40 }}>
                <button
                  type="button"
                  className="su2-ab su2-l"
                  onClick={() => step("p", -1)}
                  aria-label="السابق"
                >
                  <i className="su2-tri" />
                </button>
                <div className="su2-nm">{PLAYERS[cfg.p]}</div>
                <button
                  type="button"
                  className="su2-ab su2-r"
                  onClick={() => step("p", 1)}
                  aria-label="التالي"
                >
                  <i className="su2-tri" />
                </button>
              </div>

              <div className="su2-lb" style={{ top: 118 }}>
                القيد:
              </div>
              <div className="su2-sp" style={{ top: 154 }}>
                <button
                  type="button"
                  className="su2-ab su2-l"
                  onClick={() => step("t", -1)}
                  aria-label="السابق"
                >
                  <i className="su2-tri" />
                </button>
                <div className="su2-nm">{TARGETS[cfg.t]}</div>
                <button
                  type="button"
                  className="su2-ab su2-r"
                  onClick={() => step("t", 1)}
                  aria-label="التالي"
                >
                  <i className="su2-tri" />
                </button>
              </div>

              <div className="su2-lb" style={{ top: 232 }}>
                مستوى البوتات:
              </div>
              <div className="su2-sp" style={{ top: 268 }}>
                <button
                  type="button"
                  className="su2-ab su2-l"
                  onClick={() => step("l", -1)}
                  aria-label="السابق"
                >
                  <i className="su2-tri" />
                </button>
                <div className="su2-nm su2-t">{LEVELS[cfg.l]}</div>
                <button
                  type="button"
                  className="su2-ab su2-r"
                  onClick={() => step("l", 1)}
                  aria-label="التالي"
                >
                  <i className="su2-tri" />
                </button>
              </div>

              <button type="button" className="su2-btn su2-nb" onClick={newGame}>
                <span>مباراة جديدة</span>
              </button>
            </div>
          </div>
        </div>

        {/* Network play card (right) */}
        <div className="su2-net">
          <div className="su2-hd su2-nethd">لعب مشترك</div>
          <div className="su2-bd">
            <div className="su2-ic">
              <svg viewBox="0 0 200 200">
                <circle cx="100" cy="100" r="78" fill="none" stroke="#fff" strokeWidth="12" />
                <ellipse
                  cx="100"
                  cy="100"
                  rx="34"
                  ry="78"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="10"
                />
                <path
                  d="M24 100H176M36 62H164M36 138H164"
                  stroke="#fff"
                  strokeWidth="9"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <button type="button" className="su2-btn su2-red su2-c1" onClick={createRoom}>
              <span>إنشاء غرفة</span>
            </button>
            <button type="button" className="su2-btn su2-red" onClick={joinRoom}>
              <span>الانضمام إلى غرفة</span>
            </button>
          </div>
        </div>

        {toastMsg && <div className="su2-toast on">{toastMsg}</div>}
        {profileOpen && <ProfileEditor onClose={() => setProfileOpen(false)} />}
      </div>
    </div>
  );
};

export default SetupScreen;
