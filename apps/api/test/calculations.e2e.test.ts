import { describe, expect, it } from "vitest";
import { API_KEY, useTestApp } from "./support/app.js";

// The calculator is stateless, so these tests need no data in the database.
const { http } = useTestApp();

// WE2 from HANDOFF.md: the same numbers the web calculator's "Load example" button uses.
const we2 = (basis: "cumulative" | "per_night", extra: object = {}) => ({
  currency: "USD",
  terms: { basis, allowedAttritionPct: 15, damagesPct: 80 },
  nights: [
    {
      date: "2026-11-10",
      contractedRooms: 45,
      rateMinor: 18900,
      pickedUpRooms: 40,
    },
    {
      date: "2026-11-11",
      contractedRooms: 60,
      rateMinor: 18900,
      pickedUpRooms: 49,
    },
    {
      date: "2026-11-12",
      contractedRooms: 60,
      rateMinor: 21900,
      pickedUpRooms: 44,
    },
    {
      date: "2026-11-13",
      contractedRooms: 35,
      rateMinor: 21900,
      pickedUpRooms: 31,
    },
  ],
  ...extra,
});

const calculate = (body: object) =>
  http()
    .post("/v1/calculations/attrition")
    .set("x-api-key", API_KEY)
    .send(body);

describe("POST /v1/calculations/attrition", () => {
  it("WE2 cumulative: damages 97560 ($975.60), forecast unavailable", async () => {
    const res = await calculate(we2("cumulative")).expect(200);
    expect(res.body).toMatchObject({
      asOf: "2026-10-06",
      snapshotAsOf: "2026-10-06",
      minimumRoomNights: 170,
      shortfallRoomNights: 6,
      damagesMinor: 97560,
      forecast: { status: "unavailable", reason: "INSUFFICIENT_HISTORY" },
    });
  });

  it("WE2 per_night: damages 152880 ($1,528.80)", async () => {
    const res = await calculate(we2("per_night")).expect(200);
    expect(res.body.damagesMinor).toBe(152880);
    expect(res.body.nights[2]).toMatchObject({
      minimumRooms: 51,
      shortfallRooms: 7,
    });
  });

  it("defaults cutoffDate to the first night and today to the clock", async () => {
    const res = await calculate(we2("cumulative")).expect(200);
    // FIXED_TODAY is 2026-10-06 and the first night 2026-11-10: 35 days apart.
    expect(res.body.daysToCutoff).toBe(35);
  });

  it("reports PAST_CUTOFF when today is after the cutoff", async () => {
    const res = await calculate(
      we2("cumulative", { cutoffDate: "2026-10-20", today: "2026-10-25" }),
    ).expect(200);
    expect(res.body.forecast).toEqual({
      status: "unavailable",
      reason: "PAST_CUTOFF",
    });
    expect(res.body.riskLevel).toBe("liable");
  });

  it("RESOLD_EXCEEDS_CONTRACTED: 422 when resold rooms exceed the night's contract", async () => {
    const body = we2("cumulative");
    const night = body.nights[3];
    if (night) Object.assign(night, { resoldRooms: 36 });
    const res = await calculate(body).expect(422);
    expect(res.body.code).toBe("RESOLD_EXCEEDS_CONTRACTED");
    expect(res.body.detail).toContain("2026-11-13");
  });

  it("VALIDATION_FAILED: nights not consecutive, duplicated, or cutoff after the first night", async () => {
    const gap = we2("cumulative");
    const last = gap.nights[3];
    if (last) last.date = "2026-11-20";
    expect((await calculate(gap).expect(422)).body.code).toBe(
      "VALIDATION_FAILED",
    );

    const late = we2("cumulative", { cutoffDate: "2026-11-11" });
    const res = await calculate(late).expect(422);
    expect(res.body.errors[0].path).toBe("cutoffDate");
  });
});
