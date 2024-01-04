import { readFileSync } from "node:fs";
import {
  type Block,
  BlockSchema,
  type Snapshot,
  SnapshotSchema,
} from "../model.js";
import type { IsoDate } from "../plain-date.js";

// Loads the worked-example JSON from /fixtures and turns a case or variant into validated inputs.
// Parsing through the real schemas means every example also exercises BlockSchema/SnapshotSchema.

export interface FixtureCase {
  name: string;
  terms: { basis: "cumulative" | "per_night" };
  expected: Record<string, unknown>;
}

export interface Overrides {
  terms?: Record<string, unknown>;
  resoldRooms?: Record<string, number>;
}

export interface Fixture {
  id: string;
  block: Record<string, unknown> & { terms: Record<string, unknown> };
  snapshots: {
    asOfDate: string;
    nights: { date: string; pickedUpRooms: number }[];
  }[];
  today: string;
  cases: FixtureCase[];
  variants?: { id: string; overrides: Overrides; cases: FixtureCase[] }[];
}

export function loadFixture(name: string): Fixture {
  const url = new URL(`../../../../fixtures/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as Fixture;
}

/** The case at `index`, or a clear error (keeps tests free of non-null assertions). */
export function caseAt(cases: FixtureCase[], index: number): FixtureCase {
  const found = cases[index];
  if (found === undefined) throw new Error(`fixture has no case ${index}`);
  return found;
}

export function variantOf(
  fixture: Fixture,
  id: string,
): NonNullable<Fixture["variants"]>[number] {
  const found = fixture.variants?.find((v) => v.id === id);
  if (found === undefined)
    throw new Error(`fixture ${fixture.id} has no variant ${id}`);
  return found;
}

export function buildInputs(
  fixture: Fixture,
  testCase: FixtureCase,
  overrides: Overrides = {},
): { block: Block; snapshots: Snapshot[]; today: IsoDate } {
  const block = BlockSchema.parse({
    ...fixture.block,
    terms: { ...fixture.block.terms, ...overrides.terms, ...testCase.terms },
  });
  const snapshots = fixture.snapshots.map((snapshot) =>
    SnapshotSchema.parse({
      ...snapshot,
      nights: snapshot.nights.map((night) => ({
        ...night,
        resoldRooms: overrides.resoldRooms?.[night.date] ?? 0,
      })),
    }),
  );
  return { block, snapshots, today: fixture.today as IsoDate };
}
