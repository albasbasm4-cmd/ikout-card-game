import { FrameRateTarget, loadTargetFps, saveTargetFps } from "../utils/frameRate";
import { Gauge } from "lucide-react";
import { checkVipCode, loadVipIndex, redeemVipForCharacter } from "../utils/cheatCode";
import { createPortal } from "react-dom";
import { KeyRound } from "lucide-react";

import {
  loadCustomAvatar,
  saveCustomAvatar,
  hasCustomAvatar,
  CustomAvatarData,
  CustomVoiceClip,
} from "../utils/customAvatar";
import { Sparkles, Plus, Trash2, Camera, Upload } from "lucide-react";
import { adManager } from "../ads/AdManager";
import { Video } from "lucide-react";
/** @license SPDX-License-Identifier: Apache-2.0 */
import React, { useState, useEffect } from "react";
import {
  UserRound,
  Layers,
  Image as ImageIcon,
  RectangleHorizontal,
  Flag,
  Volume2,
  X,
  Check,
  IdCard,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  BG_THEMES,
  CARD_THEMES,
  CHARACTER_IDS,
  TABLE_THEMES,
  characterFace,
  saveProfile,
  useProfile,
} from "../utils/profile";
import { MUSLIM_COUNTRIES, flagUrl, countryName } from "../utils/countries";
import { CharacterId } from "../utils/gamePresentation";
import { playRandomCharacterClip } from "../utils/characterAudio";
import { playTapSound } from "../utils/audio";

