import { z } from "zod";
import {
  compareDates,
  diffDays,
  type IsoDate,
  tryParseIsoDate,
} from "./plain-date.js";

// Zod schemas are the single source of truth for every data shape; types are inferred from them.

// A validated string is already an IsoDate at runtime; the brand exists only in the type.
// No .transform() here: Zod cannot turn a transform into JSON Schema, and the API docs need that.
export const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a calendar date as YYYY-MM-DD")
  .refine(
    (value) => tryParseIsoDate(value) !== undefined,
    "must be a real calendar date (YYYY-MM-DD)",
  ) as unknown as z.ZodType<IsoDate, string>;

// A percentage with at most two decimal places, e.g. 12.5 or 12.25 but not 12.255.
const percent = (max: number) =>
  z
    .number()
    .min(0)
    .max(max)
    .refine(
      (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9,
      "at most 2 decimal places",
    );

export const BasisSchema = z.enum(["cumulative", "per_night"]);
export const MinimumRoundingSchema = z.enum(["ceil", "floor", "round"]);

export const AttritionTermsSchema = z.strictObject({
  basis: BasisSchema,
  allowedAttritionPct: percent(100),
  damagesPct: percent(100).default(100),
  taxPct: percent(50).default(0),
  resellCredit: z.boolean().default(false),
  // B2: ceil is the cautious default for the planner.
  minimumRounding: MinimumRoundingSchema.default("ceil"),
});

export const BlockNightSchema = z.strictObject({
  date: IsoDateSchema,
  contractedRooms: z.number().int().min(0).max(5000),
  rateMinor: z.number().int().min(0).max(10_000_000),
});

export const MAX_NIGHTS = 60;

/**
 * The night rules shared by every schema that carries nights (the calculator, block creation).
 * Exposed as a function because Zod refinements cannot be re-applied after `.extend()`.
 */
export function refineBlockNights(
  nights: { date: IsoDate; contractedRooms: number }[],
  cutoffDate: IsoDate | undefined,
  ctx: z.RefinementCtx,
): void {
  const fail = (message: string, path: (string | number)[]) =>
    ctx.addIssue({ code: "custom", message, path });

  if (nights.length < 1 || nights.length > MAX_NIGHTS) {
    fail(`a block has 1 to ${MAX_NIGHTS} nights`, ["nights"]);
    return;
  }
  const dates = nights.map((night) => night.date).sort(compareDates);
  const first = dates[0] as IsoDate;
  dates.forEach((date, i) => {
    if (i === 0) return;
    const previous = dates[i - 1] as IsoDate;
    if (date === previous) fail(`duplicate night ${date}`, ["nights"]);
    else if (diffDays(date, previous) !== 1) {
      fail(`nights are not consecutive at ${date}`, ["nights"]);
    }
  });
  if (!nights.some((night) => night.contractedRooms > 0)) {
    fail("at least one night must have contractedRooms above 0", ["nights"]);
  }
  if (cutoffDate !== undefined && compareDates(cutoffDate, first) > 0) {
    fail("cutoffDate must not be after the first night", ["cutoffDate"]);
  }
}

export const BlockSchema = z
  .strictObject({
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, "must be a 3-letter uppercase currency code"),
    cutoffDate: IsoDateSchema,
    terms: AttritionTermsSchema,
    nights: z.array(BlockNightSchema),
  })
  .superRefine((block, ctx) =>
    refineBlockNights(block.nights, block.cutoffDate, ctx),
  );

export const SnapshotNightSchema = z.strictObject({
  date: IsoDateSchema,
  pickedUpRooms: z.number().int().min(0).max(10_000),
  resoldRooms: z.number().int().min(0).default(0),
});

export const SnapshotSchema = z
  .strictObject({
    asOfDate: IsoDateSchema,
    nights: z.array(SnapshotNightSchema),
  })
  .superRefine((snapshot, ctx) => {
    const seen = new Set<string>();
    for (const night of snapshot.nights) {
      if (seen.has(night.date)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate night ${night.date}`,
          path: ["nights"],
        });
      }
      seen.add(night.date);
    }
  });

export const RiskLevelSchema = z.enum(["met", "on_track", "at_risk", "liable"]);

export const ForecastSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("unavailable"),
    reason: z.enum(["NO_SNAPSHOT", "PAST_CUTOFF", "INSUFFICIENT_HISTORY"]),
  }),
  z.strictObject({
    status: z.literal("ok"),
    method: z.literal("linear-14d"),
    referenceAsOf: IsoDateSchema,
    projectedPickupRoomNights: z.number().int(),
    projectedShortfallRoomNights: z.number().int(),
    projectedDamagesMinor: z.number().int(),
    projectedTotalMinor: z.number().int(),
  }),
]);

export const EvaluationNightSchema = z.strictObject({
  date: IsoDateSchema,
  contractedRooms: z.number().int(),
  rateMinor: z.number().int(),
  pickedUpRooms: z.number().int(),
  resoldRooms: z.number().int(),
  // Only present on the per_night basis.
  minimumRooms: z.number().int().optional(),
  shortfallRooms: z.number().int().optional(),
});

export const EvaluationSchema = z.strictObject({
  asOf: IsoDateSchema,
  snapshotAsOf: IsoDateSchema.optional(),
  currency: z.string(),
  basis: BasisSchema,
  contractedRoomNights: z.number().int(),
  minimumRoomNights: z.number().int(),
  pickedUpRoomNights: z.number().int(),
  pickupPct: z.number(),
  shortfallBeforeCredit: z.number().int(),
  resellCredited: z.number().int(),
  shortfallRoomNights: z.number().int(),
  damagesMinor: z.number().int(),
  taxMinor: z.number().int(),
  totalMinor: z.number().int(),
  daysToCutoff: z.number().int(),
  nights: z.array(EvaluationNightSchema),
  forecast: ForecastSchema,
  riskLevel: RiskLevelSchema,
});

export type AttritionTerms = z.output<typeof AttritionTermsSchema>;
export type BlockNight = z.output<typeof BlockNightSchema>;
export type Block = z.output<typeof BlockSchema>;
export type Snapshot = z.output<typeof SnapshotSchema>;
export type Forecast = z.output<typeof ForecastSchema>;
export type RiskLevel = z.output<typeof RiskLevelSchema>;
export type Evaluation = z.output<typeof EvaluationSchema>;
export type EvaluationNight = z.output<typeof EvaluationNightSchema>;

export interface SnapshotMismatch {
  /** Block nights the snapshot does not cover. */
  missing: IsoDate[];
  /** Snapshot nights the block does not have. */
  extra: IsoDate[];
  /** Nights where resoldRooms is more than the contracted rooms. */
  resoldExceeds: IsoDate[];
}

/** Compares a snapshot against its block; all three lists empty means the snapshot is valid. */
export function checkSnapshotAgainstBlock(
  block: Pick<Block, "nights">,
  snapshot: Snapshot,
): SnapshotMismatch {
  const contracted = new Map(
    block.nights.map((n) => [n.date, n.contractedRooms]),
  );
  const seen = new Set(snapshot.nights.map((n) => n.date));
  return {
    missing: [...contracted.keys()]
      .filter((date) => !seen.has(date))
      .sort(compareDates),
    extra: [...seen].filter((date) => !contracted.has(date)).sort(compareDates),
    resoldExceeds: snapshot.nights
      .filter(
        (n) =>
          n.resoldRooms > (contracted.get(n.date) ?? Number.POSITIVE_INFINITY),
      )
      .map((n) => n.date)
      .sort(compareDates),
  };
}
