import {
  AttritionTermsSchema,
  BlockSchema,
  type Evaluation,
  evaluate,
  type IsoDate,
  SnapshotSchema,
} from "@alihdrndm/blockpace-core";

// Turns what the planner typed into the core library's inputs and runs both bases.
// Everything happens in the browser: the page has no server and sends nothing anywhere.

export interface NightInput {
  date: string;
  contractedRooms: number;
  /** Major units as typed, e.g. 189 for $189.00. */
  rate: number;
  pickedUpRooms: number;
  resoldRooms: number;
}

export interface CalculatorInput {
  currency: string;
  allowedAttritionPct: number;
  damagesPct: number;
  taxPct: number;
  resellCredit: boolean;
  minimumRounding: "ceil" | "floor" | "round";
  nights: NightInput[];
}

export type Outcome =
  | { ok: true; cumulative: Evaluation; perNight: Evaluation }
  | { ok: false; problems: string[] };

/** How many minor units a currency has: 2 for USD, 0 for JPY, 3 for KWD. */
export function minorDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

export function toMinor(major: number, currency: string): number {
  return Math.round(major * 10 ** minorDigits(currency));
}

export function formatMoney(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(minor / 10 ** minorDigits(currency));
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

// The shape of a Zod error, written out so this app does not need zod as its own dependency.
interface IssueList {
  issues: { path: PropertyKey[]; message: string }[];
}

const describe = (error: IssueList): string[] =>
  error.issues.map((issue) => {
    const where = issue.path.map(String).join(".");
    return where === "" ? issue.message : `${where}: ${issue.message}`;
  });

export function calculate(input: CalculatorInput): Outcome {
  const currency = input.currency.trim().toUpperCase();
  const dates = input.nights.map((n) => n.date).sort();
  const firstNight = dates[0];
  if (firstNight === undefined)
    return { ok: false, problems: ["Add at least one night."] };

  const over = input.nights.filter((n) => n.resoldRooms > n.contractedRooms);
  if (over.length > 0) {
    return {
      ok: false,
      problems: over.map(
        (n) => `${n.date}: resold rooms cannot exceed contracted rooms.`,
      ),
    };
  }

  const run = (basis: "cumulative" | "per_night") => {
    const terms = AttritionTermsSchema.safeParse({
      basis,
      allowedAttritionPct: input.allowedAttritionPct,
      damagesPct: input.damagesPct,
      taxPct: input.taxPct,
      resellCredit: input.resellCredit,
      minimumRounding: input.minimumRounding,
    });
    if (!terms.success) return { problems: describe(terms.error) };

    // The calculator has no timeline, so the cutoff and "today" are both the first night.
    const block = BlockSchema.safeParse({
      currency,
      cutoffDate: firstNight,
      terms: terms.data,
      nights: input.nights.map((n) => ({
        date: n.date,
        contractedRooms: n.contractedRooms,
        rateMinor: toMinor(n.rate, currency),
      })),
    });
    if (!block.success) return { problems: describe(block.error) };

    const snapshot = SnapshotSchema.safeParse({
      asOfDate: firstNight,
      nights: input.nights.map((n) => ({
        date: n.date,
        pickedUpRooms: n.pickedUpRooms,
        resoldRooms: input.resellCredit ? n.resoldRooms : 0,
      })),
    });
    if (!snapshot.success) return { problems: describe(snapshot.error) };

    return {
      evaluation: evaluate({
        block: block.data,
        snapshots: [snapshot.data],
        today: firstNight as IsoDate,
      }),
    };
  };

  const cumulative = run("cumulative");
  const perNight = run("per_night");
  if ("problems" in cumulative)
    return { ok: false, problems: cumulative.problems };
  if ("problems" in perNight) return { ok: false, problems: perNight.problems };
  return {
    ok: true,
    cumulative: cumulative.evaluation,
    perNight: perNight.evaluation,
  };
}

/** Worked example WE2 from the project spec: the numbers the README and social preview quote. */
export const EXAMPLE: CalculatorInput = {
  currency: "USD",
  allowedAttritionPct: 15,
  damagesPct: 80,
  taxPct: 0,
  resellCredit: false,
  minimumRounding: "ceil",
  nights: [
    {
      date: "2026-11-10",
      contractedRooms: 45,
      rate: 189,
      pickedUpRooms: 40,
      resoldRooms: 0,
    },
    {
      date: "2026-11-11",
      contractedRooms: 60,
      rate: 189,
      pickedUpRooms: 49,
      resoldRooms: 0,
    },
    {
      date: "2026-11-12",
      contractedRooms: 60,
      rate: 219,
      pickedUpRooms: 44,
      resoldRooms: 0,
    },
    {
      date: "2026-11-13",
      contractedRooms: 35,
      rate: 219,
      pickedUpRooms: 31,
      resoldRooms: 0,
    },
  ],
};
