import { getPersistentPlayerToken } from "../network/playerToken";
import { withoutAuthSecrets } from "../network/wirePrivacy";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * jokerNet — اللعب الجماعي عبر الأجهزة (Hotspot/Wi-Fi) للجوكر عبر قناة "joker" في gameHub.
 * المضيف: يبقي الحالة المرجعية (يتضمن هوية حامل الجوكر) ويبث نسخاً مقنّعة لكل جهاز،
 * وتُكشف هوية الجوكر وورق الجميع فقط في طور النتائج.
 */
import {
  ensureHubServer,
  hubBroadcast,
  hubSendTo,
  hubCloseClient,
  registerHubChannel,
} from "../network/gameHub";
import { getJoinCandidateIps } from "../network/wssBridge";
import { LocalClientSocket } from "../network/LocalClientSocket";
import { actJoker, type JokerGame } from "./engine";

/** يخفي هوية حامل الجوكر وورق الآخرين أثناء اللعب، ويكشف كل شيء في النتائج. */
export function maskJokerState(s: JokerGame, pid: string): JokerGame {
  if (s.phase !== "play") return withoutAuthSecrets(s);
  return withoutAuthSecrets({
    ...s,
    joker: s.joker === pid ? pid : "",
    cards: { [pid]: s.cards[pid] ?? "" },
  });
}

// ---------------- جانب المضيف ----------------

interface JokerHostState {
  code: string;
  clientIdToPid: Map<string, string>;
  tokenToPid: Map<string, string>;
  clientToToken: Map<string, string>;
  tokenToClient: Map<string, string>;
  disconnectTimers: Map<string, ReturnType<typeof setTimeout>>;
  lastSeqByClient: Map<string, number>;
  pidNames: Record<string, string>;
  state: JokerGame | null;
  seatListeners: Set<(names: Record<string, string>) => void>;
  stateListeners: Set<(s: JokerGame) => void>;
}

function bindJokerClient(clientId: string, token: string): void {
  if (!host) return;
  const old = host.tokenToClient.get(token);
  if (old && old !== clientId) {
    host.clientIdToPid.delete(old);
    host.clientToToken.delete(old);
    host.lastSeqByClient.delete(old);
    hubCloseClient(old);
  }
  host.tokenToClient.set(token, clientId);
  host.clientToToken.set(clientId, token);
}

let host: JokerHostState | null = null;
let unregisterChannel: (() => void) | null = null;

export function isJokerHostActive(): boolean {
  return host !== null;
}

function emitSeats(): void {
  if (!host) return;
  const names = { ...host.pidNames };
  for (const l of host.seatListeners) l(names);
  // نبث مقاعد الغرفة لكل الأجهزة المنضمة ليظهر لها مكانها في غرفة المضيف قبل بدء المباراة
  const packet = { type: "SEATS", payload: { names } };
  for (const clientId of host.clientIdToPid.keys()) {
    hubSendTo(clientId, { ch: "joker", packet });
  }
}

function sendStateTo(clientId: string): void {
  if (!host?.state) return;
  const pid = host.clientIdToPid.get(clientId);
  if (!pid) return;
  hubSendTo(clientId, {
    ch: "joker",
    packet: { type: "STATE", payload: { state: maskJokerState(host.state, pid) } },
  });
}

function publishState(): void {
  if (!host?.state) return;
  for (const clientId of host.clientIdToPid.keys()) sendStateTo(clientId);
  for (const l of host.stateListeners) l(host.state);
}

