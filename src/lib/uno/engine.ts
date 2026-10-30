// UNO rules engine — pure functions, no UI. Shared by bot games and rooms.
export type Color = "red" | "blue" | "green" | "yellow";
export type Kind = "number" | "skip" | "reverse" | "draw2" | "wild" | "wild4";
export type Difficulty = "easy" | "medium" | "hard";

export interface Card {
  id: string;
  color: Color | "wild";
  kind: Kind;
  value?: number;
}

export interface Player {
  id: string;
  name: string;
  isBot: boolean;
  difficulty: Difficulty;
  hand: Card[];
  saidUno: boolean;
  connected: boolean;
  score: number;
}

export interface Rules {
  stacking: boolean; // +2/+4 stack on each other
  wild4Anytime: boolean; // local rule: +4 playable at any time
  targetScore: number;
  handSize: number;
}

export const DEFAULT_RULES: Rules = {
  stacking: true,
  wild4Anytime: true,
  targetScore: 500,
  handSize: 7,
};

export interface GameState {
  id: string;
  mode: "bots" | "room";
  rules: Rules;
  players: Player[];
  drawPile: Card[];
  discard: Card[];
  activeColor: Color;
  direction: 1 | -1;
  current: number;
  pendingDraw: number;
  drawnCardId: string | null; // card drawn this turn that may still be played
  unoVulnerable: number | null; // player who reached 1 card without calling UNO
  status: "playing" | "roundOver" | "matchOver";
  roundWinner: number | null;
  round: number;
  version: number; // increments on every accepted action (dedupes double actions)
  log: string[];
}

export const COLORS: Color[] = ["red", "blue", "green", "yellow"];

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  let n = 0;
  const id = () => `c${n++}`;
  for (const color of COLORS) {
    deck.push({ id: id(), color, kind: "number", value: 0 });
    for (let v = 1; v <= 9; v++)
      for (let k = 0; k < 2; k++) deck.push({ id: id(), color, kind: "number", value: v });
    for (const kind of ["skip", "reverse", "draw2"] as Kind[])
      for (let k = 0; k < 2; k++) deck.push({ id: id(), color, kind });
  }
  for (let k = 0; k < 4; k++) {
    deck.push({ id: id(), color: "wild", kind: "wild" });
    deck.push({ id: id(), color: "wild", kind: "wild4" });
  }
  return deck;
}

