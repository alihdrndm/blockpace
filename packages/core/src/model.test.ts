import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AttritionTermsSchema,
  BlockSchema,
  checkSnapshotAgainstBlock,
  EvaluationSchema,
  SnapshotSchema,
} from "./model.js";

const night = (date: string, contractedRooms = 10, rateMinor = 10000) => ({
  date,
  contractedRooms,
  rateMinor,
});

const validBlock = () => ({
  currency: "USD",
  cutoffDate: "2026-10-20",
  terms: { basis: "cumulative", allowedAttritionPct: 15 },
  nights: [night("2026-11-10"), night("2026-11-11")],
});

const messages = (input: unknown) => {
  const result = BlockSchema.safeParse(input);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.message);
};

describe("AttritionTerms", () => {
  it("applies the documented defaults", () => {
    const terms = AttritionTermsSchema.parse({
      basis: "per_night",
      allowedAttritionPct: 10,
    });
    expect(terms).toEqual({
      basis: "per_night",
      allowedAttritionPct: 10,
      damagesPct: 100,
      taxPct: 0,
      resellCredit: false,
      minimumRounding: "ceil",
    });
  });

  it("rejects out-of-range percentages and more than 2 decimals", () => {
    const bad = (patch: object) =>
      AttritionTermsSchema.safeParse({
        basis: "cumulative",
        allowedAttritionPct: 10,
        ...patch,
      }).success;
    expect(bad({ allowedAttritionPct: 100.01 })).toBe(false);
    expect(bad({ allowedAttritionPct: -1 })).toBe(false);
    expect(bad({ allowedAttritionPct: 12.555 })).toBe(false);
    expect(bad({ allowedAttritionPct: 12.25 })).toBe(true);
    expect(bad({ damagesPct: 101 })).toBe(false);
    expect(bad({ taxPct: 50.01 })).toBe(false);
    expect(bad({ taxPct: 50 })).toBe(true);
  });

  it("rejects unknown keys and unknown enum values", () => {
    const parse = (patch: object) =>
      AttritionTermsSchema.safeParse({
        basis: "cumulative",
        allowedAttritionPct: 10,
        ...patch,
      }).success;
    expect(parse({ surprise: 1 })).toBe(false);
    expect(parse({ basis: "weekly" })).toBe(false);
    expect(parse({ minimumRounding: "up" })).toBe(false);
  });
});

describe("Block", () => {
  it("accepts a valid block, whatever the night order", () => {
    expect(BlockSchema.safeParse(validBlock()).success).toBe(true);
    const reversed = { ...validBlock(), nights: validBlock().nights.reverse() };
    expect(BlockSchema.safeParse(reversed).success).toBe(true);
  });

  it("rejects a bad currency code", () => {
    expect(
      BlockSchema.safeParse({ ...validBlock(), currency: "usd" }).success,
    ).toBe(false);
    expect(
      BlockSchema.safeParse({ ...validBlock(), currency: "US" }).success,
    ).toBe(false);
  });

  it("rejects 0 nights and more than 60 nights", () => {
    expect(messages({ ...validBlock(), nights: [] })).toContain(
      "a block has 1 to 60 nights",
    );
    const sixtyOne = Array.from({ length: 61 }, (_, i) => {
      const day = new Date(Date.UTC(2026, 10, 1 + i))
        .toISOString()
        .slice(0, 10);
      return night(day);
    });
    expect(
      messages({ ...validBlock(), cutoffDate: "2026-10-20", nights: sixtyOne }),
    ).toContain("a block has 1 to 60 nights");
  });

  it("rejects duplicate nights", () => {
    const nights = [night("2026-11-10"), night("2026-11-10")];
    expect(messages({ ...validBlock(), nights }).join()).toMatch(
      /duplicate night/,
    );
  });

  it("rejects nights with a gap", () => {
    const nights = [night("2026-11-10"), night("2026-11-12")];
    expect(messages({ ...validBlock(), nights }).join()).toMatch(
      /not consecutive/,
    );
  });

  it("rejects a block where every night has 0 contracted rooms", () => {
    const nights = [night("2026-11-10", 0), night("2026-11-11", 0)];
    expect(messages({ ...validBlock(), nights }).join()).toMatch(/above 0/);
  });

  it("allows some nights with 0 contracted rooms", () => {
    const nights = [night("2026-11-10", 0), night("2026-11-11", 5)];
    expect(BlockSchema.safeParse({ ...validBlock(), nights }).success).toBe(
      true,
    );
  });

  it("rejects a cutoff after the first night but allows the first night itself", () => {
    expect(
      messages({ ...validBlock(), cutoffDate: "2026-11-11" }).join(),
    ).toMatch(/cutoffDate/);
    expect(
      BlockSchema.safeParse({ ...validBlock(), cutoffDate: "2026-11-10" })
        .success,
    ).toBe(true);
  });

  it("rejects impossible calendar dates and out-of-range room or rate values", () => {
    expect(
      BlockSchema.safeParse({ ...validBlock(), cutoffDate: "2026-02-30" })
        .success,
    ).toBe(false);
    const rooms = [night("2026-11-10", 5001)];
    expect(
      BlockSchema.safeParse({ ...validBlock(), nights: rooms }).success,
    ).toBe(false);
    const rate = [night("2026-11-10", 10, 10_000_001)];
    expect(
      BlockSchema.safeParse({ ...validBlock(), nights: rate }).success,
    ).toBe(false);
    const fractional = [night("2026-11-10", 1.5)];
    expect(
      BlockSchema.safeParse({ ...validBlock(), nights: fractional }).success,
    ).toBe(false);
  });
});

