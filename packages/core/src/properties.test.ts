import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { evaluate } from "./evaluate.js";
import {
  type Block,
  BlockSchema,
  type Snapshot,
  SnapshotSchema,
} from "./model.js";
import { addDays, type IsoDate } from "./plain-date.js";

// Property tests: random but valid blocks and snapshots, checked against rules that must always hold.

const RUNS = { numRuns: 200, seed: 42 };
const FIRST_NIGHT = "2026-11-10" as IsoDate;
const TODAY = "2026-10-06" as IsoDate;

const pct = (max: number) =>
  fc.integer({ min: 0, max: max * 100 }).map((bps) => bps / 100);

const nightArb = fc.record({
  contractedRooms: fc.integer({ min: 0, max: 300 }),
  rateMinor: fc.integer({ min: 0, max: 60_000 }),
  pickedUpRooms: fc.integer({ min: 0, max: 400 }),
  resoldRooms: fc.integer({ min: 0, max: 300 }),
});

interface Scenario {
  block: Block;
  snapshot: Snapshot;
}

function build(
  rows: {
    contractedRooms: number;
    rateMinor: number;
    pickedUpRooms: number;
    resoldRooms: number;
  }[],
  terms: object,
): Scenario {
  // The first night always has rooms, so the block is valid whatever the others are.
  const nights = rows.map((row, i) => ({
    date: addDays(FIRST_NIGHT, i),
    contractedRooms:
      i === 0 ? Math.max(1, row.contractedRooms) : row.contractedRooms,
    rateMinor: row.rateMinor,
  }));
  const block = BlockSchema.parse({
    currency: "USD",
    cutoffDate: "2026-10-20",
    terms,
    nights,
  });
  const snapshot = SnapshotSchema.parse({
    asOfDate: TODAY,
    nights: rows.map((row, i) => ({
      date: addDays(FIRST_NIGHT, i),
      pickedUpRooms: row.pickedUpRooms,
      // Resold rooms can never exceed the rooms the night actually has.
      resoldRooms: Math.min(row.resoldRooms, nights[i]?.contractedRooms ?? 0),
    })),
  });
  return { block, snapshot };
}

const termsArb = fc.record({
  basis: fc.constantFrom("cumulative", "per_night"),
  allowedAttritionPct: pct(100),
  damagesPct: pct(100),
  taxPct: pct(50),
  resellCredit: fc.boolean(),
  minimumRounding: fc.constantFrom("ceil", "floor", "round"),
});

const scenarioArb = fc
  .tuple(fc.array(nightArb, { minLength: 1, maxLength: 8 }), termsArb)
  .map(([rows, terms]) => build(rows, terms));

const run = ({ block, snapshot }: Scenario) =>
  evaluate({ block, snapshots: [snapshot], today: TODAY });

describe("evaluate properties", () => {
  it("P1 damages, tax and shortfalls are never negative", () => {
    fc.assert(
      fc.property(scenarioArb, (scenario) => {
        const r = run(scenario);
        return (
          r.damagesMinor >= 0 &&
          r.taxMinor >= 0 &&
          r.totalMinor >= 0 &&
          r.shortfallRoomNights >= 0 &&
          r.shortfallBeforeCredit >= 0 &&
          r.nights.every((n) => (n.shortfallRooms ?? 0) >= 0)
        );
      }),
      RUNS,
    );
  });

  it("P2 raising any night's pickup never increases shortfall or damages", () => {
    fc.assert(
      fc.property(
        scenarioArb,
        fc.nat({ max: 7 }),
        fc.integer({ min: 1, max: 100 }),
        (scenario, index, extra) => {
          const nights = scenario.snapshot.nights.map((n, i) =>
            i === index % scenario.snapshot.nights.length
              ? { ...n, pickedUpRooms: n.pickedUpRooms + extra }
              : n,
          );
          const before = run(scenario);
          const after = run({
            ...scenario,
            snapshot: { ...scenario.snapshot, nights },
          });
          return (
            after.shortfallRoomNights <= before.shortfallRoomNights &&
            after.damagesMinor <= before.damagesMinor
          );
        },
      ),
      RUNS,
    );
  });

  it("P3 with ceil, per_night shortfall is at least the cumulative shortfall", () => {
    fc.assert(
      fc.property(scenarioArb, ({ block, snapshot }) => {
        const withBasis = (basis: "cumulative" | "per_night") => ({
          ...block,
          terms: { ...block.terms, basis, minimumRounding: "ceil" as const },
        });
        const perNight = evaluate({
          block: withBasis("per_night"),
          snapshots: [snapshot],
          today: TODAY,
        });
        const cumulative = evaluate({
          block: withBasis("cumulative"),
          snapshots: [snapshot],
          today: TODAY,
        });
        return perNight.shortfallRoomNights >= cumulative.shortfallRoomNights;
      }),
      RUNS,
    );
  });

  it("P4 full pickup on every night means no shortfall and no damages", () => {
    fc.assert(
      fc.property(scenarioArb, ({ block, snapshot }) => {
        const full = {
          ...snapshot,
          nights: snapshot.nights.map((n) => {
            const contracted =
              block.nights.find((b) => b.date === n.date)?.contractedRooms ?? 0;
            return { ...n, pickedUpRooms: contracted + (n.pickedUpRooms % 3) };
          }),
        };
        const r = run({ block, snapshot: full });
        return r.shortfallRoomNights === 0 && r.damagesMinor === 0;
      }),
      RUNS,
    );
  });

  it("P5 turning resell credit on never increases damages", () => {
    fc.assert(
      fc.property(scenarioArb, ({ block, snapshot }) => {
        const withCredit = (resellCredit: boolean) =>
          evaluate({
            block: { ...block, terms: { ...block.terms, resellCredit } },
            snapshots: [snapshot],
            today: TODAY,
          });
        return withCredit(true).damagesMinor <= withCredit(false).damagesMinor;
      }),
      RUNS,
    );
  });

  it("P6 evaluate is pure: same input, same output, input untouched", () => {
    fc.assert(
      fc.property(scenarioArb, (scenario) => {
        const input = {
          block: scenario.block,
          snapshots: [scenario.snapshot],
          today: TODAY,
        };
        const frozen = structuredClone(input);
        const first = evaluate(input);
        const second = evaluate(input);
        expect(second).toEqual(first);
        expect(input).toEqual(frozen);
        return true;
      }),
      RUNS,
    );
  });
});
