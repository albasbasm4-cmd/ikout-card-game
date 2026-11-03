import { loadTargetFps, applyFrameRate } from "./utils/frameRate";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";

// بدء محسوم دائماً: الانترو ثم الشاشة الرئيسية. إذا أُعيد فتح التطبيق على مسار
// قديم مثل /uno/play أو /joker (استعادة WebView لآخر صفحة زارها اللاعب) نُطبّع
// المسار إلى الرئيسية قبل تهيئة الراوتر، فلا يدخل اللاعب شاشة لعب مباشرة أبداً.
try {
  if (typeof window !== "undefined" && window.location.pathname !== "/") {
    window.history.replaceState(window.history.state, "", "/");
  }
} catch {
  /* noop */
}

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
  );
});

if (typeof window !== "undefined") {
  applyFrameRate(loadTargetFps());
}
