/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { AppSettings, useSettings } from "../store/useSettings";
import { playTapSound } from "../utils/audio";
import { Switch } from "./ui/switch";

export interface SettingsPanelProps {
  onClose: () => void;
}

/**
 * The settings panel opened from the home gear (top-right). Same panel style
 * as the profile panel: white border, blue gradient, gold title, segmented
 * option buttons.
 */
export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const { settings, updateSettings } = useSettings();
  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    playTapSound();
    updateSettings({ [key]: value } as Partial<AppSettings>);
  };

  return (
    <div
      className="ik-ov"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      dir="rtl"
    >
      <div className="ik-pn" style={{ height: "auto", minHeight: 420 }}>
        <button type="button" className="ik-x" onClick={onClose} aria-label="إغلاق">
          ✕
        </button>
        <h2>الإعدادات</h2>
        <div className="flex flex-col gap-3 pt-2">
          {/* Sound */}
          <div className="ik-row" style={{ cursor: "default" }}>
            <span className="flex-1">🔊 الصوت</span>
            <div className="ik-seg" style={{ maxWidth: 180 }}>
              <button
                type="button"
                className={settings.soundEnabled ? "on" : ""}
                onClick={() => set("soundEnabled", true)}
              >
                مفعّل
              </button>
              <button
                type="button"
                className={!settings.soundEnabled ? "on" : ""}
                onClick={() => set("soundEnabled", false)}
              >
                صامت
              </button>
            </div>
          </div>
          <div className="ik-row">
            <label htmlFor="card-placement-sound" className="flex-1">
              صوت إنزال البطاقات
            </label>
            <Switch
              id="card-placement-sound"
              checked={settings.cardPlacementSoundEnabled}
              onCheckedChange={(value) => set("cardPlacementSoundEnabled", value)}
            />
          </div>
          {/* Vibration */}
          <div className="ik-row" style={{ cursor: "default" }}>
            <span className="flex-1">📳 الاهتزاز</span>
            <div className="ik-seg" style={{ maxWidth: 180 }}>
              <button
                type="button"
                className={settings.vibrationEnabled ? "on" : ""}
                onClick={() => set("vibrationEnabled", true)}
              >
                مفعّل
              </button>
              <button
                type="button"
                className={!settings.vibrationEnabled ? "on" : ""}
                onClick={() => set("vibrationEnabled", false)}
              >
                مغلق
              </button>
            </div>
          </div>
          {/* Bot speed */}
          <div className="ik-row" style={{ cursor: "default" }}>
            <span className="flex-1">⏱ سرعة البوتات</span>
            <div className="ik-seg" style={{ maxWidth: 260 }}>
              {(["SLOW", "NORMAL", "FAST"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={settings.botSpeed === s ? "on" : ""}
                  onClick={() => set("botSpeed", s)}
                >
                  {s === "SLOW" ? "هادئة" : s === "NORMAL" ? "عادية" : "سريعة"}
                </button>
              ))}
            </div>
          </div>
          <p className="ik-sm text-center mt-2">تُحفظ الإعدادات تلقائياً على هذا الجهاز.</p>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
