# @alihdrndm/blockpace-core

The attrition math behind [blockpace](https://github.com/alihdrndm/blockpace): what a hotel room block contract will charge a group, on a cumulative basis or night by night.

Try it without installing anything: [alihdrndm.github.io/blockpace](https://alihdrndm.github.io/blockpace/) runs this package in your browser.

- **Cumulative and per-night bases.** The same pickup can cost very different amounts, and you get both.
- **Exact money.** Amounts are integer minor units (cents) computed with `BigInt`, percentages are basis points, and rounding happens once, at the end of each formula.
- **The contract details that change the bill:** allowed attrition, damages percentage, tax on damages, resell credit and how the minimum is rounded.
- **Pickup forecast and risk level.** A linear 14-day forecast to the cutoff date, and a risk level of `met`, `on_track`, `at_risk` or `liable`.
- **Zod schemas for every shape**, so you can validate input from forms, files or an API.
- No I/O and no global state. It runs in Node.js 20 or later and in the browser.

## Install

```sh
npm install @alihdrndm/blockpace-core
```

## Example

Four nights, 200 room nights contracted, 15% allowed attrition and damages at 80% of the room rate. The group has picked up 164 room nights.

```ts
import {
  BlockSchema,
  evaluate,
  parseIsoDate,
  SnapshotSchema,
} from "@alihdrndm/blockpace-core";

const block = BlockSchema.parse({
  currency: "USD",
  cutoffDate: "2026-10-12",
  terms: {
    basis: "per_night",
    allowedAttritionPct: 15,
    damagesPct: 80,
    taxPct: 0,
    resellCredit: false,
    minimumRounding: "ceil",
  },
  nights: [
    { date: "2026-11-10", contractedRooms: 45, rateMinor: 18900 },
    { date: "2026-11-11", contractedRooms: 60, rateMinor: 18900 },
    { date: "2026-11-12", contractedRooms: 60, rateMinor: 21900 },
    { date: "2026-11-13", contractedRooms: 35, rateMinor: 21900 },
  ],
});

const snapshot = SnapshotSchema.parse({
  asOfDate: "2026-10-12",
  nights: [
    { date: "2026-11-10", pickedUpRooms: 40, resoldRooms: 0 },
    { date: "2026-11-11", pickedUpRooms: 49, resoldRooms: 0 },
    { date: "2026-11-12", pickedUpRooms: 44, resoldRooms: 0 },
    { date: "2026-11-13", pickedUpRooms: 31, resoldRooms: 0 },
  ],
});

const result = evaluate({
  block,
  snapshots: [snapshot],
  today: parseIsoDate("2026-10-12"),
});

result.totalMinor; // 152880, i.e. $1,528.80
result.nights.map((n) => n.shortfallRooms); // [0, 2, 7, 0]
result.riskLevel; // "liable"
```

Change `basis` to `"cumulative"` and the same pickup costs 97560 ($975.60): on the total, the busy nights cover the two short ones.

## What `evaluate` returns

| Field | Meaning |
|---|---|
| `contractedRoomNights`, `minimumRoomNights`, `pickedUpRoomNights`, `pickupPct` | Totals across the block |
| `resellCredited`, `shortfallRoomNights` | Room nights credited for resold rooms, and the shortfall left after that credit |
| `damagesMinor`, `taxMinor`, `totalMinor` | What the clause charges today, in minor units |
| `daysToCutoff` | Days from `today` to the cutoff date |
| `forecast` | `{ status: "ok", projectedTotalMinor, ... }` with what it is on course to charge at the cutoff date, or `{ status: "unavailable", reason }` when there is no snapshot, the cutoff has passed, or there is too little history |
| `riskLevel` | `met`, `on_track`, `at_risk` or `liable` |
| `nights` | One row per night; on the per-night basis each row also has `minimumRooms` and `shortfallRooms` |

The assumptions behind each formula (for example, the cumulative basis charges the shortfall at the average rate weighted by contracted rooms) are listed in [ASSUMPTIONS.md](https://github.com/alihdrndm/blockpace/blob/main/docs/ASSUMPTIONS.md). This is an estimate: the signed contract always governs.

## License

MIT
