/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GameState, Suit, TrickPlay, Card, Phase } from "../types/kout";
import { computeRoundResult } from "../engine/KoutScoring";
import { RULES } from "./config";

export type ReportedCardType = Suit | "JOKER" | "MAKER";

export const isType = (c: Card, t: ReportedCardType): boolean =>
  t === "JOKER" ? c.joker === "RED" : t === "MAKER" ? c.joker === "BLACK" : c.suit === t;

/**
 * تحديد نوع الورقة التي طلبتها الأكلة (Led Suit)
 * - الجوكر الأحمر إذا نزل أول ورقة يتحول إلى سبيت (S)
 * - الماكر الأسود إذا نزل أول ورقة يتحول إلى حكم (trump)
 * - أي ورقة عادية يعتمد نوعها
 */
export function getLedSuitOfTrick(plays: TrickPlay[], trump: Suit | null): Suit | null {
  const lead = plays[0];
  if (!lead) return null;
  if (lead.card.joker === "RED") return "S";
  if (lead.card.joker === "BLACK") return trump;
  return lead.card.suit ?? null;
}

/**
 * الغش = اللاعب كسر التبعية (off-suit) رغم أن الورقة المطلوبة (أو نوع البلاغ) كانت في يده وقتها.
 * الفحص يجري عند المضيف/المحرك لأن اليد الكاملة عنده فقط.
 */
export function verifyCheatReport(
  state: GameState,
  accusedSeat: number,
  t: ReportedCardType,
): boolean {
  const trump = state.trump;

  // كل الأكلات التي لُعبت حتى الآن
  const allTricks: TrickPlay[][] = [...state.trickHistory];
  if (state.currentTrick && state.currentTrick.length > 0) {
    allTricks.push(state.currentTrick);
  }

  // الأوراق التي كانت في يد اللاعب وقت الأكلة trickIdx
  const handAtTrick = (trickIdx: number): Card[] => [
    ...(state.hands[accusedSeat] ?? []),
    ...allTricks
      .slice(trickIdx + 1)
      .flatMap((plays) => plays.filter((p) => p.seat === accusedSeat).map((p) => p.card)),
  ];

  for (let idx = 0; idx < allTricks.length; idx++) {
    const plays = allTricks[idx];
    if (!plays || plays.length === 0) continue;

    const ledSuit = getLedSuitOfTrick(plays, trump);
    if (!ledSuit) continue;

    const accusedPlay = plays.find((p) => p.seat === accusedSeat);
    if (!accusedPlay) continue;

    // هل النوع المُبلَّغ عنه يطابق الورقة المطلوبة في الأكلة، أم الورقة التي نزلها المتهم فعلاً
    // (كما ترشد نافذة البلاغ)؟ كلا المعنيين مقبول حتى لا يُحكم بلاغ صادق بأنه كاذب.
    const playedCard = accusedPlay.card;
    const playedType: ReportedCardType | null =
      playedCard.joker === "RED"
        ? "JOKER"
        : playedCard.joker === "BLACK"
          ? "MAKER"
          : (playedCard.suit ?? null);
    const matchesTarget =
      t === ledSuit || (ledSuit === trump && (t === "MAKER" || t === trump)) || t === playedType;
    if (!matchesTarget) continue;

    // هل نزل ورقة تتبع المطلوب أو جوكر مسموح؟ (الجوكر مسموح إنزاله بأي وقت)
    const followedSuit = playedCard.suit === ledSuit || playedCard.joker !== undefined;

    // إذا اتبع الأكلة، فإنه لم يكسر التبعية في هذه اللعبة
    if (followedSuit) continue;

    // اللاعب نزل ورقة مخالفة (off-suit) في أكلة طلبت ledSuit
    // الغش ثابت فقط إذا كانت لديه وقتها ورقة من نوع الأكلة المطلوب
    // (الجوكر لا يُحسب لأن إنزاله مسموح دائماً حتى مع وجود أوراق النوع المطلوب).
    const heldHand = handAtTrick(idx);
    const heldCheatedType = heldHand.some((c) => c.suit === ledSuit);

    if (heldCheatedType) {
      return true; // غش مؤكد!
    }
  }

  return false;
}

export interface CheatResolutionResult {
  confirmed: boolean;
  reporterSeat: number;
  accusedSeat: number;
  cardType: ReportedCardType;
  winningTeam: 0 | 1;
  losingTeam: 0 | 1;
  pointsAdded: number;
  nextState: GameState;
  announcement: string;
}

/**
 * تطبيق حكم البلاغ عن الغش:
 * - إذا طلع كلام المُبلِّغ صحيح: يخسر الفريق الذي غش وتتدبل النقاط لفريق المُبلِّغ.
 * - إذا كان جواب المُبلِّغ خاطئ: تُحتسب النقاط المضاعفة للفريق الذي تم الإبلاغ عنه.
 * - البلاغ عن لاعب في فريق المُبلِّغ نفسه (أو عن نفسه) مرفوض ويُرجع null،
 *   لأنه يتيح "إهداء" النقاط المضاعفة لفريق المُبلِّغ عبر بلاغ كاذب.
 */