/** المضيف: يشغّل قناة "joker" (يُستدعى عند إنشاء الغرفة). */
export async function startJokerHost(code: string): Promise<void> {
  if (host?.code === code && unregisterChannel) return;
  await stopJokerHost();
  host = {
    code,
    clientIdToPid: new Map(),
    tokenToPid: new Map(),
    clientToToken: new Map(),
    tokenToClient: new Map(),
    disconnectTimers: new Map(),
    lastSeqByClient: new Map(),
    pidNames: {},
    state: null,
    seatListeners: new Set(),
    stateListeners: new Set(),
  };
  await ensureHubServer();
  unregisterChannel = registerHubChannel("joker", {
    onClientDisconnected(clientId) {
      if (!host) return;
      const token = host.clientToToken.get(clientId);
      host.clientToToken.delete(clientId);
      if (!token) return;
      if (host.tokenToClient.get(token) !== clientId) return;
      host.tokenToClient.delete(token);

      const pid = host.tokenToPid.get(token);
      if (!pid) return;

      const existing = host.disconnectTimers.get(pid);
      if (existing) clearTimeout(existing);
      host.disconnectTimers.set(
        pid,
        setTimeout(() => {
          if (!host) return;
          host.disconnectTimers.delete(pid);
        }, 8000),
      );
    },
    onClientMessage(clientId, msg) {
      if (!host) return;
      const p = (msg as Record<string, unknown>)["packet"] as
        { type?: string; payload?: Record<string, unknown> } | undefined;
      if (!p?.type) return;
      if (p.type === "HELLO" || p.type === "JOIN") {
        const givenCode = String(p.payload?.["roomCode"] ?? "")
          .trim()
          .toUpperCase();
        if (host.code && givenCode !== host.code.toUpperCase()) {
          hubSendTo(clientId, { ch: "joker", packet: { type: "INVALID_ROOM" } });
          return;
        }
        const name = String(p.payload?.["name"] ?? p.payload?.["playerName"] ?? "لاعب");
        const token = String(
          p.payload?.["token"] ?? (p as Record<string, unknown>)["playerToken"] ?? "",
        ).trim();
        const transportToken = String(
          (p as Record<string, unknown>)["playerToken"] ?? token,
        ).trim();
        if (
          !token ||
          !transportToken ||
          token !== transportToken ||
          (host.state?.phase === "play" && !host.tokenToPid.has(token))
        ) {
          hubSendTo(clientId, { ch: "joker", packet: { type: "INVALID_TOKEN" } });
          return;
        }
        bindJokerClient(clientId, token);

        let pid = host.tokenToPid.get(token);
        if (pid) {
          // استعادة المقعد وإلغاء مؤقت الانقطاع
          const timer = host.disconnectTimers.get(pid);
          if (timer) {
            clearTimeout(timer);
            host.disconnectTimers.delete(pid);
          }
        } else {
          const used = new Set(host.tokenToPid.values());
          for (let i = 1; i <= 14; i++) {
            const candidate = `p${i}`;
            if (!used.has(candidate)) {
              pid = candidate;
              break;
            }
          }
          if (!pid) {
            hubSendTo(clientId, { ch: "joker", packet: { type: "ROOM_FULL" } });
            return;
          }
          host.tokenToPid.set(token, pid);
        }

        host.clientIdToPid.set(clientId, pid);
        host.pidNames[pid] = name;
        hubSendTo(clientId, {
          ch: "joker",
          packet: { type: "WELCOME", payload: { pid, code: host.code } },
        });
        emitSeats();
        if (host.state) sendStateTo(clientId);
        return;
      }
      const pid = host.clientIdToPid.get(clientId);
      const token = host.clientToToken.get(clientId);
      if (
        !pid ||
        !token ||
        host.tokenToClient.get(token) !== clientId ||
        host.tokenToPid.get(token) !== pid
      )
        return;
      const seq = Number((p as Record<string, unknown>)["seq"]);
      if (!Number.isSafeInteger(seq) || seq <= 0) return;
      if (Number.isInteger(seq) && seq > 0) {
        const previous = host.lastSeqByClient.get(clientId) ?? 0;
        if (seq <= previous) return;
        host.lastSeqByClient.set(clientId, seq);
      }
      if (p.type === "INTENT") {
        const st = host.state;
        if (!st || st.phase !== "play") return;
        const id = String(p.payload?.["id"] ?? "");
        const to = p.payload?.["to"] as string | undefined;
        if (id !== pid) return; // كل جهاز يتحكم بمقعده فقط
        const next = actJoker(st, id, to);
        if (next !== st) {
          host.state = next;
          publishState();
        }
      }
    },
  });
}

export function stopJokerHost(): Promise<void> {
  if (host) {
    for (const timer of host.disconnectTimers.values()) {
      clearTimeout(timer);
    }
    host.disconnectTimers.clear();
    host.clientIdToPid.clear();
    host.tokenToPid.clear();
    host.clientToToken.clear();
    host.tokenToClient.clear();
    host.lastSeqByClient.clear();
  }
  unregisterChannel?.();
  unregisterChannel = null;
  host = null;
  return Promise.resolve();
}

/** المضيف: أسماء اللاعبين البعيدين الحاليين (واجهة لوبي المضيف). */
export function onJokerHostSeats(cb: (names: Record<string, string>) => void): () => void {
  if (!host) return () => {};
  host.seatListeners.add(cb);
  return () => {
    host?.seatListeners.delete(cb);
  };
}

export function jokerHostGetSeatNames(): Record<string, string> {
  return host ? { ...host.pidNames } : {};
}

/** المضيف: يبدأ لعبة جديدة ويبثها. */
export function jokerHostNewGame(state: JokerGame): void {
  if (!host) return;
  host.state = state;
  publishState();
}

