import { describe, expect, it } from "vitest";
import { CARD_FLIGHT_SECONDS } from "./cardFlight";

describe("card flight timing", () => {
  it("flies a played card to the table in about one second (fast but visible)", () => {
    expect(CARD_FLIGHT_SECONDS).toBeGreaterThanOrEqual(0.6);
    expect(CARD_FLIGHT_SECONDS).toBeLessThanOrEqual(1);
  });
});
