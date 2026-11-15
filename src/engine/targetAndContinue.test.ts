/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import { KoutGameEngine } from "./KoutGameEngine";
import { scoreRound } from "./KoutScoring";
import {
  koutWinnerTeam,
  koutLoserTeam,
  canDecideContinue,
} from "./matchContinue";
import type { GameState, PlayerSlot } from "../types/kout";
import { LoopbackHub } from "../network/LoopbackTransport";
import { HostSession } from "../network/HostSession";
import type { ClientPacket, HostPacket } from "../network/protocol";

const makePlayers = (humanCount: number, totalSeats = 6): PlayerSlot[] =>
  Array.from({ length: totalSeats }, (_, i) => ({
    seatIndex: i,
    kind: i < humanCount ? ("HUMAN_LOCAL" as const) : ("AI_BOT" as const),
    name: i < humanCount ? `بشري ${i + 1}` : `بوت ${i + 1}`,
    team: (i % 2) as 0 | 1,
    connected: true,
  }));

const baseGameState = (scores: [number, number], target = 51): GameState => ({
  variant: "BO6",
  hands: [[], [], [], [], [], []],
  dealer: 0,
  currentSeat: 1,
  bids: [],
  highBid: 6,
  bidderSeat: 1, // Team 1
  trump: "H",
  currentTrick: [],
  trickHistory: [],
  tricksWon: [3, 6], // Team 1 won 6 tricks
  scores,
  phase: "ROUND_END",
  roundNo: 1,
  targetScore: target,
  version: 1,
  players: makePlayers(2),
  scoredRoundNo: 0,
});

