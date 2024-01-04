import { describe, expect, it } from "vitest";
import { evaluate } from "./evaluate.js";
import { BlockSchema, SnapshotSchema } from "./model.js";
import type { IsoDate } from "./plain-date.js";
import {
  buildInputs,
  caseAt,
  loadFixture,
  variantOf,
} from "./testing/fixtures.js";

const TODAY = "2026-10-06" as IsoDate;

describe("worked examples", () => {
  for (const name of ["we1", "we2"]) {
    const fixture = loadFixture(name);
    for (const testCase of fixture.cases) {
      it(`${fixture.id} ${testCase.name}`, () => {
        expect(evaluate(buildInputs(fixture, testCase))).toMatchObject(
          testCase.expected,
        );
      });
    }
    for (const variant of fixture.variants ?? []) {
      for (const testCase of variant.cases) {
        it(`${variant.id} ${testCase.name}`, () => {
          const result = evaluate(
            buildInputs(fixture, testCase, variant.overrides),
          );
          expect(result).toMatchObject(testCase.expected);
        });
      }
    }
  }

  it("WE1 per_night breakdown is minimum 64/56/40 and shortfall 0/6/10", () => {
    const fixture = loadFixture("we1");
    const result = evaluate(buildInputs(fixture, caseAt(fixture.cases, 1)));
    expect(result.nights.map((n) => n.minimumRooms)).toEqual([64, 56, 40]);
    expect(result.nights.map((n) => n.shortfallRooms)).toEqual([0, 6, 10]);
  });

  it("WE2 per_night breakdown is minimum 39/51/51/30 and shortfall 0/2/7/0", () => {
    const fixture = loadFixture("we2");
    const result = evaluate(buildInputs(fixture, caseAt(fixture.cases, 1)));
    expect(result.nights.map((n) => n.minimumRooms)).toEqual([39, 51, 51, 30]);
    expect(result.nights.map((n) => n.shortfallRooms)).toEqual([0, 2, 7, 0]);
  });

  it("WE2 cumulative weighted average rate 20325 gives damages 97560", () => {
    // 6 rooms x 20325 x 80% = 97560: the weighted rate is only visible through the damages.
    const fixture = loadFixture("we2");
    expect(
      evaluate(buildInputs(fixture, caseAt(fixture.cases, 0))).damagesMinor,
    ).toBe((6 * 20325 * 80) / 100);
  });

  it("WE2c cumulative tax is 12195 and total 109755", () => {
    const fixture = loadFixture("we2");
    const variant = variantOf(fixture, "WE2c");
    const result = evaluate(
      buildInputs(fixture, caseAt(variant.cases, 0), variant.overrides),
    );
    expect(result.taxMinor).toBe(12195);
    expect(result.totalMinor).toBe(109755);
  });
});

