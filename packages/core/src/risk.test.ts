import { describe, expect, it } from "vitest";
import type { Forecast } from "./model.js";
import type { IsoDate } from "./plain-date.js";
import { riskLevel } from "./risk.js";

const ok = (projectedShortfallRoomNights: number): Forecast => ({
  status: "ok",
  method: "linear-14d",
  referenceAsOf: "2026-09-22" as IsoDate,
  projectedPickupRoomNights: 0,
  projectedShortfallRoomNights,
  projectedDamagesMinor: 0,
  projectedTotalMinor: 0,
});
const unavailable: Forecast = { status: "unavailable", reason: "NO_SNAPSHOT" };

describe("riskLevel", () => {
  it("is met when there is no shortfall, even past the cutoff", () => {
    expect(
      riskLevel({
        shortfallRoomNights: 0,
        daysToCutoff: -5,
        forecast: unavailable,
      }),
    ).toBe("met");
  });

  it("is liable once the cutoff has passed with a shortfall", () => {
    expect(
      riskLevel({ shortfallRoomNights: 3, daysToCutoff: 0, forecast: ok(0) }),
    ).toBe("liable");
  });

  it("is on_track when the forecast projects no shortfall", () => {
    expect(
      riskLevel({ shortfallRoomNights: 3, daysToCutoff: 10, forecast: ok(0) }),
    ).toBe("on_track");
  });

  it("is at_risk when the forecast projects a shortfall", () => {
    expect(
      riskLevel({ shortfallRoomNights: 3, daysToCutoff: 10, forecast: ok(2) }),
    ).toBe("at_risk");
  });

  it("is at_risk when no forecast is available", () => {
    expect(
      riskLevel({
        shortfallRoomNights: 3,
        daysToCutoff: 10,
        forecast: unavailable,
      }),
    ).toBe("at_risk");
  });
});
