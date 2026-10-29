import { describe, expect, it } from "vitest";
import { buildDeck, cardPoints, drawCard, newGame, playCard, catchUno, passTurn, type Card, type GameState } from "./engine";

const c = (id: string, color: Card["color"], kind: Card["kind"], value?: number): Card => (value === undefined ? { id, color, kind } : { id, color, kind, value });

function setup(hands: Card[][], topCard: Card = c("t", "red", "number", 5)): GameState {
  const s = newGame(hands.map((_, i) => ({ name: `P${i}`, isBot: false, difficulty: "easy" })), "bots");
  s.players.forEach((p, i) => (p.hand = hands[i]));
  s.discard = [topCard];
  s.activeColor = "red";
  s.current = 0;
  s.direction = 1;
  s.drawPile = buildDeck().filter((x) => x.kind === "number" && x.color === "green").map((x, i) => ({ ...x, id: "d" + i }));
  return s;
}
const ok = (r: ReturnType<typeof playCard>) => { if (!r.ok) throw new Error(r.error); return r.state; };

describe("deck", () => {
  it("has 108 cards with 4 wild and 4 wild+4", () => {
    const d = buildDeck();
    expect(d.length).toBe(108);
    expect(d.filter((x) => x.kind === "wild").length).toBe(4);
    expect(d.filter((x) => x.kind === "wild4").length).toBe(4);
  });
  it("scores cards", () => {
    expect(cardPoints(c("a", "red", "number", 7))).toBe(7);
    expect(cardPoints(c("a", "red", "skip"))).toBe(20);
    expect(cardPoints(c("a", "wild", "wild4"))).toBe(50);
  });
});

describe("stacking", () => {
  it("+2 then +2 then a player without draw cards draws 4 and loses turn", () => {
    let s = setup([[c("a", "red", "draw2"), c("x", "red", "number", 1)], [c("b", "blue", "draw2"), c("y", "red", "number", 1)], [c("z", "red", "number", 3), c("w", "red", "number", 4)]]);
    s = ok(playCard(s, 0, "a"));
    s = ok(playCard(s, 1, "b"));
    expect(s.pendingDraw).toBe(4);
    expect(playCard(s, 2, "z").ok).toBe(false);
    s = ok(drawCard(s, 2));
    expect(s.players[2].hand.length).toBe(6);
    expect(s.pendingDraw).toBe(0);
    expect(s.current).toBe(0);
  });
  it("+4 then +2 then +4 accumulates to 10", () => {
    let s = setup([[c("a", "wild", "wild4"), c("x", "red", "number", 1)], [c("b", "blue", "draw2"), c("y", "red", "number", 1)], [c("d", "wild", "wild4"), c("w", "red", "number", 4)]]);
    s = ok(playCard(s, 0, "a", "green"));
    s = ok(playCard(s, 1, "b"));
    s = ok(playCard(s, 2, "d", "yellow"));
    expect(s.pendingDraw).toBe(10);
    expect(s.current).toBe(0);
  });
  it("+2 then +4 then +2 = 8", () => {
    let s = setup([[c("a", "red", "draw2"), c("x", "red", "number", 1)], [c("b", "wild", "wild4"), c("y", "red", "number", 1)], [c("d", "yellow", "draw2"), c("w", "red", "number", 4)]]);
    s = ok(playCard(s, 0, "a"));
    s = ok(playCard(s, 1, "b", "blue"));
    s = ok(playCard(s, 2, "d"));
    expect(s.pendingDraw).toBe(8);
  });
  it("rejects playing out of turn", () => {
    const s = setup([[c("a", "red", "number", 1)], [c("b", "red", "draw2")]]);
    expect(playCard(s, 1, "b").ok).toBe(false);
  });
  it("round ending on +2 still makes next player draw", () => {
    let s = setup([[c("a", "red", "draw2")], [c("y", "red", "number", 1)]]);
    s.players[0].saidUno = true;
    s = ok(playCard(s, 0, "a"));
    expect(s.status).toBe("roundOver");
    expect(s.players[1].hand.length).toBe(3);
    expect(s.players[0].score).toBe(s.players[1].hand.reduce((a, x) => a + cardPoints(x), 0));
  });
  it("+4 is playable even when holding the active color", () => {
    let s = setup([[c("a", "wild", "wild4"), c("r", "red", "number", 2)], [c("y", "red", "number", 1)]]);
    s = ok(playCard(s, 0, "a", "blue"));
    expect(s.pendingDraw).toBe(4);
  });
});

describe("special cards", () => {
  it("reverse with 2 players returns turn to player", () => {
    let s = setup([[c("a", "red", "reverse"), c("x", "red", "number", 1)], [c("y", "red", "number", 1)]]);
    s = ok(playCard(s, 0, "a"));
    expect(s.current).toBe(0);
  });
  it("reverse with 3 players flips direction", () => {
    let s = setup([[c("a", "red", "reverse"), c("x", "red", "number", 1)], [c("y", "red", "number", 1)], [c("z", "red", "number", 1)]]);
    s = ok(playCard(s, 0, "a"));
    expect(s.current).toBe(2);
  });
  it("skip jumps next player", () => {
    let s = setup([[c("a", "red", "skip"), c("x", "red", "number", 1)], [c("y", "red", "number", 1)], [c("z", "red", "number", 1)]]);
    s = ok(playCard(s, 0, "a"));
    expect(s.current).toBe(2);
  });
  it("duplicate action with stale version is rejected", () => {
    const s = setup([[c("a", "red", "number", 1), c("b", "red", "number", 2)], [c("y", "red", "number", 1)]]);
    const v = s.version;
    const s2 = ok(playCard(s, 0, "a", undefined, v));
    expect(playCard(s2, 0, "b", undefined, v).ok).toBe(false);
  });
});

describe("UNO call", () => {
  it("missed UNO is penalised with 2 cards once", () => {
    let s = setup([[c("a", "red", "number", 1), c("b", "red", "number", 2)], [c("y", "blue", "number", 1)]]);
    s = ok(playCard(s, 0, "a"));
    expect(s.unoVulnerable).toBe(0);
    s = ok(catchUno(s, 1));
    expect(s.players[0].hand.length).toBe(3);
    expect(catchUno(s, 1).ok).toBe(false);
  });
  it("drawing a playable card allows playing or passing", () => {
    let s = setup([[c("x", "blue", "number", 9)], [c("y", "blue", "number", 1)]]);
    s.drawPile = [c("g", "red", "number", 3)];
    s = ok(drawCard(s, 0));
    expect(s.drawnCardId).toBe("g");
    s = ok(passTurn(s, 0));
    expect(s.current).toBe(1);
  });
});
