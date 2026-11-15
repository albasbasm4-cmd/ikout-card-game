import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Screen Orientation & System Bars Fix Verification", () => {
  it("verifies MainActivity.java enforces sensorLandscape and cutout mode", () => {
    const mainActivityPath = path.resolve(process.cwd(), "android/app/src/main/java/com/ikout/cardgame/MainActivity.java");
    expect(fs.existsSync(mainActivityPath)).toBe(true);
    const content = fs.readFileSync(mainActivityPath, "utf-8");

    // 1. Must enforce native sensorLandscape
    expect(content).toContain("setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE)");

    // 2. Must handle display cutout for short edges in landscape
    expect(content).toContain("LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES");

    // 3. Must preserve WebSocket plugin registration BEFORE super.onCreate
    const regIdx = content.indexOf("registerPlugin(WebSocketServerPlugin.class)");
    const superIdx = content.indexOf("super.onCreate(savedInstanceState)");
    expect(regIdx).toBeGreaterThan(-1);
    expect(superIdx).toBeGreaterThan(regIdx);

    // 4. Must preserve mixed content mode for ws://
    expect(content).toContain("MIXED_CONTENT_ALWAYS_ALLOW");

    // 5. Must re-affirm orientation in onResume
    expect(content).toContain("protected void onResume()");
  });

  it("verifies scripts/patch-capacitor-android.mjs keeps orientation and plugin order", () => {
    const scriptPath = path.resolve(process.cwd(), "scripts/patch-capacitor-android.mjs");
    expect(fs.existsSync(scriptPath)).toBe(true);
    const content = fs.readFileSync(scriptPath, "utf-8");

    expect(content).toContain("setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE)");
    expect(content).toContain("LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES");
    expect(content).toContain("registerPlugin(WebSocketServerPlugin.class)");
    expect(content).toContain("MIXED_CONTENT_ALWAYS_ALLOW");
  });

  it("verifies AndroidManifest.xml maintains sensorLandscape and adjustResize", () => {
    const manifestPath = path.resolve(process.cwd(), "android/app/src/main/AndroidManifest.xml");
    const content = fs.readFileSync(manifestPath, "utf-8");

    expect(content).toContain('android:screenOrientation="sensorLandscape"');
    expect(content).toContain('android:windowSoftInputMode="adjustResize"');
  });

  it("verifies use-stage-fit.ts does not apply CSS rotate(90deg) on native platform", () => {
    const hookPath = path.resolve(process.cwd(), "src/hooks/use-stage-fit.ts");
    const content = fs.readFileSync(hookPath, "utf-8");

    // Must import Capacitor
    expect(content).toContain('import { Capacitor } from "@capacitor/core"');
    // Must condition shouldRotate on !isNative
    expect(content).toMatch(/!isNative\s*&&\s*orientation\s*===\s*["']landscape["']/);
  });
});
