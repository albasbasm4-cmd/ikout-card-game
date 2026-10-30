/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import { findMySeat187 } from "./network187";
import type { Player187 } from "../types";

const players: Player187[] = [
  { seatIndex: 0, kind: "HUMAN_LOCAL", name: "المضيف", isHost: true },
  { seatIndex: 1, kind: "REMOTE", name: "زائد", clientToken: "tok-A" },
  { seatIndex: 2, kind: "AI_BOT", name: "بوت" },
  { seatIndex: 3, kind: "REMOTE", name: "ثاني", clientToken: "tok-B" },
  { seatIndex: 4, kind: "AI_BOT", name: "بوت٢" },
];

describe("findMySeat187", () => {
  it("يعيد مقعد كل منضم من رمز جهازه (لا مقعد ثابت للجميع)", () => {
    expect(findMySeat187(players, "tok-A")).toBe(1);
    expect(findMySeat187(players, "tok-B")).toBe(3);
  });

  it("يعيد 1 كافتراضي آمن عند غياب المطابقة أو القائمة", () => {
    expect(findMySeat187(players, "tok-X")).toBe(1);
    expect(findMySeat187(undefined, "tok-A")).toBe(1);
  });
});
