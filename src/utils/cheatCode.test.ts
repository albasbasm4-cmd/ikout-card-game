import { describe, expect, it } from "vitest";
import { checkVipCode } from "./cheatCode";

describe("VIP unlock codes", () => {
  it("accepts the base code first", () => {
    expect(checkVipCode("IKOUT_2026_VIP", 0).success).toBe(true);
  });
  it("then accepts numbered codes 1..45 in order", () => {
    expect(checkVipCode("IKOUT_2026_VIP 1", 1).success).toBe(true);
    expect(checkVipCode("IKOUT_2026_VIP 45", 45).success).toBe(true);
  });
  it("rejects code 46", () => {
    expect(checkVipCode("IKOUT_2026_VIP 46", 46).success).toBe(false);
  });
  it("rejects reusing the base code", () => {
    expect(checkVipCode("IKOUT_2026_VIP", 1).success).toBe(false);
  });
  it("rejects out-of-order codes", () => {
    expect(checkVipCode("IKOUT_2026_VIP 3", 1).success).toBe(false);
  });
});