describe("اختبارات حد القيد ونهاية المباراة والاستمرار", () => {
  it("1. وصول الفريق الأول (Team 0) إلى حد القيد ينقل اللعبة إلى GAME_END", () => {
    const state: GameState = {
      ...baseGameState([45, 20]),
      bidderSeat: 0, // Team 0
      highBid: 6,
      tricksWon: [6, 3], // Team 0 achieves bid -> gets 6 points -> 45+6=51
    };
    const scored = scoreRound(state);
    expect(scored.scores[0]).toBe(51);
    expect(scored.scores[1]).toBe(20);
    expect(scored.phase).toBe("GAME_END");
    expect(koutWinnerTeam(scored)).toBe(0);
    expect(koutLoserTeam(scored)).toBe(1);
  });

  it("2. وصول الفريق الثاني (Team 1) إلى حد القيد ينقل اللعبة إلى GAME_END", () => {
    const state: GameState = {
      ...baseGameState([20, 45]),
      bidderSeat: 1, // Team 1
      highBid: 6,
      tricksWon: [3, 6], // Team 1 achieves bid -> gets 6 points -> 45+6=51
    };
    const scored = scoreRound(state);
    expect(scored.scores[1]).toBe(51);
    expect(scored.scores[0]).toBe(20);
    expect(scored.phase).toBe("GAME_END");
    expect(koutWinnerTeam(scored)).toBe(1);
    expect(koutLoserTeam(scored)).toBe(0);
  });

  it("3. نجاح الحكم في تحقيق طلبه يمنحه نقاط طلبه كاملة", () => {
    const state: GameState = {
      ...baseGameState([10, 10]),
      bidderSeat: 0,
      highBid: 7,
      tricksWon: [7, 2],
    };
    const scored = scoreRound(state);
    expect(scored.scores[0]).toBe(17);
    expect(scored.scores[1]).toBe(10);
    expect(scored.phase).toBe("ROUND_END");
  });

  it("4. فشل الحكم وحصول الفريق الآخر على نقاط الفوز", () => {
    const state: GameState = {
      ...baseGameState([10, 10]),
      bidderSeat: 0, // Team 0 asked for 7
      highBid: 7,
      tricksWon: [6, 3], // Team 0 got only 6 tricks (failed!)
    };
    const scored = scoreRound(state);
    // Team 1 gets the 7 points
    expect(scored.scores[0]).toBe(10);
    expect(scored.scores[1]).toBe(24);
  });

  it("5. اختيار الاستمرار مع الاحتفاظ بالنقاط السابقة: يبدأ جولة جديدة ويحافظ على الرصيد وحد القيد", () => {
    const state: GameState = {
      ...baseGameState([52, 24]),
      phase: "GAME_END",
    };
    const engine = new KoutGameEngine(
      { variant: "BO6", targetScore: 51, players: state.players },
      state,
    );

    // Verify initial GAME_END scores
    expect(engine.state.scores).toEqual([52, 24]);
    expect(engine.state.phase).toBe("GAME_END");

    // Start next round (simulating continue decision = true)
    const nextState = engine.startRound();

    // Scores MUST be strictly preserved!
    expect(nextState.scores).toEqual([52, 24]);
    expect(nextState.targetScore).toBe(51);
    expect(nextState.roundNo).toBe(2);
    expect(nextState.phase).toBe("BID");
    expect(nextState.tricksWon).toEqual([0, 0]);
    expect(nextState.matchStopped).toBeFalsy();
    // Hands are dealt
    expect(nextState.hands[0].length).toBe(9);
  });

  it("6. بدء جولة إضافية دون تصفير الرصيد بعد بلوغ القيد واحتساب النقاط الجديدة تراكمياً", () => {
    const state: GameState = {
      ...baseGameState([51, 30]),
      phase: "GAME_END",
    };
    const engine = new KoutGameEngine(
      { variant: "BO6", targetScore: 51, players: state.players },
      state,
    );

    // Continue match
    engine.startRound();
    expect(engine.state.scores).toEqual([51, 30]);

    // Simulate round 2 ending with team 1 gaining 8 points
    const round2State: GameState = {
      ...engine.state,
      phase: "ROUND_END",
      bidderSeat: 1,
      highBid: 8,
      tricksWon: [1, 8],
    };

    const scoredRound2 = scoreRound(round2State);
    // Team 1 score should be 30 + 8 = 38, Team 0 stays 51
    expect(scoredRound2.scores).toEqual([51, 38]);
  });

  it("7. اختيار إنهاء المباراة يثبت النتيجة ويمنع استئناف اللعب", () => {
    const state: GameState = {
      ...baseGameState([54, 30]),
      phase: "GAME_END",
    };
    const humanSeats = [0, 1]; // seat 0 is Team 0 (winner), seat 1 is Team 1 (loser)

    // Loser (seat 1) can decide before stop
    expect(canDecideContinue(state, 1, humanSeats)).toBe(true);
    // Winner (seat 0) cannot decide
    expect(canDecideContinue(state, 0, humanSeats)).toBe(false);

    // Loser decides to stop
    const stoppedState: GameState = {
      ...state,
      matchStopped: true,
      version: state.version + 1,
    };

    // After matchStopped: nobody can decide anymore
    expect(canDecideContinue(stoppedState, 1, humanSeats)).toBe(false);
    expect(canDecideContinue(stoppedState, 0, humanSeats)).toBe(false);
  });

  it("8. التأكد من عدم احتساب الجولة نفسها مرتين (حماية scoredRoundNo)", () => {
    const state: GameState = {
      ...baseGameState([40, 20]),
      bidderSeat: 0,
      highBid: 6,
      tricksWon: [6, 3],
      scoredRoundNo: 0,
    };
    const scoredOnce = scoreRound(state);
    expect(scoredOnce.scores[0]).toBe(46);
    expect(scoredOnce.scoredRoundNo).toBe(state.roundNo);

    // Calling scoreRound again on the same state should return unchanged scores
    const scoredAgain = scoreRound(scoredOnce);
    expect(scoredAgain.scores[0]).toBe(46);
    expect(scoredAgain.scores[1]).toBe(20);
  });

  it("9. التأكد من صحة السلوك في اللعب الشبكي: المضيف يتحقق من أهلية القرار ويرفض قرار الفريق الفائز", async () => {
    const state: GameState = {
      ...baseGameState([55, 30]),
      phase: "GAME_END",
      players: [
        { seatIndex: 0, kind: "HUMAN_LOCAL", name: "Host Team0", team: 0, connected: true },
        { seatIndex: 1, kind: "HUMAN_NETWORK", name: "Client Team1", team: 1, connected: true },
        { seatIndex: 2, kind: "HUMAN_NETWORK", name: "Client Team0", team: 0, connected: true },
        { seatIndex: 3, kind: "AI_BOT", name: "Bot 2", team: 1, connected: true },
        { seatIndex: 4, kind: "AI_BOT", name: "Bot 3", team: 0, connected: true },
        { seatIndex: 5, kind: "AI_BOT", name: "Bot 4", team: 1, connected: true },
      ],
    };
    const engine = new KoutGameEngine(
      { variant: "BO6", targetScore: 51, players: state.players },
      state,
    );

    const hub = new LoopbackHub();
    const session = new HostSession(hub.getHostTransport(), { engine });

    const clientToken = "token-client-team1";
    const clientTransport = hub.createClientTransport(clientToken);

    clientTransport.send({
      v: 1,
      seq: 1,
      playerToken: clientToken,
      type: "JOIN",
      payload: { playerName: "Client Team1", preferredSeat: 1 },
    });

    await new Promise((r) => setTimeout(r, 15));

    let continueCalled = false;
    let continueSeat = -1;
    let continueChoice = false;
    session.onContinueDecision((seat, c) => {
      continueCalled = true;
      continueSeat = seat;
      continueChoice = c;
    });

    // Client at seat 1 (loser team) sends continue decision -> Accepted!
    clientTransport.send({
      v: 1,
      seq: 2,
      playerToken: clientToken,
      type: "CONTINUE_DECISION",
      payload: { continuePlay: true },
    });

    await new Promise((r) => setTimeout(r, 15));

    expect(continueCalled).toBe(true);
    expect(continueSeat).toBe(1);
    expect(continueChoice).toBe(true);

    // Client at seat 2 (winning team) attempts to decide -> Rejected by host!
    const clientWinnerToken = "token-client-team0";
    const clientWinnerTransport = hub.createClientTransport(clientWinnerToken);
    clientWinnerTransport.send({
      v: 1,
      seq: 3,
      playerToken: clientWinnerToken,
      type: "JOIN",
      payload: { playerName: "Client Team0", preferredSeat: 2 },
    });

    await new Promise((r) => setTimeout(r, 15));

    continueCalled = false;
    clientWinnerTransport.send({
      v: 1,
      seq: 4,
      playerToken: clientWinnerToken,
      type: "CONTINUE_DECISION",
      payload: { continuePlay: false },
    });

    await new Promise((r) => setTimeout(r, 15));

    // Must NOT be accepted
    expect(continueCalled).toBe(false);

    session.destroy();
    hub.reset();
  });

  it("10. التأكد من صحة حالة الكبوت والبوان وفق قواعد اللعبة", () => {
    // كبوت بطلب 9 أكلات في الجولة الأولى = بوان فوري
    const bawanState: GameState = {
      ...baseGameState([0, 0]),
      roundNo: 1,
      highBid: 9,
      bidderSeat: 1, // Team 1
      tricksWon: [0, 9], // Team 1 takes all 9 tricks
    };
    const scoredBawan = scoreRound(bawanState);
    expect(scoredBawan.phase).toBe("GAME_END");
    expect(koutWinnerTeam(scoredBawan)).toBe(1);
    expect(koutLoserTeam(scoredBawan)).toBe(0);

    // كبوت عادي (طلب 8 وفوز بـ 9 أكلات): تُحسب بوان/كبوت نقطية وفق القواعد
    const kabootNormal: GameState = {
      ...baseGameState([10, 10]),
      roundNo: 2,
      highBid: 8,
      bidderSeat: 0,
      tricksWon: [9, 0],
    };
    const scoredKaboot = scoreRound(kabootNormal);
    // 8 bid + 9 tricks = doubled points (16)
    expect(scoredKaboot.scores[0]).toBe(26);
    expect(scoredKaboot.phase).toBe("ROUND_END");
  });
});
