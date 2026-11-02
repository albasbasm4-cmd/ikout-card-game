/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * koutNet — ربط اللعب الجماعي للكوت بالتطبيق:
 * - المضيف: يفتح الخادم الأصلي ويستضيف جلسة HostSession كاملة.
 * - المنضم: عميل LocalClientSocket متصل بالمضيف.
 * وحدات أحادية (singleton) لأن الشاشات تعيش في أماكن مختلفة بالتطبيق.
 */

import { HostSession } from "./HostSession";
import { KoutWssTransport } from "./KoutWssTransport";
import { KoutGameEngine } from "../engine/KoutGameEngine";
import { GameState, PlayerSlot } from "../types/kout";
import { ensureHubServer, HUB_PORT } from "./gameHub";
import type { ClientGameState } from "./protocol";
import type { ITransport } from "./ITransport";

export interface KoutRoomNetConfig {
  roomCode: string;
  variant: "BO6" | "BO4";
  targetScore: number;
  /** مقاعد الغرفة الأولية (المضيف + بوتات + مقاعد بشرية بعيدة). */
  players?: PlayerSlot[];
}

export interface KoutHostHandle {
  session: HostSession;
  config: { roomCode: string; variant: "BO6" | "BO4"; targetScore: number };
  started: boolean;
}

export interface KoutClientHandle {
  socket: ITransport;
  mySeat: number;
  playerToken: string;
  /** أول حالة وصلت (لتجنب شاشة فارغة عند فتح الطاولة). */
  initialState?: ClientGameState;
  roomCode?: string;
}

let activeHost: KoutHostHandle | null = null;
let activeClient: KoutClientHandle | null = null;

export function getActiveKoutHost(): KoutHostHandle | null {
  return activeHost;
}
export function getActiveKoutClient(): KoutClientHandle | null {
  return activeClient;
}
export function setActiveKoutClient(c: KoutClientHandle | null): void {
  activeClient = c;
}
export function clearKoutNet(): void {
  if (activeHost) {
    try {
      activeHost.session.destroy();
    } catch {
      /* noop */
    }
  }
  activeHost = null;
  setActiveKoutClient(null);
}

/** المضيف: يجهز الجلسة فوراً ويشغّل الخادم الأصلي في الخلفية (بدون بدء جولة — تبدأ عند «ابدأ المباراة»). */
export function startKoutHost(
  roomCode: string,
  config: { variant: "BO6" | "BO4"; targetScore: number },
): KoutHostHandle {
  const engine = new KoutGameEngine({
    variant: config.variant,
    targetScore: config.targetScore,
    initialDealer: 0,
    seed: Math.floor(Math.random() * 1000000),
  });
  const transport = new KoutWssTransport();
  const session = new HostSession(transport, {
    engine,
    roomCode,
    hostSeat: 0,
  });
  const handle: KoutHostHandle = {
    session,
    config: { roomCode, variant: config.variant, targetScore: config.targetScore },
    started: false,
  };
  activeHost = handle;
  void (async () => {
    try {
      const serverAvailable = await ensureHubServer(HUB_PORT);
      const started = await transport.start();
      handle.started = serverAvailable && started;
    } catch (err) {
      console.error("[koutNet] host start failed", err);
    }
  })();
  return handle;
}

/** المضيف: إيقاف الخادم والجلسة نهائياً (مغادرة الغرفة). */
export function stopKoutHost(): void {
  if (activeHost) {
    try {
      activeHost.session.destroy();
    } catch {
      /* noop */
    }
  }
  activeHost = null;
}

/** المضيف: يبدأ المباراة بتشكيلة الغرفة النهائية ويبث أول حالة. */
export function koutHostStartMatch(players: PlayerSlot[], engine?: KoutGameEngine): void {
  const host = activeHost;
  if (!host) return;
  const finalEngine =
    engine ??
    new KoutGameEngine({
      variant: host.config.variant,
      targetScore: host.config.targetScore,
      initialDealer: 0,
      seed: Math.floor(Math.random() * 1000000),
      players,
    });
  host.session.replaceEngine(finalEngine);
  host.session.startRound();
}

/** المضيف: مزامنة الحالة بعد بلاغ غش حُسم محلياً بمحرك جديد. */
export function koutHostReplaceEngine(engine: KoutGameEngine): void {
  activeHost?.session.replaceEngine(engine);
}

export function koutHostBroadcast(): void {
  activeHost?.session.broadcastState();
}

/** المنضم: يستقبل حالة أولية بعد الانضمام (يُخزن من شاشة الغرفة). */
export function koutClientSetInitialState(state: ClientGameState): void {
  if (activeClient) activeClient.initialState = state;
}
