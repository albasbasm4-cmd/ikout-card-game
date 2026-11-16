/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * اختبار محاكاة شامل لجميع سيناريوهات اللعب الجماعي حسب دليل الإصلاح:
 * 1. إعادة الاتصال في غرفة ممتلئة بنجاح
 * 2. احتفاظ اللاعب بمقعده الأصلي عند إعادة الاتصال
 * 3. انقطاع الاتصال وتولي الروبوت للمقعد بعد 8 ثوانٍ دون تجميد اللعبة
 * 4. عودة اللاعب قبل انتهاء المهلة واستعادة المقعد كلاعب بشري
 * 5. أمان التوكنات وعدم تسريبها في حزم البث وحالات اللاعبين الآخرين
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LoopbackHub } from "./LoopbackTransport";
import { HostSession } from "./HostSession";
import { HostPacket, filterStateForSeat } from "./protocol";

describe("Multiplayer Simulation Tests (دليل إصلاح اللعب الجماعي)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const step = async (ms = 20) => {
    await vi.advanceTimersByTimeAsync(ms);
  };

  it("حالة 1: إعادة الاتصال في غرفة ممتلئة تحتفظ بالمقعد ولا ترفض بـ ROOM_FULL", async () => {
    const hub = new LoopbackHub();
    const host = new HostSession(hub.getHostTransport(), {
      variant: "BO4",
      roomCode: "ROOM1",
      hostSeat: 0,
    });

    const clientTokens = ["token_p1", "token_p2", "token_p3"];
    const clients = clientTokens.map((t) => hub.createClientTransport(t));

    // انضمام 3 لاعبين لإكمال الغرفة (المقعد 0 محجوز للمضيف، والمقاعد 1 و2 و3 للمنضمين)
    for (let i = 0; i < 3; i++) {
      clients[i].send({
        v: 1,
        seq: i + 1,
        playerToken: clientTokens[i],
        type: "JOIN",
        payload: { playerName: `لاعب ${i + 2}`, roomCode: "ROOM1" },
      } as any);
    }
    await step();

    // محاولة انضمام لاعب رابع إضافي بتوكن جديد: يجب أن تُرفض بـ ROOM_FULL
    const extraClient = hub.createClientTransport("token_extra");
    const extraPackets: HostPacket[] = [];
    extraClient.onMessage((p) => extraPackets.push(p));
    extraClient.send({
      v: 1,
      seq: 10,
      playerToken: "token_extra",
      type: "JOIN",
      payload: { playerName: "لاعب إضافي", roomCode: "ROOM1" },
    } as any);
    await step();

    expect(
      extraPackets.some((p) => p.type === "ERROR" && (p.payload as any).code === "ROOM_FULL"),
    ).toBe(true);

    // الآن: انقطاع اللاعب الثاني (token_p2) عبر disconnect
    clients[1].disconnect();
    await step();

    // إعادة انضمامه بنفس التوكن token_p2
    const reconnectedClient = hub.createClientTransport("token_p2");
    const reconnectPackets: HostPacket[] = [];
    reconnectedClient.onMessage((p) => reconnectPackets.push(p));

    reconnectedClient.send({
      v: 1,
      seq: 20,
      playerToken: "token_p2",
      type: "JOIN",
      payload: { playerName: "لاعب 3 العائد", roomCode: "ROOM1" },
    } as any);
    await step();

    // يجب ألا يحصل على ROOM_FULL، بل على SEAT_UPDATE بنفس المقعد 2
    expect(
      reconnectPackets.some((p) => p.type === "ERROR" && (p.payload as any).code === "ROOM_FULL"),
    ).toBe(false);

    const seatUpdate = reconnectPackets.find((p) => p.type === "SEAT_UPDATE");
    expect(seatUpdate).toBeDefined();
    expect((seatUpdate?.payload as any).seatIndex).toBe(2);

    host.destroy();
  });

  it("حالة 2: انقطاع الاتصال يحوّل المقعد إلى روبوت بعد 8 ثوانٍ دون تجميد", async () => {
    const hub = new LoopbackHub();
    const host = new HostSession(hub.getHostTransport(), {
      variant: "BO4",
      roomCode: "ROOM2",
      hostSeat: 0,
    });

    const client = hub.createClientTransport("token_disconnect_test");
    client.send({
      v: 1,
      seq: 1,
      playerToken: "token_disconnect_test",
      type: "JOIN",
      payload: { playerName: "أحمد", roomCode: "ROOM2" },
    } as any);
    await step();

    let players = host.state.players!;
    expect(players[1].connected).toBe(true);

    // قطع الاتصال
    client.disconnect();
    await step();

    // فور الانقطاع: اللاعب معلّم connected: false
    players = host.state.players!;
    expect(players[1].connected).toBe(false);
    expect(players[1].kind).toBe("HUMAN_REMOTE");

    // تقديم الوقت بـ 7 ثوانٍ: لم يتحول بعد إلى روبوت
    await step(7000);
    players = host.state.players!;
    expect(players[1].kind).toBe("HUMAN_REMOTE");

    // تقديم ثانية إضافية (المجموع 8 ثوانٍ): يتولى الروبوت المقعد
    await step(1500);
    players = host.state.players!;
    expect(players[1].kind).toBe("AI_BOT");

    host.destroy();
  });

  it("حالة 3: عودة اللاعب قبل 8 ثوانٍ تلغي المؤقت وتستعيد وضعه كبشري", async () => {
    const hub = new LoopbackHub();
    const host = new HostSession(hub.getHostTransport(), {
      variant: "BO4",
      roomCode: "ROOM3",
      hostSeat: 0,
    });

    const client = hub.createClientTransport("token_fast_return");
    client.send({
      v: 1,
      seq: 1,
      playerToken: "token_fast_return",
      type: "JOIN",
      payload: { playerName: "خالد", roomCode: "ROOM3" },
    } as any);
    await step();

    // قطع الاتصال
    client.disconnect();
    await step();

    // تقديم 5 ثوانٍ فقط (قبل انتهاء المهلة)
    await step(5000);

    // إعادة الاتصال بنفس التوكن
    const returningClient = hub.createClientTransport("token_fast_return");
    returningClient.send({
      v: 1,
      seq: 2,
      playerToken: "token_fast_return",
      type: "JOIN",
      payload: { playerName: "خالد", roomCode: "ROOM3" },
    } as any);
    await step();

    let players = host.state.players!;
    expect(players[1].connected).toBe(true);
    expect(players[1].kind).toBe("HUMAN_REMOTE");

    // تقديم 10 ثوانٍ إضافية للتأكد من أن مؤقت الروبوت أُلغي تماماً
    await step(10000);
    players = host.state.players!;
    expect(players[1].kind).toBe("HUMAN_REMOTE");

    host.destroy();
  });

  it("حالة 4: أمان التوكنات — لا يتم تسريب توكنات اللاعبين للآخرين", async () => {
    const hub = new LoopbackHub();
    const host = new HostSession(hub.getHostTransport(), {
      variant: "BO4",
      roomCode: "ROOM4",
      hostSeat: 0,
    });

    const c1 = hub.createClientTransport("secret_token_1");
    const c2 = hub.createClientTransport("secret_token_2");

    const c2Packets: HostPacket[] = [];
    c2.onMessage((p) => c2Packets.push(p));

    c1.send({
      v: 1,
      seq: 1,
      playerToken: "secret_token_1",
      type: "JOIN",
      payload: { playerName: "لاعب 1", roomCode: "ROOM4" },
    } as any);
    await step();

    c2.send({
      v: 1,
      seq: 1,
      playerToken: "secret_token_2",
      type: "JOIN",
      payload: { playerName: "لاعب 2", roomCode: "ROOM4" },
    } as any);
    await step();

    // فحص حزم SEAT_UPDATE الواردة لـ c2
    const seatUpdates = c2Packets.filter((p) => p.type === "SEAT_UPDATE");
    expect(seatUpdates.length).toBeGreaterThan(0);

    for (const su of seatUpdates) {
      const payload = su.payload as any;
      expect(payload.player.playerToken).toBeUndefined();
      for (const p of payload.players) {
        expect(p.playerToken).toBeUndefined();
      }
    }

    // فحص تصفية الحالة عبر filterStateForSeat
    const rawState = host.state;
    const filteredState = filterStateForSeat(rawState, 2); // لمقعد c2
    expect(filteredState.players![1].playerToken).toBeUndefined(); // توكن c1 محجوب تماماً عن c2

    host.destroy();
  });
});
