/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Card187, GameState187, Player187, Suit187, TrickPlay187 } from "./types";
import {
  createDeck187,
  getCardPoints,
  getLegalCards187,
  resolveTrickWinner187,
  calculateTrickPoints,
  checkEarlySettlement187,
  checkFinalWinner187,
  TOTAL_GAME_POINTS,
  MIN_BID,
  MAX_BID,
} from "./rules";

export interface GameEngine187Options {
  seed?: number;
  players?: Player187[];
  initialDealer?: number;
}

export class GameEngine187 {
  private _state: GameState187;
  private _rng: () => number;

  constructor(options: GameEngine187Options = {}, restoredState?: GameState187) {
    if (restoredState) {
      this._state = { ...restoredState };
      this._rng = this._createRng(options.seed ?? Date.now());
      return;
    }

    this._rng = this._createRng(options.seed ?? Date.now());
    const players = options.players ?? this._createDefaultPlayers();
    const dealer = options.initialDealer ?? 0;

    this._state = {
      roundNo: 1,
      dealer,
      currentSeat: (dealer + 1) % 5,
      hands: [[], [], [], [], []],
      tableCards: [],
      bids: [],
      passedSeats: [false, false, false, false, false],
      highBid: null,
      bidderSeat: null,
      trump: null,
      currentTrick: [],
      trickHistory: [],
      tricksWon: [0, 0, 0, 0, 0],
      capturedCards: [[], [], [], [], []],
      hakemPoints: 0,
      opponentsPoints: 0,
      earlySettled: false,
      earlySettledWinner: null,
      continueAfterEarlySettle: false,
      phase: "DEAL",
      players,
      winner: null,
      cheatReportsCount: 0,
      lastCheatVerdict: null,
      version: 1,
    };
  }

  get state(): Readonly<GameState187> {
    return this._state;
  }

  private _createDefaultPlayers(): Player187[] {
    return [
      { seatIndex: 0, kind: "HUMAN_LOCAL", name: "أنت" },
      { seatIndex: 1, kind: "AI_BOT", name: "سالم" },
      { seatIndex: 2, kind: "AI_BOT", name: "فهد" },
      { seatIndex: 3, kind: "AI_BOT", name: "مبارك" },
      { seatIndex: 4, kind: "AI_BOT", name: "طلال" },
    ];
  }

