import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";

let isKeyboardOpen = false;
let currentKeyboardHeight = 0;
let isInitialized = false;

/**
 * Returns true if the software keyboard is currently active/visible,
 * or if a text input element is focused and receiving user typing.
 */
export function isKeyboardActive(): boolean {
  if (typeof window === "undefined") return false;

  const active = document.activeElement;
  if (
    active &&
    (active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA" ||
      (active as HTMLElement).isContentEditable)
  ) {
    const type = (active as HTMLInputElement).type?.toLowerCase();
    if (
      type !== "checkbox" &&
      type !== "radio" &&
      type !== "range" &&
      type !== "button" &&
      type !== "submit"
    ) {
      return true;
    }
  }

  if (isKeyboardOpen) return true;

  // Fallback: visualViewport height significantly smaller than window.innerHeight in landscape
  if (window.visualViewport && window.innerHeight > 0) {
    const ratio = window.visualViewport.height / window.innerHeight;
    if (ratio < 0.8) {
      return true;
    }
  }

  return false;
}

/**
 * Returns the detected or estimated keyboard height in pixels.
 */
export function getKeyboardHeight(): number {
  if (currentKeyboardHeight > 0) return currentKeyboardHeight;
  if (typeof window !== "undefined" && isKeyboardActive()) {
    if (window.visualViewport && window.innerHeight > window.visualViewport.height) {
      return window.innerHeight - window.visualViewport.height;
    }
    return Math.max(180, Math.round(window.innerHeight * 0.45));
  }
  return 0;
}

/**
 * Reset internal keyboard tracking state (useful for tests and cleanup).
 */
export function resetKeyboardState(): void {
  isKeyboardOpen = false;
  currentKeyboardHeight = 0;
  if (typeof document !== "undefined") {
    document.documentElement.style.setProperty("--keyboard-height", "0px");
    document.body.classList.remove("keyboard-open");
  }
}

/**
 * Ensure the target input element is visible above the keyboard overlay.
 * If the element is obscured in the bottom area covered by the keyboard,
 * smoothly scrolls its container so the user can see what they are typing.
 */
export function ensureInputVisible(target?: HTMLElement | null): void {
  if (typeof window === "undefined") return;
  const el = target ?? (document.activeElement as HTMLElement | null);
  if (!el || !(el instanceof HTMLElement)) return;

  const tagName = el.tagName;
  if (tagName !== "INPUT" && tagName !== "TEXTAREA" && !el.isContentEditable) return;

  const type = (el as HTMLInputElement).type?.toLowerCase();
  if (
    type === "checkbox" ||
    type === "radio" ||
    type === "range" ||
    type === "button" ||
    type === "submit"
  ) {
    return;
  }

  const scrollAction = () => {
    try {
      const rect = el.getBoundingClientRect();
      const kbH = getKeyboardHeight() || Math.round(window.innerHeight * 0.45);
      const visibleBottom = window.innerHeight - kbH;

      // If the input is in or below the keyboard overlay area, scroll it into view
      if (rect.bottom > visibleBottom - 20 || rect.top < 20) {
        el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      }
    } catch {
      /* ignore */
    }
  };

  scrollAction();
  setTimeout(scrollAction, 100);
  setTimeout(scrollAction, 300);
}

function handleKeyboardShow(height: number) {
  isKeyboardOpen = true;
  currentKeyboardHeight =
    height > 0 ? height : Math.max(180, Math.round(window.innerHeight * 0.45));

  if (typeof document !== "undefined") {
    document.documentElement.style.setProperty("--keyboard-height", `${currentKeyboardHeight}px`);
    document.body.classList.add("keyboard-open");
  }

  ensureInputVisible();
}

function handleKeyboardHide() {
  isKeyboardOpen = false;
  currentKeyboardHeight = 0;

  if (typeof document !== "undefined") {
    document.documentElement.style.setProperty("--keyboard-height", "0px");
    document.body.classList.remove("keyboard-open");
  }
}

/**
 * Initialize global listeners for Keyboard Overlay handling.
 * Safe to call multiple times (idempotent).
 */
export function initKeyboardOverlay(): () => void {
  if (typeof window === "undefined" || isInitialized) {
    return () => {};
  }
  isInitialized = true;

  // 1. Capacitor Keyboard Plugin listeners
  let removeCapListeners: (() => void) | null = null;
  try {
    if (Capacitor.isPluginAvailable("Keyboard")) {
      const p1 = Keyboard.addListener("keyboardWillShow", (info) => {
        handleKeyboardShow(info.keyboardHeight);
      });
      const p2 = Keyboard.addListener("keyboardDidShow", (info) => {
        handleKeyboardShow(info.keyboardHeight);
      });
      const p3 = Keyboard.addListener("keyboardWillHide", () => {
        handleKeyboardHide();
      });
      const p4 = Keyboard.addListener("keyboardDidHide", () => {
        handleKeyboardHide();
      });

      removeCapListeners = () => {
        p1.then((h) => h.remove()).catch(() => {});
        p2.then((h) => h.remove()).catch(() => {});
        p3.then((h) => h.remove()).catch(() => {});
        p4.then((h) => h.remove()).catch(() => {});
      };
    }
  } catch {
    /* Capacitor might not be in native context */
  }

  // 2. Window-level events triggered by Capacitor or Web
  const onWinKbShow = (e: Event) => {
    const custom = e as CustomEvent<{ keyboardHeight?: number }>;
    const h = custom.detail?.keyboardHeight ?? 0;
    handleKeyboardShow(h);
  };
  const onWinKbHide = () => {
    handleKeyboardHide();
  };

  window.addEventListener("keyboardWillShow", onWinKbShow as EventListener);
  window.addEventListener("keyboardDidShow", onWinKbShow as EventListener);
  window.addEventListener("keyboardWillHide", onWinKbHide);
  window.addEventListener("keyboardDidHide", onWinKbHide);

  // 3. Focus tracking for inputs
  const onFocusIn = (e: FocusEvent) => {
    const target = e.target as HTMLElement;
    if (
      target &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
    ) {
      const type = (target as HTMLInputElement).type?.toLowerCase();
      if (
        type !== "checkbox" &&
        type !== "radio" &&
        type !== "range" &&
        type !== "button" &&
        type !== "submit"
      ) {
        if (!isKeyboardOpen) {
          const estH = Math.max(180, Math.round(window.innerHeight * 0.45));
          handleKeyboardShow(estH);
        }
        ensureInputVisible(target);
      }
    }
  };

  const onFocusOut = () => {
    setTimeout(() => {
      if (!isKeyboardActive()) {
        handleKeyboardHide();
      }
    }, 150);
  };

  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusOut);

  return () => {
    isInitialized = false;
    resetKeyboardState();
    removeCapListeners?.();
    window.removeEventListener("keyboardWillShow", onWinKbShow as EventListener);
    window.removeEventListener("keyboardDidShow", onWinKbShow as EventListener);
    window.removeEventListener("keyboardWillHide", onWinKbHide);
    window.removeEventListener("keyboardDidHide", onWinKbHide);
    document.removeEventListener("focusin", onFocusIn);
    document.removeEventListener("focusout", onFocusOut);
  };
}
