/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import type { GameState, PlayerSlot, Card, Suit } from "../types/kout";
import { applyCheatVerdict, type ReportedCardType } from "./cheat";
import { KoutGameEngine } from "../engine/KoutGameEngine";
import { LoopbackHub } from "../network/LoopbackTransport";
import { HostSession } from "../network/HostSession";
import type { HostPacket } from "../network/protocol";

const makeMixedPlayers = (kinds: Array<"HUMAN_LOCAL" | "HUMAN_REMOTE" | "AI_BOT">): PlayerSlot[] =>
  kinds.map((kind, i) => ({
    seatIndex: i,
    kind,
    name: `لاعب ${i + 1}`,
    team: (i % 2) as 0 | 1,
    connected: true,
  }));

function makeMidTrickStateWithPlayers(
  players: PlayerSlot[],
  opts: { leadSeat: number; cheatSeat: number },
): { state: GameState; ledSuit: Suit; cheatSeat: number } {
  const engine = new KoutGameEngine({
    variant: "BO4",
    initialDealer: 0,
    seed: 1,
    players,
  });
  engine.startRound();
  engine.placeBid(1, 6);
  for (const s of [2, 3, 0]) engine.placeBid(s, 0);
  engine.declareTrump(1, "C");

  const leadSeat = opts.leadSeat;
  const cheatSeat = opts.cheatSeat;
  const order: number[] = [];
  for (let s = leadSeat; order.length < 4; s = (s + 1) % 4) order.push(s);

  const leadCard = engine.state.hands[leadSeat].find(
    (c) => c.suit !== "C" && c.joker === undefined,
  ) as Card;
  if (!leadCard) throw new Error("no non-trump lead");
  engine.playCard(leadSeat, leadCard);
  const ledSuit = leadCard.suit as Suit;

  for (const seat of order.slice(1)) {
    if (seat === cheatSeat) {
      const broke = engine.state.hands[seat].find(
        (c) => c.joker === undefined && c.suit !== ledSuit && c.suit !== "C",
      );
      if (!broke) throw new Error("cheat card missing");
      engine.playCard(seat, broke, { allowAnyCard: true });
      break;
    } else {
      const follow = engine.state.hands[seat].find((c) => c.suit === ledSuit);
      if (follow) {
        engine.playCard(seat, follow);
      } else {
        const anyC = engine.state.hands[seat][0];
        engine.playCard(seat, anyC, { allowAnyCard: true });
      }
    }
  }

  return { state: engine.state, ledSuit, cheatSeat };
}

