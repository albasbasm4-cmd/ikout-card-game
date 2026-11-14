/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * unoNet — اللعب الجماعي عبر الأجهزة (Hotspot/Wi-Fi) للونو عبر قناة "uno" في gameHub.
 * المضيف: يبقي الحالة المرجعية (GameState كامل) ويبث نسخاً مقنّعة للأيدي لكل جهاز.
 * المنضم: يرسل أهدافاً (INTENT) ويستقبل الحالة المقنّعة فقط.
 */
import {
  ensureHubServer,
  hubBroadcast,
  hubSendTo,
  registerHubChannel,
} from "../../network/gameHub";
import { getJoinCandidateIps } from "../../network/wssBridge";
import { LocalClientSocket, getOrCreatePlayerToken } from "../../network/LocalClientSocket";
import {
  catchUno,
  drawCard,
  passTurn,
  playCard,
  sayUno,
  type Card,
  type GameState,
  type Result,
} from "./engine";

// ---------------- أدوات مشتركة ----------------

const MASKED_CARD: Card = { id: "__masked__", color: "red", kind: "number", value: 0 };

/** يخفي أيدٍ الخصوم وكومة السحب قبل إرسال الحالة لجهاز منضم. */
export function maskUnoState(s: GameState, seat: number): GameState {
  const c = structuredClone(s);
  c.drawPile = c.drawPile.map(() => MASKED_CARD);
  c.players = c.players.map((p, i) =>
    i === seat ? p : { ...p, hand: p.hand.map(() => MASKED_CARD) },
  );
  return c;
}

export type UnoIntent =
  | { type: "PLAY"; cardId: string; color?: string }
  | { type: "DRAW" }
  | { type: "PASS" }
  | { type: "SAY_UNO" }
  | { type: "CATCH" };

function applyIntent(s: GameState, seat: number, intent: UnoIntent): Result {
  switch (intent.type) {
    case "PLAY":
      return playCard(s, seat, intent.cardId, intent.color as never, s.version);
    case "DRAW":
      return drawCard(s, seat, s.version);
    case "PASS":
      return passTurn(s, seat, s.version);
    case "SAY_UNO":
      return sayUno(s, seat);
    case "CATCH":
      return catchUno(s, seat);
  }
}

// ---------------- جانب المضيف ----------------

interface UnoHostState {
  code: string;
  clientIdToSeat: Map<string, number>;
  seatNames: (string | null)[];
  state: GameState | null;
  seatListeners: Set<(seats: (string | null)[]) => void>;
  stateListeners: Set<(s: GameState) => void>;
}

let host: UnoHostState | null = null;
let unregisterChannel: (() => void) | null = null;

export function isUnoHostActive(): boolean {
  return host !== null;
}

function emitSeats(): void {
  if (!host) return;
  const seats = [...host.seatNames];
  for (const l of host.seatListeners) l(seats);
  // نبث مقاعد الغرفة لكل الأجهزة المنضمة ليظهر لها مكانها في غرفة المضيف قبل بدء المباراة
  const packet = { type: "SEATS", payload: { seats } };
  for (const clientId of host.clientIdToSeat.keys()) {
    hubSendTo(clientId, { ch: "uno", packet });
  }
}

function sendStateTo(clientId: string): void {
  if (!host?.state) return;
  const seat = host.clientIdToSeat.get(clientId);
  if (seat === undefined) return;
  hubSendTo(clientId, {
    ch: "uno",
    packet: { type: "STATE", payload: { state: maskUnoState(host.state, seat) } },
  });
}

function publishState(): void {
  if (!host?.state) return;
  for (const clientId of host.clientIdToSeat.keys()) sendStateTo(clientId);
  for (const l of host.stateListeners) l(host.state);
}