export interface ProfileEditorProps {
  onClose: () => void;
  game?: "kout" | "187";
}
type Tab = "character" | "cards" | "table" | "background" | "flag" | "identity";
const TABS = [
  { id: "character" as const, label: "الشخصيات", icon: UserRound },
  { id: "cards" as const, label: "الأوراق", icon: Layers },
  { id: "table" as const, label: "الطاولات", icon: RectangleHorizontal },
  { id: "background" as const, label: "الخلفيات", icon: ImageIcon },
  { id: "flag" as const, label: "الأعلام", icon: Flag },
  { id: "identity" as const, label: "الملف الشخصي", icon: IdCard },
];
export const ProfileEditor: React.FC<ProfileEditorProps> = ({ onClose, game = "kout" }) => {
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customData, setCustomData] = useState<CustomAvatarData>(loadCustomAvatar());
  const [customAdProgress, setCustomAdProgress] = useState(adManager.getCustomAvatarAdProgress());
  const [newClipName, setNewClipName] = useState("");
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordTimer, setRecordTimer] = useState<number>(0);
  const [cheatCodeInput, setCheatCodeInput] = useState("");
  const [cheatFeedback, setCheatFeedback] = useState<{ text: string; isError: boolean } | null>(
    null,
  );
  const [charListVersion, setCharListVersion] = useState(0);
  const [vipPick, setVipPick] = useState(false);
  const [vipChoice, setVipChoice] = useState<string | null>(null);
  const [targetFps, setTargetFps] = useState<FrameRateTarget>(loadTargetFps());

  useEffect(() => {
    const handleUnlocked = () => setCharListVersion((v) => v + 1);
    window.addEventListener("ikout_characters_unlocked", handleUnlocked);
    return () => window.removeEventListener("ikout_characters_unlocked", handleUnlocked);
  }, []);

  const profile = useProfile();
  const [tab, setTab] = useState<Tab>("character");
  const choose = (partial: Parameters<typeof saveProfile>[0]) => {
    playTapSound();
    saveProfile(partial);
  };
  return (
    <section
      className="pc-catalog"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label="خيارات اللاعب"
    >
      <header className="pc-header">
        <nav className="pc-tabs" aria-label="أقسام الخيارات">
          {TABS.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              variant="ghost"
              title={label}
              aria-label={label}
              aria-pressed={tab === id}
              className={`pc-tab ${tab === id ? "pc-selected" : ""}`}
              onClick={() => {
                playTapSound();
                setTab(id);
              }}
            >
              <Icon />
            </Button>
          ))}
        </nav>
        <Button
          variant="ghost"
          size="icon"
          className="pc-close"
          onClick={onClose}
          aria-label="إغلاق"
        >
          <X />
        </Button>
      </header>
      <h2>{TABS.find((t) => t.id === tab)?.label}</h2>
      {tab === "character" && vipPick && (
        <div className="pc-vip-pick" role="status">
          <span>{cheatFeedback?.text ?? "اختر شخصية واحدة مقفلة لفتحها بالكود"}</span>
          <Button
            disabled={!vipChoice}
            onClick={() => {
              if (!vipChoice) return;
              const r = redeemVipForCharacter(vipChoice);
              setCheatFeedback({ text: r.message, isError: !r.success });
              setVipPick(false);
              setVipChoice(null);
              if (r.success) choose({ characterId: vipChoice as never });
              setCharListVersion((v) => v + 1);
            }}
          >
            <Check /> تأكيد
          </Button>
          <Button variant="ghost" onClick={() => { setVipPick(false); setVipChoice(null); }}>
            إلغاء
          </Button>
        </div>
      )}
      {tab === "character" && (
        <div className="pc-grid" key={charListVersion}>
          {/* أول خيار: إنشاء وتخصيص شخصية جديدة */}
          <div className="pc-character" style={{ position: "relative" }}>
            <Button
              variant="ghost"
              className={`pc-item ${profile.characterId === "custom" ? "pc-selected" : ""}`}
              aria-label="شخصيتي المخصصة"
              aria-pressed={profile.characterId === "custom"}
              onClick={() => {
                if (hasCustomAvatar()) {
                  choose({ characterId: "custom" });
                } else {
                  setShowCustomModal(true);
                }
              }}
              style={{
                border: "2px dashed #eab308",
                background:
                  profile.characterId === "custom"
                    ? "rgba(234, 179, 8, 0.2)"
                    : "rgba(255, 255, 255, 0.05)",
              }}
            >
              {customData.avatarImage ? (
                <img
                  src={customData.avatarImage}
                  alt={customData.name}
                  style={{
                    objectFit: "cover",
                    width: "100%",
                    height: "100%",
                    borderRadius: "inherit",
                  }}
                />
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    color: "#eab308",
                  }}
                >
                  <Sparkles size={28} />
                  <span style={{ fontSize: "11px", marginTop: "4px", fontWeight: "bold" }}>
                    تخصيص
                  </span>
                </div>
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="pc-voice"
              title="تعديل الشخصية المخصصة"
              onClick={() => setShowCustomModal(true)}
              style={{ background: "#eab308", color: "#000" }}
            >
              <Sparkles size={14} />
            </Button>
          </div>

          {CHARACTER_IDS.map((id, index) => {
            const isRewardLocked = index >= 3;
            const adProgress = adManager.getCharacterAdProgress(id);
            const isUnlocked = !isRewardLocked || adProgress.unlocked;

            return (
              <div key={id} className="pc-character" style={{ position: "relative" }}>
                <Button
                  variant="ghost"
                  className={`pc-item ${(vipPick ? vipChoice === id : profile.characterId === id) ? "pc-selected" : ""}`}
                  aria-label={`شخصية ${id}`}
                  aria-pressed={profile.characterId === id}
                  onClick={async () => {
                    if (vipPick) {
                      if (!isUnlocked) setVipChoice(id);
                      return;
                    }
                    if (isUnlocked) {
                      choose({ characterId: id });
                    } else {
                      try {
                        const updated = await adManager.watchRewardedAdForCharacter(id);
                        if (updated.unlocked) {
                          choose({ characterId: id });
                        }
                      } catch {
                        // handled inside adManager
                      }
                    }
                  }}
                >
                  <img
                    src={characterFace(id)}
                    alt=""
                    loading="lazy"
                    style={{
                      filter: isUnlocked ? "none" : "grayscale(90%) opacity(0.65)",
                    }}
                  />
                </Button>
                {!isUnlocked && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: 4,
                      right: 4,
                      background: "rgba(0,0,0,0.85)",
                      borderRadius: 10,
                      padding: "2px 5px",
                      fontSize: 10,
                      color: "#ffeb3b",
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                      pointerEvents: "none",
                    }}
                  >
                    <Video size={10} />
                    <span>{adProgress.watchedCount}/5</span>
                  </div>
                )}
                {game !== "187" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="pc-voice"
                    aria-label={`استماع لشخصية ${id}`}
                    title="استماع للصوت"
                    onClick={() => playRandomCharacterClip(id as CharacterId, 0)}
                  >
                    <Volume2 />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {tab === "table" && (
        <div className="pc-grid pc-grid-table">
          {TABLE_THEMES.map((t) => (
            <Button
              key={t.id}
              variant="ghost"
              className={`pc-item ${profile.table === t.id ? "pc-selected" : ""}`}
              aria-pressed={profile.table === t.id}
              onClick={() => choose({ table: t.id })}
            >
              <img src={t.image} alt="" loading="lazy" />
              <span>{t.label}</span>
            </Button>
          ))}
        </div>
      )}
      {tab === "background" && (
        <div className="pc-grid pc-grid-table">
          {BG_THEMES.map((b) => (
            <Button
              key={b.id}
              variant="ghost"
              className={`pc-item ${profile.background === b.id ? "pc-selected" : ""}`}
              aria-pressed={profile.background === b.id}
              onClick={() => choose({ background: b.id })}
            >
              <img src={b.image} alt="" loading="lazy" />
              <span>{b.label}</span>
            </Button>
          ))}
        </div>
      )}
      {tab === "cards" && (
        <div className="pc-grid pc-grid-cards">
          {CARD_THEMES.map((t) => (
            <Button
              key={t.id}
              variant="ghost"
              className={`pc-item ${profile.cards === t.id ? "pc-selected" : ""}`}
              aria-pressed={profile.cards === t.id}
              onClick={() => choose({ cards: t.id })}
            >
              <img src={t.back} alt="" loading="lazy" />
              <span>{t.label}</span>
            </Button>
          ))}
        </div>
      )}
      {tab === "flag" && (
        <div className="pc-grid">
          <Button
            variant="ghost"
            className={`pc-item ${profile.country === null ? "pc-selected" : ""}`}
            aria-pressed={profile.country === null}
            onClick={() => choose({ country: null })}
          >
            <Flag />
            <span>بدون علم</span>
          </Button>
          {MUSLIM_COUNTRIES.map((c) => (
            <Button
              key={c.code}
              variant="ghost"
              className={`pc-item ${profile.country === c.code ? "pc-selected" : ""}`}
              aria-pressed={profile.country === c.code}
              onClick={() => choose({ country: c.code })}
            >
              <img src={flagUrl(c.code) ?? undefined} alt="" loading="lazy" />
              <span>{countryName(c.code)}</span>
            </Button>
          ))}
        </div>
      )}
      {tab === "identity" && (
        <div className="pc-identity">
          <img src={characterFace(profile.characterId)} alt="" />
          <label htmlFor="pc-name">اسم اللاعب</label>
          <input
            id="pc-name"
            value={profile.name}
            maxLength={14}
            onChange={(e) => saveProfile({ name: e.target.value })}
          />

          {/* قسم اختيار معدل الإطارات (FPS) */}
          <div
            style={{
              marginTop: "20px",
              width: "100%",
              padding: "14px",
              background: "rgba(15, 23, 42, 0.7)",
              border: "1px solid #334155",
              borderRadius: "14px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "10px",
                color: "#f8fafc",
              }}
            >
              <Gauge size={18} color="#38bdf8" />
              <span style={{ fontSize: "14px", fontWeight: "bold" }}>معدل الإطارات (FPS):</span>
              <span style={{ fontSize: "12px", color: "#94a3b8" }}>(60 / 90 / 120 إطار)</span>
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              {([60, 90, 120] as FrameRateTarget[]).map((fps) => (
                <button
                  key={fps}
                  type="button"
                  onClick={() => {
                    playTapSound();
                    setTargetFps(fps);
                    saveTargetFps(fps);
                  }}
                  style={{
                    flex: 1,
                    padding: "8px 0",
                    fontSize: "13px",
                    fontWeight: targetFps === fps ? "bold" : "normal",
                    borderRadius: "10px",
                    border: targetFps === fps ? "2px solid #38bdf8" : "1px solid #475569",
                    background: targetFps === fps ? "#0284c7" : "#1e293b",
                    color: "#ffffff",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {fps} FPS
                </button>
              ))}
            </div>
          </div>

          <div className="pc-vip-box">
            <label htmlFor="pc-vip">
              <KeyRound size={16} /> كود فتح الشخصيات
            </label>
            <div className="pc-vip-row">
              <input
                id="pc-vip"
                dir="ltr"
                value={cheatCodeInput}
                onChange={(e) => setCheatCodeInput(e.target.value)}
                placeholder="IKOUT_2026_VIP"
              />
              <Button
                onClick={() => {
                  const anyLocked = CHARACTER_IDS.some(
                    (cid, i) => i >= 3 && !adManager.getCharacterAdProgress(cid).unlocked,
                  );
                  if (!anyLocked) {
                    setCheatFeedback({ text: "جميع الشخصيات مفتوحة بالفعل.", isError: true });
                    return;
                  }
                  const res = checkVipCode(cheatCodeInput, loadVipIndex());
                  setCheatFeedback({ text: res.message, isError: !res.success });
                  if (res.success) {
                    setCheatCodeInput("");
                    setVipPick(true);
                    setVipChoice(null);
                    setTab("character");
                  }
                }}
              >
                تفعيل
              </Button>
            </div>
            {cheatFeedback && (
              <p className={cheatFeedback.isError ? "pc-vip-err" : "pc-vip-ok"}>{cheatFeedback.text}</p>
            )}
          </div>

          <Button className="pc-name-done" onClick={onClose}>
            <Check />
            تم
          </Button>
        </div>
      )}

      {/* نافذة تخصيص الشخصية المخصصة */}
      {showCustomModal && typeof document !== "undefined" && createPortal(
        <div
          dir="rtl"
          className="pc-custom-overlay"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(6px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
        >
          <div
            style={{
              background: "#18181b",
              border: "2px solid #eab308",
              borderRadius: "20px",
              padding: "20px",
              width: "min(75vw, 720px)",
              minWidth: "min(92vw, 320px)",
              maxHeight: "88dvh",
              fontFamily: "inherit",
              overflowWrap: "anywhere",
              overflowY: "auto",
              color: "#fff",
              position: "relative",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: "1px solid #3f3f46",
                paddingBottom: "12px",
                marginBottom: "16px",
              }}
            >
              <h3
                style={{
                  fontSize: "18px",
                  fontWeight: "bold",
                  color: "#eab308",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  margin: 0,
                }}
              >
                <Sparkles size={20} />
                تخصيص شخصيتك
              </h3>
              <button
                type="button"
                onClick={() => setShowCustomModal(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#a1a1aa",
                  cursor: "pointer",
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* شرط الـ 5 إعلانات لكل جلسة تخصيص إذا لم تكتمل */}
            {!customAdProgress.unlocked && (
              <div
                style={{
                  background: "rgba(234, 179, 8, 0.15)",
                  border: "1px solid #eab308",
                  borderRadius: "12px",
                  padding: "12px",
                  marginBottom: "16px",
                  textAlign: "center",
                }}
              >
                <p style={{ margin: "0 0 8px 0", fontSize: "13px", color: "#fef08a" }}>
                  يلزم مشاهدة 5 إعلانات لفتح جلسة التخصيص وحفظ التغييرات: (
                  {customAdProgress.watchedCount}/5)
                </p>
                <Button
                  onClick={async () => {
                    try {
                      const updated = await adManager.watchRewardedAdForCustomAvatar();
                      setCustomAdProgress(updated);
                    } catch (e: any) {
                      alert(e?.message || "تعذر تحميل الإعلان");
                    }
                  }}
                  style={{ background: "#eab308", color: "#000", fontWeight: "bold" }}
                >
                  <Video size={16} style={{ marginLeft: "6px" }} />
                  مشاهدة إعلان مكافأة ({customAdProgress.watchedCount}/5)
                </Button>
              </div>
            )}

            {/* قسم صورة الشخصية */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                marginBottom: "20px",
              }}
            >
              <div
                style={{
                  width: "100px",
                  height: "100px",
                  borderRadius: "50%",
                  border: "3px solid #eab308",
                  overflow: "hidden",
                  background: "#27272a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "10px",
                  position: "relative",
                }}
              >
                {customData.avatarImage ? (
                  <img
                    src={customData.avatarImage}
                    alt="Avatar"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <Camera size={36} color="#71717a" />
                )}
              </div>
              <label
                style={{
                  background: "#27272a",
                  border: "1px solid #52525b",
                  padding: "6px 14px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  color: "#eab308",
                }}
              >
                <Upload size={14} />
                اختيار صورة من الجهاز
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const base64 = ev.target?.result as string;
                      if (base64) {
                        setCustomData((prev) => ({ ...prev, avatarImage: base64 }));
                      }
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            </div>

            {/* اسم الشخصية */}
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  color: "#a1a1aa",
                  marginBottom: "6px",
                }}
              >
                اسم الشخصية
              </label>
              <input
                type="text"
                value={customData.name}
                maxLength={20}
                onChange={(e) => setCustomData((prev) => ({ ...prev, name: e.target.value }))}
                style={{
                  width: "100%",
                  background: "#27272a",
                  border: "1px solid #3f3f46",
                  borderRadius: "8px",
                  padding: "8px 12px",
                  color: "#fff",
                  fontSize: "14px",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* قائمة المقاطع الصوتية (أقصى حد 5 مقاطع، 3 ثوانٍ لكل مقطع) */}
            <div style={{ marginBottom: "20px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "8px",
                }}
              >
                <label style={{ fontSize: "13px", color: "#a1a1aa" }}>
                  الأصوات والعبارات للشات ({customData.clips.length}/5)
                </label>
                <span style={{ fontSize: "11px", color: "#71717a" }}>أقصى مدة 3 ثوانٍ لكل صوت</span>
              </div>

              {customData.clips.map((clip, idx) => (
                <div
                  key={clip.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "#27272a",
                    border: "1px solid #3f3f46",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    marginBottom: "8px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const snd = new Audio(clip.dataUrl);
                        snd.play().catch(() => {});
                      }}
                      style={{ height: "30px", width: "30px", color: "#eab308" }}
                    >
                      <Volume2 size={16} />
                    </Button>
                    <span style={{ fontSize: "13px", fontWeight: "bold" }}>{clip.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setCustomData((prev) => ({
                        ...prev,
                        clips: prev.clips.filter((c) => c.id !== clip.id),
                      }));
                    }}
                    style={{ height: "30px", width: "30px", color: "#ef4444" }}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              ))}

              {/* إضافة صوت جديد إن لم يتجاوز 5 */}
              {customData.clips.length < 5 && (
                <div
                  style={{
                    background: "#202024",
                    border: "1px dashed #52525b",
                    borderRadius: "8px",
                    padding: "10px",
                    marginTop: "10px",
                  }}
                >
                  <input
                    type="text"
                    placeholder="اكتب عبارة الصوت للشات (مثال: كفو يا شريكي)"
                    value={newClipName}
                    maxLength={30}
                    onChange={(e) => setNewClipName(e.target.value)}
                    style={{
                      width: "100%",
                      background: "#27272a",
                      border: "1px solid #3f3f46",
                      borderRadius: "6px",
                      padding: "6px 10px",
                      color: "#fff",
                      fontSize: "12px",
                      marginBottom: "8px",
                      boxSizing: "border-box",
                    }}
                  />
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <label
                      style={{
                        background: "#3f3f46",
                        border: "1px solid #52525b",
                        padding: "6px 10px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        color: "#fff",
                      }}
                    >
                      <Upload size={12} />
                      رفع ملف صوتي (أقصاه 3 ثوانٍ)
                      <input
                        type="file"
                        accept="audio/*"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (!newClipName.trim()) {
                            alert("يرجى كتابة نص العبارة أولاً");
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            const dataUrl = ev.target?.result as string;
                            if (dataUrl) {
                              const newClip: CustomVoiceClip = {
                                id: `clip_${Date.now()}`,
                                name: newClipName.trim(),
                                dataUrl,
                                durationSeconds: 3,
                              };
                              setCustomData((prev) => ({
                                ...prev,
                                clips: [...prev.clips, newClip].slice(0, 5),
                              }));
                              setNewClipName("");
                            }
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* زر الحفظ النهائي */}
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <Button
                variant="ghost"
                onClick={() => setShowCustomModal(false)}
                style={{ color: "#a1a1aa" }}
              >
                إلغاء
              </Button>
              <Button
                onClick={() => {
                  if (!customAdProgress.unlocked) {
                    alert("يرجى إكمال مشاهدة الـ 5 إعلانات لحفظ الشخصية المخصصة");
                    return;
                  }
                  if (!customData.avatarImage) {
                    alert("يرجى اختيار صورة للأفاتار أولاً");
                    return;
                  }
                  // حفظ محلي دائم
                  const saved = saveCustomAvatar({
                    ...customData,
                    enabled: true,
                  });
                  setCustomData(saved);
                  // إعادة تعيين تقدم الإعلانات للتخصيص القادم
                  adManager.resetCustomAvatarAdProgress();
                  setCustomAdProgress(adManager.getCustomAvatarAdProgress());
                  // اختيار الشخصية كشخصية رئيسية
                  choose({ characterId: "custom" });
                  setShowCustomModal(false);
                }}
                style={{ background: "#eab308", color: "#000", fontWeight: "bold" }}
              >
                <Check size={16} style={{ marginLeft: "6px" }} />
                حفظ واستخدام الشخصية
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
};
export default ProfileEditor;