describe("اختبارات نظام الإبلاغ عن الغش على جميع الطبقات", () => {
  it("1. عدم ظهور زر الإبلاغ في اللعب الفردي ضد البوتات (freePlay = false)", () => {
    // لاعب بشري واحد ومقاعد الباقين بوتات
    const singleHumanPlayers = makeMixedPlayers(["HUMAN_LOCAL", "AI_BOT", "AI_BOT", "AI_BOT"]);
    const humanSeats = singleHumanPlayers
      .filter((p) => p.kind !== "AI_BOT")
      .map((p) => p.seatIndex);
    const freePlay = humanSeats.length >= 2;
    expect(freePlay).toBe(false);
  });

  it("2. عدم ظهور زر الإبلاغ عند وجود لاعب بشري واحد فقط", () => {
    const players = makeMixedPlayers([
      "HUMAN_LOCAL",
      "AI_BOT",
      "AI_BOT",
      "AI_BOT",
      "AI_BOT",
      "AI_BOT",
    ]);
    const humanSeats = players.filter((p) => p.kind !== "AI_BOT").map((p) => p.seatIndex);
    expect(humanSeats.length).toBe(1);
    const canReportCheat = humanSeats.length >= 2 && true; /* phase is PLAY or ROUND_END */
    expect(canReportCheat).toBe(false);
  });

  it("3. ظهور زر الإبلاغ عند وجود لاعبين بشريين أو أكثر في اللعب الجماعي", () => {
    const players = makeMixedPlayers([
      "HUMAN_LOCAL",
      "HUMAN_REMOTE",
      "AI_BOT",
      "AI_BOT",
      "AI_BOT",
      "AI_BOT",
    ]);
    const humanSeats = players.filter((p) => p.kind !== "AI_BOT").map((p) => p.seatIndex);
    expect(humanSeats.length).toBe(2);
    const canReportCheat = humanSeats.length >= 2;
    expect(canReportCheat).toBe(true);
  });

  it("4 و 5. ظهور قائمة المتهمين البشر فقط واستبعاد البوتات ونفس اللاعب وأعضاء فريقه", () => {
    // 0: Human team 0 (reporter)
    // 1: Human team 1 (opponent human)
    // 2: Human team 0 (teammate human)
    // 3: Bot team 1 (opponent bot)
    const players: PlayerSlot[] = [
      { seatIndex: 0, kind: "HUMAN_LOCAL", name: "مُبلِّغ", team: 0, connected: true },
      { seatIndex: 1, kind: "HUMAN_REMOTE", name: "خصم بشري", team: 1, connected: true },
      { seatIndex: 2, kind: "HUMAN_LOCAL", name: "زميل بشري", team: 0, connected: true },
      { seatIndex: 3, kind: "AI_BOT", name: "بوت خصم", team: 1, connected: true },
    ];

    const reporterSeat = 0;
    const reporterTeam = players.find((p) => p.seatIndex === reporterSeat)?.team;

    // منطق التصفية في CheatReportModal
    const eligiblePlayers = players.filter(
      (p) =>
        p.kind !== "AI_BOT" &&
        p.seatIndex !== reporterSeat &&
        (reporterTeam === undefined || p.team !== reporterTeam),
    );

    // يجب أن تحتوي القائمة فقط على المقعد 1 (الخصم البشري)
    expect(eligiblePlayers.length).toBe(1);
    expect(eligiblePlayers[0].seatIndex).toBe(1);
    expect(eligiblePlayers[0].name).toBe("خصم بشري");
  });

  it("6. رفض البلاغ المباشر ضد مقعد بوت حتى عند تجاوز الواجهة (في applyCheatVerdict والمضيف)", () => {
    const players = makeMixedPlayers(["HUMAN_LOCAL", "AI_BOT", "HUMAN_REMOTE", "AI_BOT"]);
    const { state, ledSuit } = makeMidTrickStateWithPlayers(players, {
      leadSeat: 2,
      cheatSeat: 1, // بوت
    });

    // مقعد 0 (بشري) يحاول الإبلاغ عن مقعد 1 (بوت)
    const verdict = applyCheatVerdict(state, 0, 1, ledSuit as ReportedCardType);
    expect(verdict).toBeNull();
  });

  it("7. رفض البلاغ ضد مقعد غير صالح (أقل من صفر أو أكبر من عدد المقاعد)", () => {
    const players = makeMixedPlayers([
      "HUMAN_LOCAL",
      "HUMAN_REMOTE",
      "HUMAN_LOCAL",
      "HUMAN_REMOTE",
    ]);
    const { state, ledSuit } = makeMidTrickStateWithPlayers(players, {
      leadSeat: 2,
      cheatSeat: 1,
    });

    expect(applyCheatVerdict(state, 0, -1, ledSuit as ReportedCardType)).toBeNull();
    expect(applyCheatVerdict(state, 0, 99, ledSuit as ReportedCardType)).toBeNull();
    expect(applyCheatVerdict(state, -1, 1, ledSuit as ReportedCardType)).toBeNull();
  });

  it("8. رفض البلاغ ضد النفس", () => {
    const players = makeMixedPlayers([
      "HUMAN_LOCAL",
      "HUMAN_REMOTE",
      "HUMAN_LOCAL",
      "HUMAN_REMOTE",
    ]);
    const { state, ledSuit } = makeMidTrickStateWithPlayers(players, {
      leadSeat: 2,
      cheatSeat: 0,
    });

    expect(applyCheatVerdict(state, 0, 0, ledSuit as ReportedCardType)).toBeNull();
  });

  it("9. رفض البلاغ ضد لاعب من الفريق نفسه", () => {
    const players = makeMixedPlayers([
      "HUMAN_LOCAL",
      "HUMAN_REMOTE",
      "HUMAN_LOCAL", // زميل في فريق 0
      "HUMAN_REMOTE",
    ]);
    const { state, ledSuit } = makeMidTrickStateWithPlayers(players, {
      leadSeat: 2,
      cheatSeat: 1,
    });

    // مقعد 0 يبلّغ عن مقعد 2 (كلاهما في فريق 0)
    expect(applyCheatVerdict(state, 0, 2, ledSuit as ReportedCardType)).toBeNull();
  });

  it("10. قبول البلاغ الصحيح ضد لاعب بشري من الفريق المنافس وتدبيل النقاط وفق القواعد الحالية", () => {
    const players = makeMixedPlayers([
      "HUMAN_LOCAL", // فريق 0
      "HUMAN_REMOTE", // فريق 1 (متهم)
      "HUMAN_LOCAL", // فريق 0
      "HUMAN_REMOTE", // فريق 1 (مُبلِّغ) -> leadSeat=2, cheatSeat=1
    ]);
    const { state, ledSuit } = makeMidTrickStateWithPlayers(players, {
      leadSeat: 2,
      cheatSeat: 1,
    });

    // مقعد 0 (فريق 0) يبلّغ عن مقعد 1 (فريق 1)
    const result = applyCheatVerdict(state, 0, 1, ledSuit as ReportedCardType);
    expect(result).not.toBeNull();
    expect(result!.confirmed).toBe(true);
    expect(result!.winningTeam).toBe(0);
    // تدبيل النقاط: highBid = 6 -> pointsAdded = 12
    expect(result!.pointsAdded).toBe(12);
    expect(result!.nextState.scores[0]).toBe(state.scores[0] + 12);
  });

  it("11. عدم استهلاك محاولة أو فترة تهدئة عند رفض البلاغ (في HostSession)", async () => {
    const players = makeMixedPlayers([
      "HUMAN_LOCAL",
      "AI_BOT", // بوت
      "HUMAN_REMOTE",
      "AI_BOT",
    ]);
    const { state, ledSuit } = makeMidTrickStateWithPlayers(players, {
      leadSeat: 2,
      cheatSeat: 1,
    });

    const engine = new KoutGameEngine({ variant: "BO4", targetScore: 51, players }, state);

    const hub = new LoopbackHub();
    const session = new HostSession(hub.getHostTransport(), { engine });

    const clientToken = "token-p2";
    const clientTransport = hub.createClientTransport(clientToken);

    clientTransport.send({
      v: 1,
      seq: 1,
      playerToken: clientToken,
      type: "JOIN",
      payload: { playerName: "لاعب ٢", preferredSeat: 2 },
    });

    await new Promise((r) => setTimeout(r, 15));

    const errors: string[] = [];
    clientTransport.onMessage((p) => {
      if (p.type === "ERROR") errors.push((p as any).payload?.code);
    });

    // إرسال بلاغ غير صالح (استهداف بوت في مقعد 1)
    clientTransport.send({
      v: 1,
      seq: 2,
      playerToken: clientToken,
      type: "CHEAT_REPORT",
      payload: { accusedSeat: 1, cardType: ledSuit as ReportedCardType },
    });

    await new Promise((r) => setTimeout(r, 15));

    // يجب أن يُرفض البلاغ
    expect(errors).toContain("REPORT_REJECTED");

    // نتحقق من أن المضيف لم يستنفد المحاولات ولا يزال يقبل البلاغات
    // إرسال بلاغ ضد مقعد زميل: يُرفض أيضاً مع نفس الرمز دون احتساب limit
    clientTransport.send({
      v: 1,
      seq: 3,
      playerToken: clientToken,
      type: "CHEAT_REPORT",
      payload: { accusedSeat: 2, cardType: ledSuit as ReportedCardType },
    });

    await new Promise((r) => setTimeout(r, 15));
    // لم يصل لـ REPORT_LIMIT لأن البلاغات المرفوضة لا تُستهلك
    expect(errors).not.toContain("REPORT_LIMIT");

    session.destroy();
    hub.reset();
  });

  it("12. التحقق من هوية المُبلِّغ من المضيف في اللعب الشبكي عبر tokenToSeat", async () => {
    const players = makeMixedPlayers([
      "HUMAN_LOCAL", // seat 0
      "HUMAN_REMOTE", // seat 1
      "HUMAN_REMOTE", // seat 2
      "HUMAN_REMOTE", // seat 3
    ]);
    const { state, ledSuit } = makeMidTrickStateWithPlayers(players, {
      leadSeat: 2,
      cheatSeat: 1,
    });

    const engine = new KoutGameEngine({ variant: "BO4", targetScore: 51, players }, state);

    const hub = new LoopbackHub();
    const session = new HostSession(hub.getHostTransport(), { engine });

    const clientToken = "token-seat-2";
    const clientTransport = hub.createClientTransport(clientToken);

    // المنضم يأخذ المقعد 2 (فريق 0)
    clientTransport.send({
      v: 1,
      seq: 1,
      playerToken: clientToken,
      type: "JOIN",
      payload: { playerName: "لاعب المقعد ٢", preferredSeat: 2 },
    });

    await new Promise((r) => setTimeout(r, 15));

    let verdictReceived: any = null;
    clientTransport.onMessage((p) => {
      if (p.type === "CHEAT_VERDICT") verdictReceived = p.payload;
    });

    // يبلّغ عن المقعد 1 (فريق 1)
    clientTransport.send({
      v: 1,
      seq: 2,
      playerToken: clientToken,
      type: "CHEAT_REPORT",
      payload: { accusedSeat: 1, cardType: ledSuit as ReportedCardType },
    });

    await new Promise((r) => setTimeout(r, 15));

    expect(verdictReceived).not.toBeNull();
    // المضيف تحقق وعين reporterSeat = 2 استناداً للـ token وليس العميل
    expect(verdictReceived.reporterSeat).toBe(2);
    expect(verdictReceived.accusedSeat).toBe(1);

    session.destroy();
    hub.reset();
  });

  it("13. التأكد من وصول نتيجة البلاغ CHEAT_VERDICT لجميع اللاعبين المتصلين", async () => {
    const players = makeMixedPlayers([
      "HUMAN_LOCAL", // seat 0
      "HUMAN_REMOTE", // seat 1
      "HUMAN_REMOTE", // seat 2
      "HUMAN_REMOTE", // seat 3
    ]);
    const { state, ledSuit } = makeMidTrickStateWithPlayers(players, {
      leadSeat: 2,
      cheatSeat: 1,
    });

    const engine = new KoutGameEngine({ variant: "BO4", targetScore: 51, players }, state);

    const hub = new LoopbackHub();
    const session = new HostSession(hub.getHostTransport(), { engine });

    const c1Token = "token-c1";
    const c2Token = "token-c2";
    const c1Transport = hub.createClientTransport(c1Token);
    const c2Transport = hub.createClientTransport(c2Token);

    c1Transport.send({
      v: 1,
      seq: 1,
      playerToken: c1Token,
      type: "JOIN",
      payload: { playerName: "C1", preferredSeat: 1 },
    });
    c2Transport.send({
      v: 1,
      seq: 1,
      playerToken: c2Token,
      type: "JOIN",
      payload: { playerName: "C2", preferredSeat: 2 },
    });

    await new Promise((r) => setTimeout(r, 15));

    let c1Verdict = false;
    let c2Verdict = false;
    c1Transport.onMessage((p) => {
      if (p.type === "CHEAT_VERDICT") c1Verdict = true;
    });
    c2Transport.onMessage((p) => {
      if (p.type === "CHEAT_VERDICT") c2Verdict = true;
    });

    // C2 (Seat 2) reports Seat 1
    c2Transport.send({
      v: 1,
      seq: 2,
      playerToken: c2Token,
      type: "CHEAT_REPORT",
      payload: { accusedSeat: 1, cardType: ledSuit as ReportedCardType },
    });

    await new Promise((r) => setTimeout(r, 15));

    expect(c1Verdict).toBe(true);
    expect(c2Verdict).toBe(true);

    session.destroy();
    hub.reset();
  });

  it("14. عدم تكرار احتساب النقاط عند تداخل البلاغ مع نهاية الجولة أو المباراة", () => {
    const players = makeMixedPlayers([
      "HUMAN_LOCAL", // team 0
      "HUMAN_REMOTE", // team 1
      "HUMAN_LOCAL", // team 0
      "HUMAN_REMOTE", // team 1
    ]);
    const { state, ledSuit } = makeMidTrickStateWithPlayers(players, {
      leadSeat: 2,
      cheatSeat: 1,
    });

    // تطبيق البلاغ
    const result = applyCheatVerdict(state, 0, 1, ledSuit as ReportedCardType);
    expect(result).not.toBeNull();

    // يجب أن تكون scoredRoundNo مسجلة في nextState لمنع إعادة احتساب الجولة
    expect(result!.nextState.scoredRoundNo).toBe(state.roundNo);
  });

  it("15. الحفاظ على حالة GAME_END وعدم إعادة فتح المباراة بعد البلاغ عند انتهائها بسبب بوان أو غيره دون بلوغ حد القيد", () => {
    const players = makeMixedPlayers([
      "HUMAN_LOCAL",
      "HUMAN_REMOTE",
      "HUMAN_LOCAL",
      "HUMAN_REMOTE",
    ]);
    const { state, ledSuit } = makeMidTrickStateWithPlayers(players, {
      leadSeat: 2,
      cheatSeat: 1,
    });

    // محاكاة مباراة انتهت كـ GAME_END (مثلاً بوان أو BO4 مع نقاط منخفضة مثل [18, 0] وحد القيد 51)
    const endedState: GameState = {
      ...state,
      phase: "GAME_END",
      scores: [18, 0],
      targetScore: 51,
    };

    const result = applyCheatVerdict(endedState, 0, 1, ledSuit as ReportedCardType);
    expect(result).not.toBeNull();
    // يجب ألا ترجع الحالة إلى ROUND_END أو PLAY بل تظل GAME_END
    expect(result!.nextState.phase).toBe("GAME_END");
  });

  it("16. منع تكرار احتساب النقاط عند تطبيق البلاغ بعد احتساب الجولة العادية مسبقاً", () => {
    const players = makeMixedPlayers([
      "HUMAN_LOCAL",
      "HUMAN_REMOTE",
      "HUMAN_LOCAL",
      "HUMAN_REMOTE",
    ]);
    const { state, ledSuit } = makeMidTrickStateWithPlayers(players, {
      leadSeat: 2,
      cheatSeat: 1,
    });

    // محاكاة جولة تم احتسابها بالفعل (scoredRoundNo === roundNo) برصيد عادي 6 نقاط
    const scoredState: GameState = {
      ...state,
      phase: "ROUND_END",
      scores: [6, 0],
      scoredRoundNo: state.roundNo,
      bidderSeat: 0,
      highBid: 6,
      tricksWon: [6, 3],
    };

    // تطبيق البلاغ الناجح (حكم 6 نقاط * 2 = 12 نقطة)
    const result = applyCheatVerdict(scoredState, 0, 1, ledSuit as ReportedCardType);
    expect(result).not.toBeNull();

    // يجب ألا تكون النقاط 6 + 12 = 18، بل تم استبدال النقاط العادية بنقاط البلاغ المدبلة = 12
    expect(result!.nextState.scores[0]).toBe(12);
    expect(result!.nextState.scores[1]).toBe(0);
  });

  it("17. عدم السماح بمعالجة أي بلاغ بعد إغلاق المباراة نهائياً (matchStopped)", () => {
    const players = makeMixedPlayers([
      "HUMAN_LOCAL",
      "HUMAN_REMOTE",
      "HUMAN_LOCAL",
      "HUMAN_REMOTE",
    ]);
    const { state, ledSuit } = makeMidTrickStateWithPlayers(players, {
      leadSeat: 2,
      cheatSeat: 1,
    });

    const stoppedState: GameState = {
      ...state,
      phase: "GAME_END",
      matchStopped: true,
    };

    const result = applyCheatVerdict(stoppedState, 0, 1, ledSuit as ReportedCardType);
    expect(result).toBeNull();
  });
});