/** المضيف: يشغّل قناة "uno" (يُستدعى من شاشة إنشاء الغرفة). */
export async function startUnoHost(code: string): Promise<void> {
  if (host?.code === code && unregisterChannel) return;
  await stopUnoHost();
  host = {
    code,
    clientIdToSeat: new Map(),
    seatNames: Array.from({ length: 10 }, () => null),
    state: null,
    seatListeners: new Set(),
    stateListeners: new Set(),
  };
  await ensureHubServer();
  unregisterChannel = registerHubChannel("uno", {
    onClientDisconnected(clientId) {
      if (!host) return;
      const seat = host.clientIdToSeat.get(clientId);
      if (seat !== undefined) {
        // Keep the stable playerToken-to-seat binding during a temporary drop.
        // A reconnect with the same token resumes this exact seat.
        emitSeats();
      }
    },
    onClientMessage(clientId, msg) {
      if (!host) return;
      const p = (msg as Record<string, unknown>)["packet"] as
        { type?: string; payload?: Record<string, unknown> } | undefined;
      if (!p?.type) return;
      if (p.type === "HELLO") {
        const givenCode = String(p.payload?.["roomCode"] ?? "").trim().toUpperCase();
        if (host.code && givenCode !== host.code.toUpperCase()) {
          hubSendTo(clientId, { ch: "uno", packet: { type: "INVALID_ROOM" } });
          return;
        }
        let seat = host.clientIdToSeat.get(clientId);
        if (seat === undefined) {
          seat = host.seatNames.findIndex((n, i) => i > 0 && n === null);
          if (seat === -1) {
            hubSendTo(clientId, { ch: "uno", packet: { type: "ROOM_FULL" } });
            return;
          }
          host.clientIdToSeat.set(clientId, seat);
        }
        host.seatNames[seat] = String(p.payload?.["name"] ?? "لاعب");
        hubSendTo(clientId, {
          ch: "uno",
          packet: { type: "WELCOME", payload: { seat, code: host.code } },
        });
        emitSeats();
        if (host.state) sendStateTo(clientId);
        return;
      }
      const seat = host.clientIdToSeat.get(clientId);
      if (seat === undefined) return;
      if (p.type === "INTENT") {
        const st = host.state;
        if (!st) return;
        const r = applyIntent(st, seat, p.payload as unknown as UnoIntent);
        if (r.ok) {
          host.state = r.state;
          publishState();
        } else {
          hubSendTo(clientId, {
            ch: "uno",
            packet: { type: "ERROR", payload: { error: r.error } },
          });
        }
      }
    },
  });
}

export function stopUnoHost(): void {
  unregisterChannel?.();
  unregisterChannel = null;
  host = null;
}

/** المضيف: أسماء المقاعد النهائية (من شاشة الغرفة قبل البدء). */
export function setUnoHostSeatNames(names: (string | null)[]): void {
  if (!host) return;
  host.seatNames = Array.from({ length: 10 }, (_, i) => names[i] ?? null);
  emitSeats();
}

/** المضيف: يبدأ مباراة جديدة ويبثها. */
export function unoHostNewGame(state: GameState): void {
  if (!host) return;
  host.state = state;
  publishState();
}

/** المضيف: ينشر حالة محدثة محلياً (تحرك المضيف/البوتات/الجولة الجديدة). */
export function unoHostPublish(state: GameState): void {
  if (!host) return;
  host.state = state;
  publishState();
}

export function unoHostGetState(): GameState | null {
  return host?.state ?? null;
}

export function unoHostGetSeats(): (string | null)[] {
  return host ? [...host.seatNames] : [];
}

/** يشترك في تغيّرات الحالة الواردة من أهداف اللاعبين البعيدين (واجهة المضيف). */
export function onUnoHostState(cb: (s: GameState) => void): () => void {
  if (!host) return () => {};
  host.stateListeners.add(cb);
  return () => {
    host?.stateListeners.delete(cb);
  };
}

/** يشترك في انضمام/مغادرة المقاعد (واجهة لوبي المضيف). */
export function onUnoHostSeats(cb: (seats: (string | null)[]) => void): () => void {
  if (!host) return () => {};
  host.seatListeners.add(cb);
  return () => {
    host?.seatListeners.delete(cb);
  };
}

// ---------------- جانب المنضم ----------------

interface UnoClientState {
  socket: LocalClientSocket;
  mySeat: number;
  code: string;
  stateListeners: Set<(s: GameState) => void>;
  /** مقاعد الغرفة الواردة من المضيف قبل بدء المباراة (واجهة غرفة المضيف للمنضم). */
  seatListeners: Set<(seats: (string | null)[]) => void>;
  /** آخر حالة وصلت من المضيف (لاستئنافها فور فتح شاشة اللعب دون فقدانها). */
  lastState: GameState | null;
}