export function applyCheatVerdict(
  state: GameState,
  reporterSeat: number,
  accusedSeat: number,
  cardType: ReportedCardType,
): CheatResolutionResult | null {
  const numSeats = RULES[state.variant]?.seats ?? 6;
  if (reporterSeat < 0 || reporterSeat >= numSeats) return null;
  if (accusedSeat < 0 || accusedSeat >= numSeats) return null;
  if (reporterSeat === accusedSeat) return null;
  if (state.matchStopped) return null;

  const players = state.players ?? [];
  const reporterPlayer =
    players.find((p) => p.seatIndex === reporterSeat) ?? players[reporterSeat];
  const accusedPlayer =
    players.find((p) => p.seatIndex === accusedSeat) ?? players[accusedSeat];

  // كلا المقعدين يجب أن يكونا مسجلين وبشريين (ليسا AI_BOT)
  if (!reporterPlayer || reporterPlayer.kind === "AI_BOT") return null;
  if (!accusedPlayer || accusedPlayer.kind === "AI_BOT") return null;

  const reporterTeam: 0 | 1 =
    reporterPlayer.team ?? ((reporterSeat % 2) as 0 | 1);
  const accusedTeam: 0 | 1 =
    accusedPlayer.team ?? ((accusedSeat % 2) as 0 | 1);

  // رفض البلاغ بين أعضاء الفريق نفسه (أو على النفس): لا معنى لحكمه ويفتح باب إهداء النقاط.
  if (reporterTeam === accusedTeam) return null;

  const confirmed = verifyCheatReport(state, accusedSeat, cardType);
  const highBid = state.highBid ?? 5;
  const pointsAdded = highBid * 2; // تدبيل النقاط: 5->10, 6->12, 7->14, 8->16, 9->18

  const winningTeam: 0 | 1 = confirmed ? reporterTeam : accusedTeam;
  const losingTeam: 0 | 1 = (1 - winningTeam) as 0 | 1;

  let baseScores: [number, number] = [state.scores[0], state.scores[1]];

  // منع تكرار احتساب النقاط: إذا كانت الجولة قد احتُسبت مسبقاً، نخصم نقاطها العادية ونعتمد نقاط البلاغ
  if (state.scoredRoundNo === state.roundNo) {
    const priorRoundResult = computeRoundResult(state);
    baseScores = [
      baseScores[0] - (priorRoundResult.awardedTeam === 0 ? priorRoundResult.pointsAdded : 0),
      baseScores[1] - (priorRoundResult.awardedTeam === 1 ? priorRoundResult.pointsAdded : 0),
    ];
  }

  const newScores: [number, number] = [
    baseScores[0] + (winningTeam === 0 ? pointsAdded : 0),
    baseScores[1] + (winningTeam === 1 ? pointsAdded : 0),
  ];

  const targetScore = state.targetScore ?? 51;
  // الحفاظ على حالة GAME_END إذا كانت المباراة قد انتهت بالفعل (بسبب BO4 أو البوان أو غيرهما)
  const isAlreadyGameOver = state.phase === "GAME_END";
  const isGameOver =
    isAlreadyGameOver ||
    newScores[0] >= targetScore ||
    newScores[1] >= targetScore;
  const nextDealer = (state.dealer + 1) % numSeats;

  // لا تسمح بإعادة فتح جولة أو مباراة انتهت بالفعل
  const nextPhase: Phase = isAlreadyGameOver ? "GAME_END" : (isGameOver ? "GAME_END" : "ROUND_END");

  const nextState: GameState = {
    ...state,
    scores: newScores,
    dealer: nextDealer,
    scoredRoundNo: state.roundNo,
    phase: nextPhase,
    version: state.version + 1,
  };

  const accusedName = state.players?.[accusedSeat]?.name || `لاعب ${accusedSeat + 1}`;
  const reporterName = state.players?.[reporterSeat]?.name || `لاعب ${reporterSeat + 1}`;
  const suitNames: Record<ReportedCardType, string> = {
    S: "سبيت",
    H: "هاص",
    D: "ديمن",
    C: "كلفس",
    JOKER: "جوكر أحمر",
    MAKER: "ماكر أسود",
  };

  const announcement = confirmed
    ? `⚖️ غش مؤكد: ثبت أن ${accusedName} كسر التبعية في ورقة ${suitNames[cardType]}! تم احتساب ${pointsAdded} نقطة مضاعفة لفريق ${reporterName}.`
    : `⚖️ بلاغ خاطئ: لم يثبت غش ${accusedName} في ورقة ${suitNames[cardType]}! تم احتساب ${pointsAdded} نقطة مضاعفة لفريق ${accusedName}.`;

  return {
    confirmed,
    reporterSeat,
    accusedSeat,
    cardType,
    winningTeam,
    losingTeam,
    pointsAdded,
    nextState,
    announcement,
  };
}