describe("evaluate", () => {
  const fixture = loadFixture("we2");
  const perNightInputs = buildInputs(fixture, caseAt(fixture.cases, 1));
  const cumulativeInputs = buildInputs(fixture, caseAt(fixture.cases, 0));

  it("uses zero pickup and omits snapshotAsOf when no snapshot exists yet", () => {
    const result = evaluate({ ...perNightInputs, snapshots: [] });
    expect(result.pickedUpRoomNights).toBe(0);
    expect("snapshotAsOf" in result).toBe(false);
    expect(result.forecast).toEqual({
      status: "unavailable",
      reason: "NO_SNAPSHOT",
    });
  });

  it("ignores snapshots dated after today", () => {
    const result = evaluate({
      ...perNightInputs,
      today: "2026-10-05" as IsoDate,
    });
    expect("snapshotAsOf" in result).toBe(false);
  });

  it("only per_night results carry minimumRooms and shortfallRooms", () => {
    const perNight = evaluate(perNightInputs);
    expect(perNight.nights.map((n) => n.shortfallRooms)).toEqual([0, 2, 7, 0]);
    expect(perNight.nights.map((n) => n.minimumRooms)).toEqual([
      39, 51, 51, 30,
    ]);
    const cumulative = evaluate(cumulativeInputs);
    expect(
      cumulative.nights.every(
        (n) => !("minimumRooms" in n || "shortfallRooms" in n),
      ),
    ).toBe(true);
  });

  it("per_night shortfallRooms is measured after resell credit and adds up", () => {
    const variant = variantOf(fixture, "WE2b");
    const inputs = buildInputs(
      fixture,
      caseAt(variant.cases, 1),
      variant.overrides,
    );
    const result = evaluate(inputs);
    const total = result.nights.reduce(
      (sum, n) => sum + (n.shortfallRooms ?? 0),
      0,
    );
    expect(total).toBe(result.shortfallRoomNights);
    expect(result.shortfallBeforeCredit).toBe(9);
    expect(result.resellCredited).toBe(3);
  });

  it("sorts nights that arrive out of order", () => {
    const shuffled = {
      ...perNightInputs.block,
      nights: [...perNightInputs.block.nights].reverse(),
    };
    expect(evaluate({ ...perNightInputs, block: shuffled })).toEqual(
      evaluate(perNightInputs),
    );
  });

  it("reports daysToCutoff as negative after the cutoff", () => {
    const result = evaluate({
      ...perNightInputs,
      today: "2026-10-23" as IsoDate,
    });
    expect(result.daysToCutoff).toBe(-3);
    expect(result.riskLevel).toBe("liable");
  });

  it("rounds pickupPct to two decimals", () => {
    expect(evaluate(cumulativeInputs).pickupPct).toBe(82);
    const block = BlockSchema.parse({
      currency: "USD",
      cutoffDate: "2026-10-20",
      terms: { basis: "cumulative", allowedAttritionPct: 10 },
      nights: [{ date: "2026-11-10", contractedRooms: 3, rateMinor: 100 }],
    });
    const snapshot = SnapshotSchema.parse({
      asOfDate: TODAY,
      nights: [{ date: "2026-11-10", pickedUpRooms: 1 }],
    });
    expect(
      evaluate({ block, snapshots: [snapshot], today: TODAY }).pickupPct,
    ).toBe(33.33);
  });

  it("applies minimumRounding ceil, floor and round (half up)", () => {
    const minimum = (mode: "ceil" | "floor" | "round") =>
      evaluate({
        block: BlockSchema.parse({
          currency: "USD",
          cutoffDate: "2026-10-20",
          terms: {
            basis: "cumulative",
            allowedAttritionPct: 15,
            minimumRounding: mode,
          },
          nights: [{ date: "2026-11-10", contractedRooms: 10, rateMinor: 100 }],
        }),
        snapshots: [],
        today: TODAY,
      }).minimumRoomNights;
    // 10 rooms x 85% = 8.5
    expect([minimum("ceil"), minimum("floor"), minimum("round")]).toEqual([
      9, 8, 9,
    ]);
  });

  it("throws if a snapshot lacks one of the block's nights", () => {
    const [snapshot] = perNightInputs.snapshots;
    if (!snapshot) throw new Error("fixture has no snapshot");
    const broken = { ...snapshot, nights: snapshot.nights.slice(1) };
    expect(() => evaluate({ ...perNightInputs, snapshots: [broken] })).toThrow(
      /has no night/,
    );
  });

  it("throws if a block has no contracted rooms (unvalidated input)", () => {
    const empty = {
      ...perNightInputs.block,
      nights: perNightInputs.block.nights.map((n) => ({
        ...n,
        contractedRooms: 0,
      })),
    };
    expect(() => evaluate({ ...perNightInputs, block: empty })).toThrow(
      /at least one contracted room/,
    );
  });

  it("throws instead of losing precision above Number.MAX_SAFE_INTEGER", () => {
    const makeBlock = (contractedRooms: number) =>
      BlockSchema.parse({
        currency: "USD",
        cutoffDate: "2026-10-20",
        terms: { basis: "cumulative", allowedAttritionPct: 100 },
        nights: [{ date: "2026-11-10", contractedRooms, rateMinor: 1 }],
      });
    // Schemas cap rates, so forge an oversized rate to reach the safe-integer guard.
    const forge = (contractedRooms: number) => {
      const block = makeBlock(contractedRooms);
      return {
        ...block,
        nights: block.nights.map((n) => ({ ...n, rateMinor: 2 ** 53 })),
      };
    };
    expect(() =>
      evaluate({ block: forge(1), snapshots: [], today: TODAY }),
    ).toThrow(/MAX_SAFE_INTEGER/);
  });
});
