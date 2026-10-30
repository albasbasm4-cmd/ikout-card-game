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

import { Play } from "./uno.play";
import {
  newGame,
  DEFAULT_RULES,
  describe as describeCard,
  type GameState,
  type Card,
  type Difficulty,
} from "@/lib/uno/engine";

const KEY = "uno.savedGame.v1";

const readSaved = (): GameState | null => {
  const raw = localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as GameState) : null;
};

function seededState(): GameState {
  let seed = 7;
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
  // البشري (المقعد 0) ببطاقتين فقط، إحداهما قابلة للعب: نضبط اللون النشط على لون إحداهما
  const hand = s.players[0].hand;
  const mine = hand.find((c) => c.color !== "wild");
  if (!mine) throw new Error("no colored card in hand");
  s.activeColor = mine.color as GameState["activeColor"];
  const other = hand.find((c) => c.id !== mine.id);
  if (!other) throw new Error("hand too small");
  s.players[0].hand = [mine, other];
  // بوت المقعد 1 نسي قول أونو: بطاقة واحدة بلا نداء
  s.players[1].hand = [s.players[1].hand[0]];
  s.players[1].saidUno = false;
  s.unoVulnerable = 1;
  return s;
}

const clickCard = (label: string) => {
  const card = screen.getByRole("button", { name: label });
  fireEvent.click(card); // الاختيار الأول
  fireEvent.click(card); // الاختيار الثاني = إنزال الورقة
};

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  localStorage.setItem(KEY, JSON.stringify(seededState()));
});

describe("طاولة أونو: نوافذ كشف/أونو أثناء طيران البطاقة", () => {
  it("الكشف يعمل عاديًا قبل أي حركة: يُضاف عقوبتا بطاقتين للناسي", async () => {
    render(<Play />);
    screen.getByText("كشف");
    fireEvent.click(screen.getByText("كشف"));
    const saved = readSaved();
    expect(saved?.players[1].hand.length).toBe(3);
    expect(saved?.unoVulnerable).toBeNull();
  });

  it("أثناء طيران البطاقة يكون زر الكشف معطلاً فلا تضيع الضغطة على حالة قديمة", async () => {
    render(<Play />);
    screen.getByText("كشف");
    const mine = JSON.parse(localStorage.getItem(KEY) as string) as GameState;
    const playable = mine.players[0].hand.find(
      (c) => (c.color as string) === mine.activeColor,
    ) as Card;
    expect(playable).toBeTruthy();

    clickCard(describeCard(playable)); // يبدأ طيران الورقة (busy = 540ms)
    const reveal = screen.getByText("كشف").closest("button") as HTMLButtonElement;
    expect(reveal.disabled).toBe(true);
    fireEvent.click(reveal); // لا تأثير

    act(() => {
      vi.advanceTimersByTime(700);
    });
    const after = readSaved() as GameState;
    // الورقة نزلت فعلًا: يد البشري نقصت، ولا ضرر بحالة اللاعب الناسي
    expect(after.players[0].hand.length).toBe(1);
    expect(after.players[1].hand.length).toBe(1);
    // البشري وصل إلى بطاقة واحدة بلا نداء أونو: نافذة الضعف انتقلت إليه (قاعدة اللعبة)
    expect(after.unoVulnerable).toBe(0);
  });

  it("نداء أونو يعمل قبل اللعب، ويعمل أيضًا بعد إنزال الورقة (عبر نافذة الضعف)", async () => {
    render(<Play />);
    screen.getByText("أونو");
    fireEvent.click(screen.getByText("أونو"));
    expect(readSaved()?.players[0].saidUno).toBe(true);
    // فتح حارس busy (مؤقّت 250ms) قبل المتابعة
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // نداء أثناء الطيران معطّل ولا يفسد الحالة
    const mine = JSON.parse(localStorage.getItem(KEY) as string) as GameState;
    const playable = mine.players[0].hand.find(
      (c) => (c.color as string) === mine.activeColor,
    ) as Card;
    clickCard(describeCard(playable));
    const unoBtn = screen.getByText("أونو").closest("button") as HTMLButtonElement;
    expect(unoBtn.disabled).toBe(true);
    fireEvent.click(unoBtn); // لا تأثير
    act(() => {
      vi.advanceTimersByTime(700);
    });
    const mid = readSaved() as GameState;
    expect(mid.players[0].hand.length).toBe(1);
    // نداء أونو المسجّل قبل الإنزال يبقى محفوظًا: لا ضعف ولا ضياع بعد استقرار الحالة
    expect(mid.players[0].saidUno).toBe(true);
    expect(mid.unoVulnerable).toBeNull();
    const unoBtn2 = screen.getByText("أونو").closest("button") as HTMLButtonElement;
    expect(unoBtn2.disabled).toBe(false);
  });
});
