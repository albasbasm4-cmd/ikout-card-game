/**
 * سجل معالج الرجوع النظامي (زر الجهاز / المتصفح).
 *
 * كل شاشة عليا تسجّل نقطة رجوعها (خطوة واحدة للخلف، أو الرئيسية مباشرة من
 * طاولة اللعب) ويعترض IkoutApp حدث popstate ليوجّه زر الرجوع النظامي إلى
 * نفس المنطق بدلاً من القفز إلى مسارات راوتر قديمة في سجل التنقل.
 */
export type AppBackHandler = () => void;

let handler: AppBackHandler | null = null;

export function setAppBackHandler(h: AppBackHandler | null): void {
  handler = h;
}

export function getAppBackHandler(): AppBackHandler | null {
  return handler;
}

import { useEffect, useRef } from "react";

/**
 * يسجّل معالج الرجوع للشاشة الحالية ويُلغيه عند الUnmount.
 * المعالج يُقرأ وقت الضغط عبر ref ليتابع تغيّر الشاشة الداخلية.
 */
export function useAppBack(handler: AppBackHandler): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    setAppBackHandler(() => ref.current());
    return () => setAppBackHandler(null);
  }, []);
}
