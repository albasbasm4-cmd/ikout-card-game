/** The original social Joker rules, independent from rendering and bot timing. */
export interface JokerPlayer {
  id: string;
  name: string;
  char: string;
  score: number;
  bot: boolean;
}
export type Outcome = "فائز" | "خاسر" | "غشاش" | "منسحب";
export interface JokerResult {
  id: string;
  name: string;
  card: string;
  pick: string | null;
  outcome: Outcome;
  joker: boolean;
}
export interface JokerGame {
  players: JokerPlayer[];
  round: number;
  phase: "room" | "play" | "results";
  joker: string;
  cards: Record<string, string>;
  out: Record<string, { pick?: string; dropped?: boolean }>;
  log: { name: string; remaining: number }[];
  results: JokerResult[];
}
export function createJokerGame(players: JokerPlayer[]): JokerGame {
  if (players.length < 4 || players.length > 9) throw new Error("الجوكر تحتاج من ٤ إلى ٩ لاعبين");
  return { players, round: 0, phase: "room", joker: "", cards: {}, out: {}, log: [], results: [] };
}
export function dealJoker(prev: JokerGame, random = Math.random): JokerGame {
  const deck = Array.from("♠♥♦♣").flatMap((s) =>
    "A 2 3 4 5 6 7 8 9 10 J Q K".split(" ").map((v) => v + s),
  );
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const joker = prev.players[Math.floor(random() * prev.players.length)].id;
  return {
    ...prev,
    round: prev.round + 1,
    phase: "play",
    joker,
    cards: Object.fromEntries(prev.players.map((p, i) => [p.id, p.id === joker ? "JK" : deck[i]])),
    out: {},
    log: [],
    results: [],
  };
}
export function jokerMode(s: JokerGame, id: string): "pick" | "joker" | "wait" | "final" | "out" {
  if (s.out[id]) return "out";
  if (id === s.joker) return "joker";
  const ordinary = s.players.filter((p) => p.id !== s.joker && !s.out[p.id]);
  return ordinary.length === 1 ? (s.out[s.joker] ? "final" : "wait") : "pick";
}
export function actJoker(prev: JokerGame, id: string, target?: string): JokerGame {
  if (prev.phase !== "play" || !prev.players.some((p) => p.id === id) || prev.out[id]) return prev;
  const mode = jokerMode(prev, id);
  if (mode === "wait" || mode === "out") return prev;
  if (mode !== "joker" && (!target || target === id || !prev.players.some((p) => p.id === target)))
    return prev;
  const s = structuredClone(prev);
  if (mode === "final") {
    const finalCorrect = target === s.joker;
    s.phase = "results";
    s.results = s.players.map((p) => {
      const pick = p.id === id ? (target ?? null) : (s.out[p.id]?.pick ?? null);
      const outcome: Outcome =
        p.id === s.joker
          ? finalCorrect
            ? "خاسر"
            : "فائز"
          : p.id === id
            ? finalCorrect
              ? "فائز"
              : "خاسر"
            : pick === s.joker
              ? "فائز"
              : "غشاش";
      return {
        id: p.id,
        name: p.name,
        card: s.cards[p.id],
        pick,
        outcome,
        joker: p.id === s.joker,
      };
    });
    s.players = s.players.map((p) => ({
      ...p,
      score: p.score + (s.results.find((r) => r.id === p.id)?.outcome === "فائز" ? 1 : 0),
    }));
  } else {
    s.out[id] = mode === "joker" ? { dropped: true } : { pick: target };
    s.log.unshift({
      name: s.players.find((p) => p.id === id)?.name ?? "",
      remaining: s.players.filter((p) => !s.out[p.id]).length,
    });
    s.log = s.log.slice(0, 4);
  }
  return s;
}

/** Bots only see their own card and public dropped status, never the secret Joker ID. */
export function chooseJokerBot(s: JokerGame, id: string, random = Math.random): string | undefined {
  const known = s.players.find((p) => p.id !== id && s.out[p.id]?.dropped);
  const candidates = s.players.filter((p) => p.id !== id);
  return known?.id ?? candidates[Math.floor(random() * candidates.length)]?.id;
}