  private _createRng(seed: number): () => number {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  private _shuffle<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this._rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** توزيع الأوراق وبدء الجولة */
  startRound(seed?: number) {
    if (seed !== undefined) {
      this._rng = this._createRng(seed);
    }

    const deck = this._shuffle(createDeck187());

    // 7 أوراق لكل لاعب من اللاعبين الخمسة = 35 ورقة
    const hands: Card187[][] = [[], [], [], [], []];
    for (let s = 0; s < 5; s++) {
      hands[s] = deck.slice(s * 7, s * 7 + 7);
    }

    // 5 أوراق على الطاولة
    const tableCards = deck.slice(35, 40);

    const firstBidder = (this._state.dealer + 1) % 5;

    this._state = {
      ...this._state,
      hands,
      tableCards,
      bids: [],
      passedSeats: [false, false, false, false, false],
      highBid: null,
      bidderSeat: null,
      trump: null,
      currentSeat: firstBidder,
      currentTrick: [],
      trickHistory: [],
      tricksWon: [0, 0, 0, 0, 0],
      capturedCards: [[], [], [], [], []],
      hakemPoints: 0,
      opponentsPoints: 0,
      earlySettled: false,
      earlySettledWinner: null,
      continueAfterEarlySettle: false,
      phase: "BID",
      winner: null,
      version: this._state.version + 1,
      lastCheatVerdict: null,
    };
  }

  /** جولة جديدة: التوزيع ينتقل للاعب الذي على يمين الموزع السابق */
  nextRound(seed?: number) {
    this._state = {
      ...this._state,
      dealer: (this._state.dealer + 1) % 5,
      roundNo: this._state.roundNo + 1,
    };
    this.startRound(seed);
  }

  /** تقديم مزايدة أو الانسحاب */
  placeBid(seat: number, bid: number) {
    if (this._state.phase !== "BID") {
      throw new Error(`Cannot bid in phase ${this._state.phase}`);
    }
    if (this._state.currentSeat !== seat) {
      throw new Error(`Not seat ${seat}'s turn to bid`);
    }
    if (this._state.passedSeats[seat]) {
      throw new Error(`Seat ${seat} has already passed`);
    }

    const newPassed = [...this._state.passedSeats];
    const newBids = [...this._state.bids, { seat, bid }];
    let newHighBid = this._state.highBid;
    let newBidderSeat = this._state.bidderSeat;

    if (bid === 0) {
      newPassed[seat] = true;
    } else {
      if (bid % 5 !== 0 || bid < MIN_BID || bid > MAX_BID) {
        throw new Error(`Invalid bid ${bid}. Must be multiple of 5 between 75 and 185.`);
      }
      if (this._state.highBid !== null && bid <= this._state.highBid) {
        throw new Error(`Bid ${bid} must be higher than current high bid ${this._state.highBid}`);
      }
      newHighBid = bid;
      newBidderSeat = seat;
    }

    // فحص ما إذا انتهت المزايدة
    const activeSeats = [0, 1, 2, 3, 4].filter((s) => !newPassed[s]);

    if (activeSeats.length === 1 && newHighBid !== null) {
      // فاز صاحب أعلى مزايدة
      const winnerSeat = activeSeats[0];
      return this._concludeBidding(winnerSeat, newHighBid, newBids, newPassed);
    }

    if (activeSeats.length === 1 && newHighBid === null) {
      // الجميع انسحبوا بدون أي مزايدة -> آخر لاعب ملزم بـ 75
      const forcedSeat = activeSeats[0];
      return this._concludeBidding(forcedSeat, MIN_BID, newBids, newPassed);
    }

    if (activeSeats.length === 0) {
      // حالة قصوى: انسحب الجميع -> الموزع أو آخر لاعب بـ 75
      return this._concludeBidding(this._state.dealer, MIN_BID, newBids, newPassed);
    }

    // الانتقال للمقعد النشط التالي (يمين)
    let nextSeat = (seat + 1) % 5;
    while (newPassed[nextSeat]) {
      nextSeat = (nextSeat + 1) % 5;
    }

    this._state = {
      ...this._state,
      bids: newBids,
      passedSeats: newPassed,
      highBid: newHighBid,
      bidderSeat: newBidderSeat,
      currentSeat: nextSeat,
      version: this._state.version + 1,
    };
  }

  private _concludeBidding(
    winnerSeat: number,
    finalBid: number,
    bids: { seat: number; bid: number }[],
    passedSeats: boolean[],
  ) {
    // الحاكم يأخذ أوراق الطاولة الخمس ليصبح بيده 12 ورقة
    const hands = this._state.hands.map((h, s) =>
      s === winnerSeat ? [...h, ...this._state.tableCards] : [...h],
    );

    this._state = {
      ...this._state,
      bids,
      passedSeats,
      highBid: finalBid,
      bidderSeat: winnerSeat,
      currentSeat: winnerSeat,
      hands,
      tableCards: [],
      phase: "DISCARD",
      version: this._state.version + 1,
    };
  }

  /**
   * الحاكم يعطي 4 أوراق لخصومه (ورقة لكل خصم) ويحتفظ بـ 8 أوراق
   */
  giveAwayCards(hakemSeat: number, cardIdsToGive: string[]) {
    if (this._state.phase !== "DISCARD") {
      throw new Error(`Cannot give away cards in phase ${this._state.phase}`);
    }
    if (this._state.bidderSeat !== hakemSeat) {
      throw new Error(`Only winning bidder seat ${this._state.bidderSeat} can discard`);
    }
    if (cardIdsToGive.length !== 4) {
      throw new Error("Must give away exactly 4 cards (one for each of the 4 opponents)");
    }

    const hakemHand = [...this._state.hands[hakemSeat]];
    const cardsToDistribute: Card187[] = [];

    for (const id of cardIdsToGive) {
      const idx = hakemHand.findIndex((c) => c.id === id);
      if (idx === -1) throw new Error(`Card ${id} not found in Hakem's hand`);
      cardsToDistribute.push(hakemHand[idx]);
      hakemHand.splice(idx, 1);
    }

    // توزيع ورقة واحدة لكل خصم من الخصوم الأربعة
    const opponentSeats = [0, 1, 2, 3, 4].filter((s) => s !== hakemSeat);
    const newHands = this._state.hands.map((h) => [...h]);
    newHands[hakemSeat] = hakemHand;

    for (let i = 0; i < opponentSeats.length; i++) {
      newHands[opponentSeats[i]].push(cardsToDistribute[i]);
    }

    this._state = {
      ...this._state,
      hands: newHands,
      phase: "TRUMP",
      currentSeat: hakemSeat,
      version: this._state.version + 1,
    };
  }

  /** الحاكم يحدد نوع الحكم */
  declareTrump(hakemSeat: number, suit: Suit187) {
    if (this._state.phase !== "TRUMP") {
      throw new Error(`Cannot declare trump in phase ${this._state.phase}`);
    }
    if (this._state.bidderSeat !== hakemSeat) {
      throw new Error(`Only bidder seat ${this._state.bidderSeat} can declare trump`);
    }

    this._state = {
      ...this._state,
      trump: suit,
      phase: "PLAY",
      // أول لاعب وُزّع له (يمين الموزع) يرمي أول ورقة
      currentSeat: (this._state.dealer + 1) % 5,
      version: this._state.version + 1,
    };
  }

  /** إنزال ورقة في الأكلة */
  playCard(seat: number, card: Card187, options?: { allowAnyCard?: boolean }) {
    if (this._state.phase !== "PLAY") {
      throw new Error(`Cannot play card in phase ${this._state.phase}`);
    }
    if (this._state.currentSeat !== seat) {
      throw new Error(`Not seat ${seat}'s turn to play`);
    }

    const hand = this._state.hands[seat];
    const cardIdx = hand.findIndex((c) => c.id === card.id);
    if (cardIdx === -1) {
      throw new Error(`Seat ${seat} does not hold card ${card.id}`);
    }

    if (!options?.allowAnyCard) {
      const legal = getLegalCards187(
        hand,
        this._state.currentTrick,
        this._state.trump,
        seat,
        this._state.bidderSeat!,
        this._state.trickHistory.length,
      );
      if (!legal.some((c) => c.id === card.id)) {
        throw new Error(`Illegal card play: card ${card.id} violates following suit rules`);
      }
    }

    const newHand = [...hand];
    newHand.splice(cardIdx, 1);
    const newHands = this._state.hands.map((h, s) => (s === seat ? newHand : h));

    const newTrick = [...this._state.currentTrick, { seat, card: hand[cardIdx] }];

    // إذا لم تكتمل الأكلة (أقل من 5 لاعبين)
    if (newTrick.length < 5) {
      const nextSeat = (seat + 1) % 5;
      this._state = {
        ...this._state,
        hands: newHands,
        currentTrick: newTrick,
        currentSeat: nextSeat,
        version: this._state.version + 1,
      };
      return;
    }

    // اكتملت الأكلة (5 أوراق)
    const winnerPlay = resolveTrickWinner187(newTrick, this._state.trump);
    const trickPoints = calculateTrickPoints(newTrick);
    const winnerSeat = winnerPlay.seat;
    const isHakem = winnerSeat === this._state.bidderSeat;

    const newHakemPoints = this._state.hakemPoints + (isHakem ? trickPoints : 0);
    const newOpponentsPoints = this._state.opponentsPoints + (!isHakem ? trickPoints : 0);

    const newTricksWon = [...this._state.tricksWon];
    newTricksWon[winnerSeat] += 1;

    const newCapturedCards = this._state.capturedCards.map((c, s) =>
      s === winnerSeat ? [...c, ...newTrick.map((p) => p.card)] : [...c],
    );

    const newTrickHistory = [...this._state.trickHistory, newTrick];
    const isRoundOver = newTrickHistory.length === 8;

    let nextPhase: GameState187["phase"] = "PLAY";
    let earlySettled = this._state.earlySettled;
    let earlyWinner = this._state.earlySettledWinner;
    let finalWinner = this._state.winner;

    // فحص الحسم المبكر
    if (!earlySettled) {
      const remainingPoints = TOTAL_GAME_POINTS - (newHakemPoints + newOpponentsPoints);
      const earlyCheck = checkEarlySettlement187(
        newHakemPoints,
        newOpponentsPoints,
        this._state.highBid!,
        remainingPoints,
      );
      if (earlyCheck) {
        earlySettled = true;
        earlyWinner = earlyCheck;
        if (!isRoundOver) {
          nextPhase = "EARLY_SETTLE";
        }
      }
    }

    if (isRoundOver) {
      nextPhase = "ROUND_END";
      finalWinner = checkFinalWinner187(newHakemPoints, newOpponentsPoints, this._state.highBid!);
    }

    this._state = {
      ...this._state,
      hands: newHands,
      currentTrick: [],
      trickHistory: newTrickHistory,
      tricksWon: newTricksWon,
      capturedCards: newCapturedCards,
      hakemPoints: newHakemPoints,
      opponentsPoints: newOpponentsPoints,
      earlySettled,
      earlySettledWinner: earlyWinner,
      phase: nextPhase,
      currentSeat: winnerSeat,
      winner: finalWinner,
      version: this._state.version + 1,
    };
  }

  /** قرار الاستمرار بعد الحسم المبكر */
  decideEarlyContinue(continuePlay: boolean) {
    if (this._state.phase !== "EARLY_SETTLE") {
      return;
    }

    if (continuePlay) {
      this._state = {
        ...this._state,
        continueAfterEarlySettle: true,
        phase: "PLAY",
        version: this._state.version + 1,
      };
    } else {
      this._state = {
        ...this._state,
        phase: "ROUND_END",
        winner: this._state.earlySettledWinner,
        version: this._state.version + 1,
      };
    }
  }

  /** إبلاغ عن غش */
  reportCheat(reporterSeat: number, accusedSeat: number, accusedSuit: Suit187) {
    if (this._state.phase !== "PLAY") return;
    if (
      !this._state.players[reporterSeat] ||
      !this._state.players[accusedSeat] ||
      reporterSeat === accusedSeat
    )
      return;

    const bidderSeat = this._state.bidderSeat ?? 0;
    const reporterIsHakem = reporterSeat === bidderSeat;
    const accusedIsHakem = accusedSeat === bidderSeat;

    // الفرقاطتان: الحاكم بمفرده مقابل فريق الخصوم الأربعة.
    // لا يجوز لأحد أعضاء الفريق الإبلاغ عن زميله (ثغرة إهداء الفوز).
    if (reporterIsHakem === accusedIsHakem) return;

    let confirmed = false;

    // فحص الأكلات المؤرشفة + الأكلة الجارية على الطاولة قبل أرشفتها
    const allTricks: TrickPlay187[][] = [...this._state.trickHistory];
    if (this._state.currentTrick.length > 0) allTricks.push(this._state.currentTrick);

    for (const [index, trick] of allTricks.entries()) {
      const leadCard = trick[0]?.card;
      if (!leadCard) continue;
      const accusedIdx = trick.findIndex((p) => p.seat === accusedSeat);
      if (accusedIdx === -1) continue;
      const accusedPlay = trick[accusedIdx];

      // كسر التبعية: الغشاش رمى ورقة من نوع مختلف عن نوع بداية الأكلة رغم امتلاكه للنوع.
      // البلاغ يقبل إما نوع الورقة التي رماها الغشاش أو نوع بداية الأكلة نفسه.
      if (
        accusedPlay.card.suit !== leadCard.suit &&
        (accusedSuit === accusedPlay.card.suit || accusedSuit === leadCard.suit)
      ) {
        const laterPlays: TrickPlay187[][] = [
          trick.slice(accusedIdx),
          ...allTricks.slice(index + 1),
        ];
        const laterCards = laterPlays.flatMap((t) =>
          t.filter((p) => p.seat === accusedSeat).map((p) => p.card),
        );
        const heldAtPlay = [...this._state.hands[accusedSeat], ...laterCards];
        const prefix = trick.slice(0, accusedIdx);
        const legal = getLegalCards187(
          heldAtPlay,
          prefix,
          this._state.trump,
          accusedSeat,
          bidderSeat,
          index,
        );
        if (!legal.some((c) => c.id === accusedPlay.card.id)) {
          confirmed = true;
          break;
        }
      }
    }

    const isAccusedHakem = accusedSeat === bidderSeat;
    const isReporterHakem = reporterSeat === bidderSeat;

    let winner: "HAKEM" | "OPPONENTS";
    let announcement: string;

    if (confirmed) {
      // الغش مؤكد -> فريق الغاش يخسر، فريق المبلغ يفوز
      winner = isAccusedHakem ? "OPPONENTS" : "HAKEM";
      announcement = `⚖️ ثبت الغش على اللاعب ${this._state.players[accusedSeat]?.name}! فاز فريق المبلغ.`;
    } else {
      // البلاغ خاطئ -> فريق المبلغ يخسر
      winner = isReporterHakem ? "OPPONENTS" : "HAKEM";
      announcement = `⚖️ بلاغ خاطئ! لم يثبت الغش على اللاعب ${this._state.players[accusedSeat]?.name}.`;
    }

    this._state = {
      ...this._state,
      phase: "ROUND_END",
      winner,
      lastCheatVerdict: {
        confirmed,
        accusedSeat,
        reporterSeat,
        announcement,
      },
      cheatReportsCount: (this._state.cheatReportsCount || 0) + 1,
      version: this._state.version + 1,
    };
  }
}
