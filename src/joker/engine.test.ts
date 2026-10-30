import { describe, expect, it } from "vitest";
import {
  actJoker,
  chooseJokerBot,
  createJokerGame,
  dealJoker,
  jokerMode,
  type JokerGame,
} from "./engine";
const players = Array.from({ length: 4 }, (_, i) => ({
  id: `p${i}`,
  name: `P${i}`,
  char: "a1",
  score: 0,
  bot: i > 0,
}));
function game(): JokerGame {
  const s = dealJoker(createJokerGame(players), () => 0.5);
  return { ...s, joker: "p0", cards: { p0: "JK", p1: "A♠", p2: "2♠", p3: "3♠" } };
}
describe("original Joker game loop", () => {
  it("deals one Joker and distinct ordinary cards to 4–9 players", () => {
    const s = dealJoker(createJokerGame(players), () => 0.5);
    expect(Object.values(s.cards).filter((c) => c === "JK")).toHaveLength(1);
    expect(new Set(Object.values(s.cards)).size).toBe(4);
    expect(() => createJokerGame(players.slice(0, 3))).toThrow();
  });
  it("last ordinary player waits until Joker drops", () => {
    let s = actJoker(game(), "p1", "p0");
    s = actJoker(s, "p2", "p1");
    expect(jokerMode(s, "p3")).toBe("wait");
    expect(actJoker(s, "p3", "p0")).toBe(s);
    s = actJoker(s, "p0");
    expect(jokerMode(s, "p3")).toBe("final");
  });
  it("scores early correct, early incorrect, final correct and inverse Joker result", () => {
    let s = actJoker(game(), "p1", "p0");
    s = actJoker(s, "p2", "p1");
    s = actJoker(s, "p0");
    s = actJoker(s, "p3", "p0");
    expect(s.results.map((r) => r.outcome)).toEqual(["خاسر", "فائز", "غشاش", "فائز"]);
    expect(s.players.map((p) => p.score)).toEqual([0, 1, 0, 1]);
    expect(actJoker(s, "p3", "p0")).toBe(s);
    const next = dealJoker(s);
    expect(next.phase).toBe("play");
    expect(next.round).toBe(2);
    expect(next.players.map((p) => p.score)).toEqual([0, 1, 0, 1]);
  });
  it("final incorrect is a loser, not a cheater; Joker wins", () => {
    let s = actJoker(game(), "p1", "p0");
    s = actJoker(s, "p2", "p0");
    s = actJoker(s, "p0");
    s = actJoker(s, "p3", "p1");
    expect(s.results[0].outcome).toBe("فائز");
    expect(s.results[3].outcome).toBe("خاسر");
  });
});

describe("bot target selection", () => {
  it("never accuses an already-out player, except the known dropped Joker", () => {
    for (let seed = 0; seed < 200; seed++) {
      let rnd = seed;
      const random = () => {
        rnd = (rnd * 1103515245 + 12345) % 2147483648;
        return rnd / 2147483648;
      };
      let s = dealJoker(createJokerGame(players), random);
      for (let step = 0; step < 30 && s.phase === "play"; step++) {
        // كل الأدوار تلعب (البشر يمثلون باختيار عشوائي) حتى تكتمل الجولة
        const actor = s.players.find((p) =>
          ["joker", "pick", "final"].includes(jokerMode(s, p.id)),
        );
        if (!actor) break;
        const mode = jokerMode(s, actor.id);
        const target = chooseJokerBot(s, actor.id, random);
        const before = s;
        s = actJoker(s, actor.id, mode === "joker" ? undefined : target);
        if (mode === "pick") {
          expect(s).not.toBe(before);
          expect(s.out[actor.id]?.pick).toBeTruthy();
          for (const [pid, o] of Object.entries(s.out)) {
            if (o.pick) expect(o.pick).not.toBe(pid);
          }
        } else {
          expect(s).not.toBe(before);
        }
        const outIds = new Set(Object.keys(s.out));
        if (target !== undefined && target !== s.joker) expect(outIds.has(target)).toBe(false);
      }
      expect(s.phase).toBe("results");
    }
  });
});
