/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import { KoutGameEngine } from "./KoutGameEngine";
import { isSingleHumanVsBots } from "./KoutTricks";
import { scoreRound } from "./KoutScoring";
import type { PlayerSlot, Card } from "../types/kout";

const makeSingleHumanPlayers = (totalSeats = 6): PlayerSlot[] =>
  Array.from({ length: totalSeats }, (_, i) => ({
    seatIndex: i,
    kind: i === 0 ? "HUMAN_LOCAL" : "AI_BOT",
    name: i === 0 ? "أنت (بشري)" : `بوت ${i + 1}`,
    team: (i % 2) as 0 | 1,
    connected: true,
  }));

const makeMultiplayerPlayers = (humanCount = 2, totalSeats = 6): PlayerSlot[] =>
  Array.from({ length: totalSeats }, (_, i) => ({
    seatIndex: i,
    kind: i < humanCount ? "HUMAN_REMOTE" : "AI_BOT",
    name: i < humanCount ? `بشري ${i + 1}` : `بوت ${i + 1}`,
    team: (i % 2) as 0 | 1,
    connected: true,
  }));

describe("نظام الحسم المبكر عند تحقيق طلب الحاكم (اللعب الفردي ضد البوتات)", () => {
  it("1. التحقق من كاشف اللعب الفردي ضد البوتات isSingleHumanVsBots", () => {
    // لاعب بشري واحد والبقية بوتات -> true
    expect(isSingleHumanVsBots({ players: makeSingleHumanPlayers(6) })).toBe(true);
    expect(isSingleHumanVsBots({ players: makeSingleHumanPlayers(4) })).toBe(true);

    // لاعبان بشريان والبقية بوتات -> false
    expect(isSingleHumanVsBots({ players: makeMultiplayerPlayers(2, 6) })).toBe(false);

    // جميع اللاعبين بشر -> false
    expect(isSingleHumanVsBots({ players: makeMultiplayerPlayers(6, 6) })).toBe(false);

    // لا يوجد مقاعد -> false
    expect(isSingleHumanVsBots({ players: [] })).toBe(false);
  });

  it("2. الحسم المبكر للجولة عند تحقيق الحاكم طلب 6 أكلات مع بقاء 3 بطاقات لم تُلعب", () => {
    // إعداد محرك بمقعد بشري واحد وبقية المقاعد بوتات
    const players = makeSingleHumanPlayers(6);
    const engine = new KoutGameEngine({
      variant: "BO6",
      targetScore: 51,
      players,
      initialDealer: 0,
      seed: 42,
    });

    engine.startRound();
    // المقعد 0 (بشري، فريق 0) يطلب 6 أكلات
    engine.placeBid(1, 0);
    engine.placeBid(2, 0);
    engine.placeBid(3, 0);
    engine.placeBid(4, 0);
    engine.placeBid(5, 0);
    engine.placeBid(0, 6); // highBid = 6, bidder = seat 0 (team 0)

    engine.declareTrump(0, "H");
    expect(engine.state.phase).toBe("PLAY");
    expect(engine.state.highBid).toBe(6);
    expect(engine.state.bidderSeat).toBe(0);

    // محاكاة لعب 5 أكلات كاملة فاز بها فريق 0 (كل لاعب ينزل بطاقة من يده)
    // لتسهيل المحاكاة الدقيقة: سنلعب الأكلات تباعاً
    for (let trickIndex = 0; trickIndex < 5; trickIndex++) {
      const leadSeat = engine.state.currentSeat;
      for (let step = 0; step < 6; step++) {
        const seat = (leadSeat + step) % 6;
        const hand = engine.state.hands[seat];
        const cardToPlay = hand[0];
        engine.playCard(seat, cardToPlay, { allowAnyCard: true });
      }
    }

    // الآن لُعبت 5 أكلات، وتبقت 4 أكلات (أي 4 بطاقات في يد كل لاعب)
    expect(engine.state.trickHistory.length).toBe(5);
    expect(engine.state.hands[0].length).toBe(4);
    expect(engine.state.phase).toBe("PLAY");

    // نعدّل رصيد أكلات فريق 0 ليكون 5 أكلات
    // ونلعب الأكلة السادسة التي ستحقق الطلب (6 أكلات من أصل 6 مطلوبة)
    (engine.state.tricksWon as [number, number])[0] = 5;
    (engine.state.tricksWon as [number, number])[1] = 0;

    const leadSeat6 = engine.state.currentSeat;
    for (let step = 0; step < 6; step++) {
      const seat = (leadSeat6 + step) % 6;
      // نضمن فوز مقعد من فريق 0 (مثلاً مقعد 0) بوضع ورقة قوية له
      const hand = engine.state.hands[seat];
      let card = hand[0];
      if (seat === 0) {
        // جوكر أو ورقة حكم قوية لضمان الفوز بالأكلة
        card = { id: "H-A", suit: "H", rank: 14 };
        hand[0] = card;
      } else {
        card = { id: `D-${step}`, suit: "D", rank: 2 };
        hand[0] = card;
      }
      engine.playCard(seat, card, { allowAnyCard: true });
    }

    // بعد تسجيل الأكلة السادسة:
    // فريق الحاكم حقق طلبه (6 أكلات)، وهناك 3 بطاقات متبقية في يد كل لاعب (لُعبت 6 من أصل 9)
    expect(engine.state.tricksWon[0]).toBe(6);
    expect(engine.state.trickHistory.length).toBe(6);
    expect(engine.state.hands[0].length).toBe(3); // 3 بطاقات متبقية لم تلعب!

    // الحسم المبكر يجب أن ينهي الجولة فوراً!
    expect(engine.state.phase).toBe("ROUND_END");
    expect(engine.state.earlyResolved).toBe(true);

    // احتساب نقاط الجولة: الحاكم حقق طلب 6 -> يضاف 6 نقاط لفريقه
    expect(engine.state.scores[0]).toBe(6);
    expect(engine.state.scores[1]).toBe(0);
    expect(engine.state.scoredRoundNo).toBe(1);
  });

  it("3. عدم تفعيل الحسم المبكر في اللعب الجماعي (وجود لاعبين بشريين أو أكثر)", () => {
    // إعداد مباراة جماعية بها لاعبان بشريان
    const players = makeMultiplayerPlayers(2, 6);
    const engine = new KoutGameEngine({
      variant: "BO6",
      targetScore: 51,
      players,
      initialDealer: 0,
      seed: 123,
    });

    engine.startRound();
    engine.placeBid(1, 0);
    engine.placeBid(2, 0);
    engine.placeBid(3, 0);
    engine.placeBid(4, 0);
    engine.placeBid(5, 0);
    engine.placeBid(0, 6);
    engine.declareTrump(0, "S");

    // لعب 5 أكلات
    for (let trickIndex = 0; trickIndex < 5; trickIndex++) {
      const leadSeat = engine.state.currentSeat;
      for (let step = 0; step < 6; step++) {
        const seat = (leadSeat + step) % 6;
        const hand = engine.state.hands[seat];
        engine.playCard(seat, hand[0], { allowAnyCard: true });
      }
    }

    (engine.state.tricksWon as [number, number])[0] = 5;
    (engine.state.tricksWon as [number, number])[1] = 0;

    // لعب الأكلة السادسة وفوز فريق 0 بها
    const leadSeat6 = engine.state.currentSeat;
    for (let step = 0; step < 6; step++) {
      const seat = (leadSeat6 + step) % 6;
      const hand = engine.state.hands[seat];
      let card: Card = hand[0];
      if (seat === 0) {
        card = { id: "S-A", suit: "S", rank: 14 };
        hand[0] = card;
      } else {
        card = { id: `C-${step}`, suit: "C", rank: 2 };
        hand[0] = card;
      }
      engine.playCard(seat, card, { allowAnyCard: true });
    }

    // لأن هناك لاعبين بشريين، لا يجوز الحسم المبكر!
    // يجب أن تستمر الجولة في طور PLAY لإكمال بقية الأكلات
    expect(engine.state.tricksWon[0]).toBe(6);
    expect(engine.state.trickHistory.length).toBe(6);
    expect(engine.state.phase).toBe("PLAY");
    expect(engine.state.earlyResolved).toBeFalsy();
  });

  it("4. التأكد من عدم احتساب الجولة مرتين عند الحسم المبكر", () => {
    const players = makeSingleHumanPlayers(6);
    const engine = new KoutGameEngine({
      variant: "BO6",
      targetScore: 51,
      players,
      initialDealer: 0,
      seed: 999,
    });

    engine.startRound();
    engine.placeBid(1, 0);
    engine.placeBid(2, 0);
    engine.placeBid(3, 0);
    engine.placeBid(4, 0);
    engine.placeBid(5, 0);
    engine.placeBid(0, 6);
    engine.declareTrump(0, "D");

    // لعب أكلة مع ضبط الأكلات السابقة لتصل إلى 6
    (engine.state.tricksWon as [number, number])[0] = 5;
    const lead = engine.state.currentSeat;
    for (let step = 0; step < 6; step++) {
      const s = (lead + step) % 6;
      const card: Card =
        s === 0 ? { id: "D-A", suit: "D", rank: 14 } : { id: `C-${step}`, suit: "C", rank: 3 };
      engine.state.hands[s][0] = card;
      engine.playCard(s, card, { allowAnyCard: true });
    }

    expect(engine.state.phase).toBe("ROUND_END");
    expect(engine.state.scores[0]).toBe(6);

    // محاولة استدعاء scoreRound مرة أخرى يجب ألا تضيف أي نقاط
    const stateAfterSecondScore = scoreRound(engine.state);
    expect(stateAfterSecondScore.scores[0]).toBe(6);
    expect(stateAfterSecondScore.scores[1]).toBe(0);
  });

  it("5. الانتقال للجولة التالية يحافظ على النقاط المتراكمة ويصفر أكلات الجولة الجديدة فقط", () => {
    const players = makeSingleHumanPlayers(6);
    const engine = new KoutGameEngine({
      variant: "BO6",
      targetScore: 51,
      players,
      initialDealer: 0,
      seed: 777,
    });

    engine.startRound();
    engine.placeBid(1, 0);
    engine.placeBid(2, 0);
    engine.placeBid(3, 0);
    engine.placeBid(4, 0);
    engine.placeBid(5, 0);
    engine.placeBid(0, 6);
    engine.declareTrump(0, "H");

    (engine.state.tricksWon as [number, number])[0] = 5;
    const lead = engine.state.currentSeat;
    for (let step = 0; step < 6; step++) {
      const s = (lead + step) % 6;
      const card: Card =
        s === 0 ? { id: "H-A", suit: "H", rank: 14 } : { id: `S-${step}`, suit: "S", rank: 2 };
      engine.state.hands[s][0] = card;
      engine.playCard(s, card, { allowAnyCard: true });
    }

    expect(engine.state.earlyResolved).toBe(true);
    expect(engine.state.scores[0]).toBe(6);

    // بدء الجولة التالية
    const round2 = engine.startRound();
    expect(round2.roundNo).toBe(2);
    expect(round2.phase).toBe("BID");
    // النقاط يجب أن تبقى 6 وليست 0
    expect(round2.scores).toEqual([6, 0]);
    expect(round2.tricksWon).toEqual([0, 0]);
    expect(round2.earlyResolved).toBeUndefined();
    expect(round2.matchStopped).toBeFalsy();
  });

  it("6. التأكد من توقف أي لعب آلي للبوتات فور حدوث الحسم المبكر", () => {
    const players = makeSingleHumanPlayers(6);
    const engine = new KoutGameEngine({
      variant: "BO6",
      targetScore: 51,
      players,
      initialDealer: 0,
      seed: 555,
    });

    engine.startRound();
    engine.placeBid(1, 0);
    engine.placeBid(2, 0);
    engine.placeBid(3, 0);
    engine.placeBid(4, 0);
    engine.placeBid(5, 0);
    engine.placeBid(0, 6);
    engine.declareTrump(0, "C");

    (engine.state.tricksWon as [number, number])[0] = 5;
    const lead = engine.state.currentSeat;
    for (let step = 0; step < 6; step++) {
      const s = (lead + step) % 6;
      const card: Card =
        s === 0 ? { id: "C-A", suit: "C", rank: 14 } : { id: `H-${step}`, suit: "H", rank: 2 };
      engine.state.hands[s][0] = card;
      engine.playCard(s, card, { allowAnyCard: true });
    }

    // بمجرد أن أصبحت الحالة ROUND_END، فإن محاولة أي بوت للعب ورقة تثير خطأ
    expect(engine.state.phase).toBe("ROUND_END");
    expect(() => {
      engine.playCard(1, engine.state.hands[1][0]);
    }).toThrow(/Cannot play card during phase ROUND_END/);
  });
});
