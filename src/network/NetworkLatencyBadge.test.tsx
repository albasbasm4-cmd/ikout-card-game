/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import { getPingColor } from "../components/NetworkLatencyBadge";

describe("getPingColor", () => {
  it("returns emerald/green for ping 0 to 200 ms", () => {
    expect(getPingColor(0).status).toBe("good");
    expect(getPingColor(0).colorClass).toBe("text-emerald-400");
    expect(getPingColor(150).status).toBe("good");
    expect(getPingColor(200).status).toBe("good");
  });

  it("returns amber/orange for ping 201 to 400 ms", () => {
    expect(getPingColor(201).status).toBe("fair");
    expect(getPingColor(201).colorClass).toBe("text-amber-400");
    expect(getPingColor(350).status).toBe("fair");
    expect(getPingColor(400).status).toBe("fair");
  });

  it("returns rose/red for ping 401 to 700 ms and beyond", () => {
    expect(getPingColor(401).status).toBe("poor");
    expect(getPingColor(401).colorClass).toBe("text-rose-500");
    expect(getPingColor(700).status).toBe("poor");
    expect(getPingColor(999).status).toBe("poor");
  });
});
