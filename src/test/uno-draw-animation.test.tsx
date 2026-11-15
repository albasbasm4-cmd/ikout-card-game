/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (cfg: unknown) => cfg,
  ClientOnly: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Link: (props: Record<string, unknown>) => <a {...props} />,
  useNavigate: () => vi.fn(),
}));
vi.mock("@/utils/audio", () => ({
  playTapSound: vi.fn(),
  playCardSound: vi.fn(),
}));
vi.mock("@/components/NetworkLatencyBadge", () => ({
  NetworkLatencyBadge: () => null,
}));

import {
  Play,
  getUnoDrawTiming,
  getDrawPilePosition,
  getHandSlotPosition,
  getOpponentSeatPosition,
  detectDraw,
  DEFAULT_UNO_DRAW_CONFIG,
} from "@/routes/uno.play";
import {
  newGame,
  DEFAULT_RULES,
  type GameState,
  type Difficulty,
  drawCard,
} from "@/lib/uno/engine";

const KEY = "uno.savedGame.v1";

const readSaved = (): GameState | null => {
  const raw = localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as GameState) : null;
};

function createTestGame(pendingDraw = 0): GameState {
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const setup = [
    { name: "أنت", isBot: false, difficulty: "medium" as Difficulty },
    { name: "بوت ١", isBot: true, difficulty: "easy" as Difficulty },
    { name: "بوت ٢", isBot: true, difficulty: "easy" as Difficulty },
    { name: "بوت ٣", isBot: true, difficulty: "easy" as Difficulty },
  ];
  const s = newGame(setup, "bots", DEFAULT_RULES, rnd);
  s.current = 0;
  s.pendingDraw = pendingDraw;
  return s;
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});

describe("دوال ومساعدات أنيميشن سحب الأوراق في أونو", () => {
  describe("getUnoDrawTiming", () => {
    it("يعيد التوقيت القياسي عند سرعة NORMAL وبدون reducedMotion", () => {
      const timing = getUnoDrawTiming("NORMAL", false);
      expect(timing.durationMs).toBe(DEFAULT_UNO_DRAW_CONFIG.cardDurationMs);
      expect(timing.staggerMs).toBe(DEFAULT_UNO_DRAW_CONFIG.cardStaggerMs);
    });

    it("يزيد مدة الطيران عند اختيار السرعة البطيئة SLOW", () => {
      const timing = getUnoDrawTiming("SLOW", false);
      expect(timing.durationMs).toBeGreaterThan(DEFAULT_UNO_DRAW_CONFIG.cardDurationMs);
      expect(timing.staggerMs).toBeGreaterThan(DEFAULT_UNO_DRAW_CONFIG.cardStaggerMs);
    });

    it("يقلص مدة الطيران عند اختيار السرعة السريعة FAST", () => {
      const timing = getUnoDrawTiming("FAST", false);
      expect(timing.durationMs).toBeLessThan(DEFAULT_UNO_DRAW_CONFIG.cardDurationMs);
      expect(timing.staggerMs).toBeLessThan(DEFAULT_UNO_DRAW_CONFIG.cardStaggerMs);
    });

    it("يعيد توقيتًا سريعًا ومختصرًا عند تفعيل تقليل الحركة reducedMotion", () => {
      const timing = getUnoDrawTiming("SLOW", true);
      expect(timing.durationMs).toBe(70);
      expect(timing.staggerMs).toBe(35);
    });

    it("يدعم تمرير إعدادات مخصصة", () => {
      const custom = { cardDurationMs: 500, cardStaggerMs: 200 };
      const timing = getUnoDrawTiming("NORMAL", false, custom);
      expect(timing.durationMs).toBe(500);
      expect(timing.staggerMs).toBe(200);
    });
  });

  describe("getDrawPilePosition", () => {
    it("يعيد موقعًا احتياطيًا مناسبًا عند غياب العناصر في بيئة الاختبار", () => {
      const pos = getDrawPilePosition(null, null, 1000, 660, 660 / 450, 80);
      expect(pos.fromX).toBeCloseTo(43, 0);
      expect(pos.fromY).toBe(50);
    });
  });

  describe("getHandSlotPosition", () => {
    it("يحسب إحداثيات slot الورقة بدقة وتمركز داخل يد اللاعب", () => {
      const pos0 = getHandSlotPosition(0, 1, 1000, 80);
      expect(pos0.toX).toBeCloseTo(50, 0);
      expect(pos0.toY).toBe(88);

      const posLeft = getHandSlotPosition(0, 5, 1000, 80);
      const posRight = getHandSlotPosition(4, 5, 1000, 80);
      expect(posLeft.toX).toBeLessThan(50);
      expect(posRight.toX).toBeGreaterThan(50);
      // التماثل حول المنتصف
      expect(posLeft.toX + posRight.toX).toBeCloseTo(100, 0);
    });
  });

  describe("getOpponentSeatPosition", () => {
    it("يحسب مواقع الخصوم بنسق قوسي حول طاولة أونو", () => {
      const opp1 = getOpponentSeatPosition(1, 4, 0);
      const opp2 = getOpponentSeatPosition(2, 4, 0);
      const opp3 = getOpponentSeatPosition(3, 4, 0);

      expect(opp1.toX).toBeGreaterThan(opp2.toX);
      expect(opp2.toX).toBeCloseTo(50, 0);
      expect(opp3.toX).toBeLessThan(opp2.toX);

      expect(opp1.toY).toBeLessThan(60);
      expect(opp2.toY).toBeLessThan(60);
      expect(opp3.toY).toBeLessThan(60);
    });
  });

  describe("detectDraw", () => {
    it("يتجاهل تغير الحالة إذا تغير رقم الجولة", () => {
      const prev = createTestGame();
      const next = { ...prev, round: prev.round + 1 };
      expect(detectDraw(prev, next)).toBeNull();
    });

    it("يتجاهل تغير الحالة إذا لم يزدد عدد أوراق أي يد", () => {
      const prev = createTestGame();
      expect(detectDraw(prev, prev)).toBeNull();
    });

    it("يكتشف سحب ورقة واحدة للاعب البشري مع معرفاتها", () => {
      const prev = createTestGame();
      const res = drawCard(prev, 0, prev.version);
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const detected = detectDraw(prev, res.state);
      expect(detected).not.toBeNull();
      expect(detected?.seat).toBe(0);
      expect(detected?.count).toBe(1);
      expect(detected?.cardIds?.length).toBe(1);
    });

    it("يكتشف سحب ورقتين (+2) لعقوبة السحب التراكمي", () => {
      const prev = createTestGame(2);
      const res = drawCard(prev, 0, prev.version);
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const detected = detectDraw(prev, res.state);
      expect(detected).not.toBeNull();
      expect(detected?.seat).toBe(0);
      expect(detected?.count).toBe(2);
      expect(detected?.cardIds?.length).toBe(2);
    });

    it("يكتشف سحب أربع أوراق (+4) لعقوبة السحب الرباعي", () => {
      const prev = createTestGame(4);
      const res = drawCard(prev, 0, prev.version);
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const detected = detectDraw(prev, res.state);
      expect(detected).not.toBeNull();
      expect(detected?.seat).toBe(0);
      expect(detected?.count).toBe(4);
      expect(detected?.cardIds?.length).toBe(4);
    });

    it("يكتشف سحب البوت في مقعد آخر", () => {
      const prev = createTestGame();
      prev.current = 1;
      const res = drawCard(prev, 1, prev.version);
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const detected = detectDraw(prev, res.state);
      expect(detected).not.toBeNull();
      expect(detected?.seat).toBe(1);
      expect(detected?.count).toBe(1);
    });
  });
});

