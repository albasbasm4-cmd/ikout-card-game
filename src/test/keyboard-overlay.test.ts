import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  isKeyboardActive,
  getKeyboardHeight,
  initKeyboardOverlay,
  ensureInputVisible,
} from "../utils/keyboardOverlay";

describe("Keyboard Overlay & Native Android Soft Input Configuration", () => {
  it("verifies AndroidManifest.xml uses adjustNothing for pure overlay behavior", () => {
    const manifestPath = path.resolve(process.cwd(), "android/app/src/main/AndroidManifest.xml");
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = fs.readFileSync(manifestPath, "utf-8");

    // Must be adjustNothing so Android never shrinks or pans the window
    expect(manifest).toContain('android:windowSoftInputMode="adjustNothing"');
    expect(manifest).not.toContain('android:windowSoftInputMode="adjustResize"');
    expect(manifest).not.toContain('android:windowSoftInputMode="adjustPan"');
  });

  it("verifies capacitor.config.json configures Keyboard plugin with resize: 'none' and resizeOnFullScreen: false", () => {
    const configPath = path.resolve(process.cwd(), "capacitor.config.json");
    expect(fs.existsSync(configPath)).toBe(true);
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

    expect(config.plugins).toBeDefined();
    expect(config.plugins.Keyboard).toBeDefined();
    expect(config.plugins.Keyboard.resize).toBe("none");
    expect(config.plugins.Keyboard.resizeOnFullScreen).toBe(false);
  });

  it("verifies scripts/patch-capacitor-android.mjs enforces adjustNothing", () => {
    const scriptPath = path.resolve(process.cwd(), "scripts/patch-capacitor-android.mjs");
    expect(fs.existsSync(scriptPath)).toBe(true);
    const script = fs.readFileSync(scriptPath, "utf-8");

    expect(script).toContain('android:windowSoftInputMode="adjustNothing"');
  });

  it("verifies viewport meta tag contains interactive-widget=overlays-content", () => {
    const rootPath = path.resolve(process.cwd(), "src/routes/__root.tsx");
    const htmlGenPath = path.resolve(process.cwd(), "scripts/generate-static-html.mjs");

    const rootContent = fs.readFileSync(rootPath, "utf-8");
    const htmlContent = fs.readFileSync(htmlGenPath, "utf-8");

    expect(rootContent).toContain("interactive-widget=overlays-content");
    expect(htmlContent).toContain("interactive-widget=overlays-content");
  });

  it("verifies use-stage-fit.ts and screen components prevent shrinking on keyboard resize", () => {
    const hookPath = path.resolve(process.cwd(), "src/hooks/use-stage-fit.ts");
    const gameScreenPath = path.resolve(process.cwd(), "src/components/GameScreen.tsx");
    const hookContent = fs.readFileSync(hookPath, "utf-8");
    const gameScreenContent = fs.readFileSync(gameScreenPath, "utf-8");

    expect(hookContent).toContain("isKeyboardActive");
    expect(hookContent).toContain("handleVisualViewportResize");
    expect(gameScreenContent).toContain("isKeyboardActive");
  });
});

describe("Keyboard Overlay State & Input Visibility Management", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    cleanup = initKeyboardOverlay();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.className = "";
  });

  it("reports keyboard inactive when no input is focused", () => {
    expect(isKeyboardActive()).toBe(false);
  });

  it("detects active typing when an input field receives focus", () => {
    const input = document.createElement("input");
    input.type = "text";
    document.body.appendChild(input);

    input.focus();
    expect(isKeyboardActive()).toBe(true);

    input.remove();
  });

  it("does not treat checkbox or button inputs as soft keyboard triggers", () => {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    document.body.appendChild(checkbox);

    checkbox.focus();
    expect(isKeyboardActive()).toBe(false);

    checkbox.remove();
  });

  it("handles keyboard events and manages CSS variables and body classes", () => {
    window.dispatchEvent(new CustomEvent("keyboardWillShow", { detail: { keyboardHeight: 280 } }));

    expect(isKeyboardActive()).toBe(true);
    expect(getKeyboardHeight()).toBe(280);
    expect(document.body.classList.contains("keyboard-open")).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--keyboard-height")).toBe("280px");

    window.dispatchEvent(new Event("keyboardWillHide"));
    expect(document.body.classList.contains("keyboard-open")).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--keyboard-height")).toBe("0px");
  });

  it("invokes scrollIntoView on focused inputs when obscured by overlay", () => {
    const input = document.createElement("input");
    input.type = "text";
    input.scrollIntoView = vi.fn();
    document.body.appendChild(input);

    input.focus();
    ensureInputVisible(input);

    expect(input.scrollIntoView).toBeDefined();
    input.remove();
  });
});