let client: UnoClientState | null = null;

export function getUnoNetClient(): UnoClientState | null {
  return client;
}

/** آخر حالة وصلت من المضيف — تُستخدم عند فتح شاشة اللعب بعد فوات اشتراك المستمع. */
export function unoClientGetLastState(): GameState | null {
  return client?.lastState ?? null;
}

export function unoClientSendIntent(intent: UnoIntent): void {
  client?.socket.send({ v: 1, type: "INTENT", payload: intent } as never);
}

export function disconnectUnoClient(): void {
  if (client) {
    try {
      client.socket.disconnect();
    } catch {
      /* noop */
    }
  }
  client = null;
}

function listenToClientSocket(socket: LocalClientSocket): void {
  socket.onMessage((packet) => {
    const p = packet as unknown as { type?: string; payload?: Record<string, unknown> };
    if (!client || !p?.type) return;
    if (p.type === "WELCOME") {
      client.mySeat = Number(p.payload?.["seat"] ?? 0);
    } else if (p.type === "STATE") {
      const st = p.payload?.["state"] as GameState | undefined;
      if (st) {
        client.lastState = st;
        for (const l of client.stateListeners) l(st);
      }
    } else if (p.type === "SEATS") {
      const seats = p.payload?.["seats"] as (string | null)[] | undefined;
      if (seats) {
        for (const l of client.seatListeners) l(seats);
      }
    }
  });
}

/** المنضم: يبحث عن المضيف على نقطة الاتصال وينضم بغرفة الرمز. */
export async function connectUnoClient(opts: { code: string; name: string }): Promise<boolean> {
  disconnectUnoClient();
  const candidates = await getJoinCandidateIps();
  for (const ip of candidates) {
    const ok = await probeUnoHost(ip, opts);
    if (ok) return true;
  }
  return false;
}

function probeUnoHost(ip: string, opts: { code: string; name: string }): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const socket = new LocalClientSocket({
      url: `ws://${ip}:8080`,
      playerToken: getOrCreatePlayerToken("uno"),
      playerName: opts.name || "لاعب",
      maxReconnectAttempts: 0,
      initialBackoffMs: 300,
      channel: "uno",
      roomCode: opts.code,
    });
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (!ok) {
        socket.disconnect();
        resolve(false);
      }
    };
    const timeout = setTimeout(() => finish(false), 3000);
    socket.onStatusChange((st) => {
      if (st === "CONNECTED") {
        socket.send({
          v: 1,
          type: "HELLO",
          payload: { name: opts.name || "لاعب", roomCode: opts.code },
        } as never);
      } else if (st === "HOST_DROPPED" || st === "DISCONNECTED") {
        finish(false);
      }
    });
    socket.onMessage((packet) => {
      const p = packet as unknown as { type?: string };
      if (p.type === "INVALID_ROOM") {
        finish(false);
        return;
      }
      if (p?.type === "WELCOME" && !settled) {
        settled = true;
        clearTimeout(timeout);
        client = {
          socket,
          mySeat: 0,
          code: opts.code,
          stateListeners: new Set(),
          seatListeners: new Set(),
          lastState: null,
        };
        listenToClientSocket(socket);
        resolve(true);
      }
    });
  });
}

/** يشترك في وصول حالات المضيف (واجهة المنضم). */
export function onUnoClientState(cb: (s: GameState) => void): () => void {
  if (!client) return () => {};
  client.stateListeners.add(cb);
  return () => {
    client?.stateListeners.delete(cb);
  };
}

/** يشترك في تحديث مقاعد الغرفة الواردة من المضيف (واجهة غرفة المضيف للمنضم). */
export function onUnoClientSeats(cb: (seats: (string | null)[]) => void): () => void {
  if (!client) return () => {};
  client.seatListeners.add(cb);
  return () => {
    client?.seatListeners.delete(cb);
  };
}

/** نبث الحالة المبدئية أيضاً عبر hubBroadcast عند عدم وجود مقاعد مسجلة (احتياط). */
export function unoHostBroadcastAll(state: GameState): void {
  hubBroadcast({ ch: "uno", packet: { type: "STATE", payload: { state } } });
}