/** المضيف: ينشر حالة محدثة محلياً (تحرك المضيف/البوتات/الجولة الجديدة). */
export function jokerHostPublish(state: JokerGame): void {
  if (!host) return;
  host.state = state;
  publishState();
}

export function jokerHostGetState(): JokerGame | null {
  return host?.state ?? null;
}

/** يشترك في تغيّرات الحالة الواردة من أهداف اللاعبين البعيدين (واجهة المضيف). */
export function onJokerHostState(cb: (s: JokerGame) => void): () => void {
  if (!host) return () => {};
  host.stateListeners.add(cb);
  return () => {
    host?.stateListeners.delete(cb);
  };
}

// ---------------- جانب المنضم ----------------

interface JokerClientState {
  socket: LocalClientSocket;
  myPid: string;
  code: string;
  stateListeners: Set<(s: JokerGame) => void>;
  /** مقاعد الغرفة الواردة من المضيف قبل بدء المباراة (واجهة غرفة المضيف للمنضم). */
  seatListeners: Set<(names: Record<string, string>) => void>;
}

let client: JokerClientState | null = null;

export function getJokerNetClient(): JokerClientState | null {
  return client;
}

export function jokerClientSendAct(id: string, to?: string): void {
  client?.socket.send({
    v: 1,
    type: "INTENT",
    payload: { type: "ACT", id, to },
  } as never);
}

export function disconnectJokerClient(): void {
  if (client) {
    try {
      client.socket.disconnect();
    } catch {
      /* noop */
    }
  }
  client = null;
}

/** المنضم: يبحث عن المضيف على نقطة الاتصال وينضم بغرفة الرمز. */
export async function connectJokerClient(opts: {
  code: string;
  name: string;
  hostIp?: string;
}): Promise<boolean> {
  disconnectJokerClient();
  const candidates = await getJoinCandidateIps(opts.hostIp);
  for (const ip of candidates) {
    const ok = await probeJokerHost(ip, opts);
    if (ok) return true;
  }
  return false;
}

function probeJokerHost(ip: string, opts: { code: string; name: string }): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const token = getPersistentPlayerToken("joker");
    const socket = new LocalClientSocket({
      url: ip.includes(":") ? `ws://${ip}` : `ws://${ip}:8080`,
      playerToken: token,
      playerName: opts.name || "لاعب",
      maxReconnectAttempts: 5,
      initialBackoffMs: 300,
      channel: "joker",
      roomCode: opts.code,
    });
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (!ok) {
        socket.disconnect();
        resolve(false);
      }
    };
    const timeout = window.setTimeout(() => finish(false), 3000);
    socket.onStatusChange((st) => {
      if (st === "CONNECTED") {
        socket.send({
          v: 1,
          type: "HELLO",
          playerToken: token,
          payload: { name: opts.name || "لاعب", roomCode: opts.code, token },
        } as never);
      } else if (st === "HOST_DROPPED" || st === "DISCONNECTED") {
        finish(false);
      }
    });
    socket.onMessage((packet) => {
      const p = packet as unknown as { type?: string; payload?: Record<string, unknown> };
      if (p?.type === "INVALID_ROOM" && !settled) {
        finish(false);
        return;
      }
      if (!client && p?.type === "WELCOME" && !settled) {
        settled = true;
        window.clearTimeout(timeout);
        client = {
          socket,
          myPid: String(p.payload?.["pid"] ?? "p1"),
          code: opts.code,
          stateListeners: new Set(),
          seatListeners: new Set(),
        };
        socket.onMessage((pkt) => {
          const m = pkt as unknown as { type?: string; payload?: Record<string, unknown> };
          if (!client || !m?.type) return;
          if (m.type === "STATE") {
            const st = m.payload?.["state"] as JokerGame | undefined;
            if (st) {
              for (const l of client.stateListeners) l(st);
            }
          } else if (m.type === "SEATS") {
            const names = m.payload?.["names"] as Record<string, string> | undefined;
            if (names) {
              for (const l of client.seatListeners) l(names);
            }
          }
        });
        resolve(true);
      }
    });
  });
}

/** يشترك في وصول حالات المضيف (واجهة المنضم). */
export function onJokerClientState(cb: (s: JokerGame) => void): () => void {
  if (!client) return () => {};
  client.stateListeners.add(cb);
  return () => {
    client?.stateListeners.delete(cb);
  };
}

/** يشترك في تحديث مقاعد الغرفة الواردة من المضيف (واجهة غرفة المضيف للمنضم). */
export function onJokerClientSeats(cb: (names: Record<string, string>) => void): () => void {
  if (!client) return () => {};
  client.seatListeners.add(cb);
  return () => {
    client?.seatListeners.delete(cb);
  };
}