describe("Snapshot", () => {
  it("defaults resoldRooms to 0 and allows pickup above contracted rooms", () => {
    const snapshot = SnapshotSchema.parse({
      asOfDate: "2026-10-06",
      nights: [{ date: "2026-11-10", pickedUpRooms: 9999 }],
    });
    expect(snapshot.nights[0]?.resoldRooms).toBe(0);
  });

  it("rejects duplicate night dates inside one snapshot", () => {
    const result = SnapshotSchema.safeParse({
      asOfDate: "2026-10-06",
      nights: [
        { date: "2026-11-10", pickedUpRooms: 1 },
        { date: "2026-11-10", pickedUpRooms: 2 },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/duplicate night/);
  });

  it("rejects negative or oversized pickup and unknown keys", () => {
    const parse = (nightPatch: object) =>
      SnapshotSchema.safeParse({
        asOfDate: "2026-10-06",
        nights: [{ date: "2026-11-10", pickedUpRooms: 1, ...nightPatch }],
      }).success;
    expect(parse({ pickedUpRooms: -1 })).toBe(false);
    expect(parse({ pickedUpRooms: 10_001 })).toBe(false);
    expect(parse({ resoldRooms: -1 })).toBe(false);
    expect(parse({ extra: true })).toBe(false);
  });
});

describe("checkSnapshotAgainstBlock", () => {
  const block = BlockSchema.parse({
    ...validBlock(),
    nights: [
      night("2026-11-10", 10),
      night("2026-11-11", 10),
      night("2026-11-12", 10),
    ],
  });
  const snapshot = (
    nights: { date: string; pickedUpRooms: number; resoldRooms?: number }[],
  ) => SnapshotSchema.parse({ asOfDate: "2026-10-06", nights });

  it("returns three empty lists for a matching snapshot", () => {
    const result = checkSnapshotAgainstBlock(
      block,
      snapshot(block.nights.map((n) => ({ date: n.date, pickedUpRooms: 1 }))),
    );
    expect(result).toEqual({ missing: [], extra: [], resoldExceeds: [] });
  });

  it("lists missing and extra nights, and nights where resold exceeds contracted", () => {
    const result = checkSnapshotAgainstBlock(
      block,
      snapshot([
        { date: "2026-11-10", pickedUpRooms: 1, resoldRooms: 11 },
        { date: "2026-11-12", pickedUpRooms: 1 },
        { date: "2026-11-20", pickedUpRooms: 1 },
      ]),
    );
    expect(result).toEqual({
      missing: ["2026-11-11"],
      extra: ["2026-11-20"],
      resoldExceeds: ["2026-11-10"],
    });
  });
});

describe("JSON Schema output", () => {
  // M3 builds the Swagger docs from these schemas, so they must convert cleanly.
  it("converts Block (input) and Evaluation (output) to JSON Schema", () => {
    expect(() => z.toJSONSchema(BlockSchema, { io: "input" })).not.toThrow();
    expect(() =>
      z.toJSONSchema(EvaluationSchema, { io: "output" }),
    ).not.toThrow();
  });
});