export function shuffle<T>(arr: T[], rnd = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function cardPoints(c: Card): number {
  if (c.kind === "number") return c.value ?? 0;
  if (c.kind === "wild" || c.kind === "wild4") return 50;
  return 20;
}

export function cardImageKey(c: Card): string {
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  if (c.kind === "wild") return "Wild_Card_Change_Colour";
  if (c.kind === "wild4") return "Wild_Card_Draw_4";
  const col = cap(c.color);
  if (c.kind === "number") return `${col}_${c.value}`;
  if (c.kind === "draw2") return `${col}_Draw_2`;
  return `${col}_${cap(c.kind)}`;
}

export function top(s: GameState): Card {
  return s.discard[s.discard.length - 1];
}

export interface PlayerSetup {
  name: string;
  isBot: boolean;
  difficulty: Difficulty;
}

export function newGame(
  setup: PlayerSetup[],
  mode: GameState["mode"],
  rules: Rules = DEFAULT_RULES,
  rnd = Math.random,
): GameState {
  if (setup.length < 2) throw new Error("UNO needs at least 2 players");
  if (setup.length > 10) throw new Error("Max 10 players");
  const players: Player[] = setup.map((p, i) => ({
    id: `p${i}`,
    name: p.name,
    isBot: p.isBot,
    difficulty: p.difficulty,
    hand: [],
    saidUno: false,
    connected: true,
    score: 0,
  }));
  const s: GameState = {
    id: `g${Date.now().toString(36)}`,
    mode,
    rules,
    players,
    drawPile: [],
    discard: [],
    activeColor: "red",
    direction: 1,
    current: 0,
    pendingDraw: 0,
    drawnCardId: null,
    unoVulnerable: null,
    status: "playing",
    roundWinner: null,
    round: 0,
    version: 0,
    log: [],
  };
  return dealRound(s, rnd);
}

export function dealRound(prev: GameState, rnd = Math.random): GameState {
  const s: GameState = structuredClone(prev);
  let deck = shuffle(buildDeck(), rnd);
  for (const p of s.players) {
    p.hand = deck.splice(0, s.rules.handSize);
    p.saidUno = false;
  }
  // Starting card must be a number card (action/wild cards go back into the deck).
  const idx = deck.findIndex((c) => c.kind === "number");
  const start = deck.splice(idx, 1)[0];
  deck = shuffle(deck, rnd);
  s.drawPile = deck;
  s.discard = [start];
  s.activeColor = start.color as Color;
  s.direction = 1;
  s.current = s.round % s.players.length;
  s.round += 1;
  s.pendingDraw = 0;
  s.drawnCardId = null;
  s.unoVulnerable = null;
  s.status = "playing";
  s.roundWinner = null;
  s.version += 1;
  s.log = [`بدأت الجولة ${s.round}`];
  return s;
}

export function nextIndex(s: GameState, from: number, steps = 1): number {
  const n = s.players.length;
  return (((from + s.direction * steps) % n) + n) % n;
}

export function canPlay(s: GameState, card: Card): boolean {
  if (s.drawnCardId && card.id !== s.drawnCardId) return false;
  if (s.pendingDraw > 0) {
    if (!s.rules.stacking) return false;
    if (card.kind === "draw2") return true;
    if (card.kind === "wild4")
      return (
        s.rules.wild4Anytime || !s.players[s.current].hand.some((c) => c.color === s.activeColor)
      );
    return false;
  }
  if (card.kind === "wild") return true;
  if (card.kind === "wild4")
    return (
      s.rules.wild4Anytime || !s.players[s.current].hand.some((c) => c.color === s.activeColor)
    );
  const t = top(s);
  if (card.color === s.activeColor) return true;
  if (card.kind === "number") return t.kind === "number" && t.value === card.value;
  return card.kind === t.kind;
}

export type Result = { ok: true; state: GameState } | { ok: false; error: string };

function drawCards(s: GameState, pi: number, count: number) {
  for (let i = 0; i < count; i++) {
    if (s.drawPile.length === 0) {
      if (s.discard.length <= 1) break; // nothing left to recycle
      const t = s.discard.pop();
      if (!t) break;
      s.drawPile = shuffle(s.discard);
      s.discard = [t];
    }
    const drawn = s.drawPile.pop();
    if (!drawn) break;
    s.players[pi].hand.push(drawn);
  }
  s.players[pi].saidUno = false;
}

function endTurnGuards(s: GameState, pi: number, expectVersion?: number): string | null {
  if (s.status !== "playing") return "الجولة منتهية";
  if (expectVersion !== undefined && expectVersion !== s.version) return "حركة مكررة";
  if (pi !== s.current) return "ليس دورك";
  return null;
}

function finishRound(s: GameState, winner: number) {
  // Last card was a draw card: next player still draws the penalty.
  if (s.pendingDraw > 0) {
    const victim = nextIndex(s, winner);
    drawCards(s, victim, s.pendingDraw);
    s.log.push(`${s.players[victim].name} سحب ${s.pendingDraw}`);
    s.pendingDraw = 0;
  }
  const pts = s.players.reduce(
    (sum, p, i) => (i === winner ? sum : sum + p.hand.reduce((a, c) => a + cardPoints(c), 0)),
    0,
  );
  s.players[winner].score += pts;
  s.roundWinner = winner;
  s.unoVulnerable = null;
  s.status = s.players[winner].score >= s.rules.targetScore ? "matchOver" : "roundOver";
  s.log.push(`${s.players[winner].name} فاز بالجولة (+${pts})`);
}

export function playCard(
  prev: GameState,
  pi: number,
  cardId: string,
  chosen?: Color,
  expectVersion?: number,
): Result {
  const g = endTurnGuards(prev, pi, expectVersion);
  if (g) return { ok: false, error: g };
  const p = prev.players[pi];
  const card = p.hand.find((c) => c.id === cardId);
  if (!card) return { ok: false, error: "البطاقة ليست في يدك" };
  if (!canPlay(prev, card))
    return {
      ok: false,
      error:
        prev.pendingDraw > 0
          ? `عليك عقوبة +${prev.pendingDraw}: العب +2 أو +4 أو اسحب`
          : "البطاقة لا تطابق اللون أو الرقم أو الرمز",
    };
  if ((card.kind === "wild" || card.kind === "wild4") && (!chosen || !COLORS.includes(chosen)))
    return { ok: false, error: "اختر لوناً" };

  const s: GameState = structuredClone(prev);
  s.version += 1;
  if (s.unoVulnerable !== null && s.unoVulnerable !== pi) s.unoVulnerable = null;
  const me = s.players[pi];
  me.hand = me.hand.filter((c) => c.id !== cardId);
  s.discard.push(card);
  s.drawnCardId = null;
  s.activeColor = card.color === "wild" ? (chosen ?? s.activeColor) : card.color;
  s.log.push(`${me.name} لعب ${describe(card)}`);

  if (me.hand.length === 1) {
    if (!me.saidUno) s.unoVulnerable = pi;
  } else me.saidUno = false;

  let skip = 0;
  if (card.kind === "draw2") s.pendingDraw += 2;
  if (card.kind === "wild4") s.pendingDraw += 4;
  if (card.kind === "skip") skip = 1;
  if (card.kind === "reverse") {
    if (s.players.length === 2) skip = 1;
    else s.direction = (s.direction * -1) as 1 | -1;
  }

  if (me.hand.length === 0) {
    finishRound(s, pi);
    return { ok: true, state: s };
  }
  s.current = nextIndex(s, pi, 1 + skip);
  return { ok: true, state: s };
}

export function drawCard(prev: GameState, pi: number, expectVersion?: number): Result {
  const g = endTurnGuards(prev, pi, expectVersion);
  if (g) return { ok: false, error: g };
  if (prev.drawnCardId) return { ok: false, error: "سحبت بالفعل: العب البطاقة أو مرّر" };
  const s: GameState = structuredClone(prev);
  s.version += 1;
  if (s.unoVulnerable !== null && s.unoVulnerable !== pi) s.unoVulnerable = null;
  if (s.pendingDraw > 0) {
    const n = s.pendingDraw;
    drawCards(s, pi, n);
    s.pendingDraw = 0;
    s.log.push(`${s.players[pi].name} سحب عقوبة ${n}`);
    s.current = nextIndex(s, pi);
    return { ok: true, state: s };
  }
  const before = s.players[pi].hand.length;
  drawCards(s, pi, 1);
  s.log.push(`${s.players[pi].name} سحب بطاقة`);
  const drawn = s.players[pi].hand[before] as Card | undefined;
  if (drawn && canPlay({ ...s, drawnCardId: null }, drawn)) s.drawnCardId = drawn.id;
  else s.current = nextIndex(s, pi);
  return { ok: true, state: s };
}

export function passTurn(prev: GameState, pi: number, expectVersion?: number): Result {
  const g = endTurnGuards(prev, pi, expectVersion);
  if (g) return { ok: false, error: g };
  if (!prev.drawnCardId) return { ok: false, error: "لا يمكنك التمرير قبل السحب" };
  const s: GameState = structuredClone(prev);
  s.version += 1;
  s.drawnCardId = null;
  s.current = nextIndex(s, pi);
  return { ok: true, state: s };
}

export function sayUno(prev: GameState, pi: number): Result {
  if (prev.status !== "playing" || !prev.players[pi])
    return { ok: false, error: "الجولة منتهية أو اللاعب غير موجود" };
  const s: GameState = structuredClone(prev);
  const p = s.players[pi];
  const eligible = (pi === s.current && p.hand.length === 2) || s.unoVulnerable === pi;
  if (!eligible) return { ok: false, error: "تقول أونو عندما تبقى لك بطاقة واحدة" };
  p.saidUno = true;
  s.version += 1;
  if (s.unoVulnerable === pi) s.unoVulnerable = null;
  s.log.push(`${p.name}: أونو`);
  return { ok: true, state: s };
}

export function catchUno(prev: GameState, catcher: number): Result {
  if (prev.status !== "playing" || !prev.players[catcher])
    return { ok: false, error: "الجولة منتهية أو اللاعب غير موجود" };
  if (prev.unoVulnerable === null || prev.unoVulnerable === catcher)
    return { ok: false, error: "لا يوجد لاعب لم يقل أونو" };
  const s: GameState = structuredClone(prev);
  const victim = prev.unoVulnerable;
  s.version += 1;
  drawCards(s, victim, 2);
  s.unoVulnerable = null;
  s.log.push(`${s.players[catcher].name} كشف ${s.players[victim].name}: يسحب 2`);
  return { ok: true, state: s };
}

export function describe(c: Card): string {
  const col: Record<string, string> = {
    red: "أحمر",
    blue: "أزرق",
    green: "أخضر",
    yellow: "أصفر",
    wild: "",
  };
  const k: Record<Kind, string> = {
    number: String(c.value),
    skip: "تخطي",
    reverse: "عكس",
    draw2: "+2",
    wild: "جوكر لون",
    wild4: "+4",
  };
  return `${k[c.kind]} ${col[c.color]}`.trim();
}