describe("تكامل أنيميشن سحب الأوراق في شاشة اللعب Play", () => {
  it("عند ضغط اللاعب على كومة السحب: يبدأ أنيميشن السحب ويستخدم ظهر الورقة", async () => {
    const s = createTestGame();
    localStorage.setItem(KEY, JSON.stringify(s));

    render(<Play />);

    const drawBtn = screen.getByRole("button", { name: "اسحب" });
    expect(drawBtn).toBeTruthy();
    expect(drawBtn.getAttribute("disabled")).toBeNull();

    // الضغط على كومة السحب
    fireEvent.click(drawBtn);

    // التحقق من أن زر السحب يُعطّل فوراً أثناء حركة السحب لمنع النقرات المزدوجة
    expect(drawBtn.getAttribute("disabled")).not.toBeNull();

    // التحقق من ظهور بطاقة السحب المتحركة بوجهها الخلفي (faceDown)
    const cardBacks = document.querySelectorAll('img[src="/assets/uno/uno-back.png"]');
    // يوجد ظهر بطاقة كومة السحب الأساسية + بطاقة السحب الطائرة
    expect(cardBacks.length).toBeGreaterThanOrEqual(2);

    // تقديم الوقت لإنهاء حركة السحب
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // استقرار الحالة وزيادة يد اللاعب وحفظ الحالة
    const saved = readSaved();
    expect(saved?.players[0].hand.length).toBe(s.players[0].hand.length + 1);
  });

  it("عند وجود عقوبة +2: تتحرك الورقتان بالتتابع وتصلان إلى يد اللاعب", async () => {
    const s = createTestGame(2);
    localStorage.setItem(KEY, JSON.stringify(s));

    render(<Play />);

    const drawBtn = screen.getByRole("button", { name: "اسحب" });
    fireEvent.click(drawBtn);

    // في البداية تبدأ الورقة الأولى
    expect(drawBtn.getAttribute("disabled")).not.toBeNull();

    // تقديم الوقت لمرحلة خروج الورقة الثانية
    act(() => {
      vi.advanceTimersByTime(150);
    });

    // تقديم الوقت حتى استقرار جميع البطاقات (+2)
    act(() => {
      vi.advanceTimersByTime(600);
    });

    const saved = readSaved();
    expect(saved?.players[0].hand.length).toBe(s.players[0].hand.length + 2);
    expect(saved?.pendingDraw).toBe(0);
  });

  it("عند وجود عقوبة +4: تتحرك أربع أوراق بالتتابع المستقل", async () => {
    const s = createTestGame(4);
    localStorage.setItem(KEY, JSON.stringify(s));

    render(<Play />);

    const drawBtn = screen.getByRole("button", { name: "اسحب" });
    fireEvent.click(drawBtn);

    expect(drawBtn.getAttribute("disabled")).not.toBeNull();

    // تقديم الوقت حتى انتهاء جميع البطاقات الأربع المتتابعة
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    const saved = readSaved();
    expect(saved?.players[0].hand.length).toBe(s.players[0].hand.length + 4);
    expect(saved?.pendingDraw).toBe(0);
  });
});
