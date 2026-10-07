"use client";

import {
  type Evaluation,
  eachNight,
  tryParseIsoDate,
} from "@alihdrndm/blockpace-core";
import { useState } from "react";
import { formatMoney, formatPct, majorToMinor } from "../lib/format";
import type { ErrorView } from "../lib/problem";
import { DEFAULT_TERMS, TermsFields, type TermsValue } from "./terms-fields";
import {
  buttonClass,
  ErrorPanel,
  inputClass,
  RiskBadge,
  secondaryButtonClass,
} from "./ui";

interface Row {
  contracted: string;
  rate: string;
  pickedUp: string;
  resold: string;
}

const EMPTY_ROW: Row = { contracted: "", rate: "", pickedUp: "", resold: "0" };

// WE2 from the project spec: 4 nights, mixed rates, 15% attrition, 80% damages.
const EXAMPLE = {
  firstNight: "2026-11-10",
  count: "4",
  terms: {
    ...DEFAULT_TERMS,
    allowedAttritionPct: "15",
    damagesPct: "80",
  } satisfies TermsValue,
  rows: {
    "2026-11-10": {
      contracted: "45",
      rate: "189.00",
      pickedUp: "40",
      resold: "0",
    },
    "2026-11-11": {
      contracted: "60",
      rate: "189.00",
      pickedUp: "49",
      resold: "0",
    },
    "2026-11-12": {
      contracted: "60",
      rate: "219.00",
      pickedUp: "44",
      resold: "0",
    },
    "2026-11-13": {
      contracted: "35",
      rate: "219.00",
      pickedUp: "31",
      resold: "0",
    },
  } as Record<string, Row>,
};

type Outcome =
  | { ok: true; evaluation: Evaluation }
  | { ok: false; error: ErrorView };

const BASES = [
  { basis: "cumulative", title: "Cumulative basis" },
  { basis: "per_night", title: "Per-night basis" },
] as const;

/** Stateless what-if calculator: one grid, evaluated on both bases side by side. */
export function Calculator() {
  const [currency, setCurrency] = useState("USD");
  const [firstNight, setFirstNight] = useState("");
  const [count, setCount] = useState("3");
  const [terms, setTerms] = useState<TermsValue>(DEFAULT_TERMS);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [results, setResults] = useState<Record<string, Outcome>>({});
  const [inputError, setInputError] = useState<ErrorView | undefined>();
  const [pending, setPending] = useState(false);

  const first = tryParseIsoDate(firstNight);
  const n = Number(count);
  const dates =
    first !== undefined && Number.isInteger(n) && n >= 1 && n <= 60
      ? eachNight(first, n)
      : [];
  const row = (date: string) => rows[date] ?? EMPTY_ROW;
  const setCell = (date: string, key: keyof Row, value: string) =>
    setRows((current) => ({
      ...current,
      [date]: { ...(current[date] ?? EMPTY_ROW), [key]: value },
    }));

  function loadExample() {
    setCurrency("USD");
    setFirstNight(EXAMPLE.firstNight);
    setCount(EXAMPLE.count);
    setTerms(EXAMPLE.terms);
    setRows(EXAMPLE.rows);
    setResults({});
    setInputError(undefined);
  }

  async function calculate() {
    const nights: {
      date: string;
      contractedRooms: number;
      rateMinor: number;
      pickedUpRooms: number;
      resoldRooms: number;
    }[] = [];
    for (const date of dates) {
      const r = row(date);
      const rateMinor = majorToMinor(r.rate);
      const numbers = [
        r.contracted,
        r.pickedUp,
        terms.resellCredit ? r.resold : "0",
      ];
      if (
        rateMinor === undefined ||
        numbers.some((v) => !/^\d+$/.test(v.trim()))
      ) {
        setInputError({
          title: "Check the grid",
          detail: `Every night needs whole numbers and a rate like 189.00 (see ${date}).`,
        });
        return;
      }
      nights.push({
        date,
        contractedRooms: Number(r.contracted),
        rateMinor,
        pickedUpRooms: Number(r.pickedUp),
        resoldRooms: terms.resellCredit ? Number(r.resold) : 0,
      });
    }
    if (nights.length === 0) {
      setInputError({
        title: "Check the grid",
        detail: "Pick a first night and a number of nights.",
      });
      return;
    }
    setInputError(undefined);
    setPending(true);

    const request = (basis: "cumulative" | "per_night") => ({
      currency: currency.toUpperCase(),
      terms: {
        basis,
        allowedAttritionPct: Number(terms.allowedAttritionPct),
        damagesPct: Number(terms.damagesPct),
        taxPct: Number(terms.taxPct),
        resellCredit: terms.resellCredit,
        minimumRounding: terms.minimumRounding,
      },
      nights,
    });
    // The same request twice, once per basis, so the two bills can be compared.
    const outcomes = await Promise.all(
      BASES.map((b) => post(request(b.basis))),
    );
    setResults(
      Object.fromEntries(
        BASES.map((b, i) => [b.basis, outcomes[i] as Outcome]),
      ),
    );
    setPending(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="calc-currency" className="block text-sm font-medium">
            Currency
          </label>
          <input
            id="calc-currency"
            value={currency}
            maxLength={3}
            onChange={(e) => setCurrency(e.target.value)}
            className={`${inputClass} w-20`}
          />
        </div>
        <div>
          <label htmlFor="calc-first" className="block text-sm font-medium">
            First night
          </label>
          <input
            id="calc-first"
            type="date"
            value={firstNight}
            onChange={(e) => setFirstNight(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="calc-count" className="block text-sm font-medium">
            Number of nights
          </label>
          <input
            id="calc-count"
            type="number"
            min={1}
            max={60}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            className={`${inputClass} w-24`}
          />
        </div>
        <button
          type="button"
          onClick={loadExample}
          className={secondaryButtonClass}
        >
          Load example
        </button>
      </div>

      <TermsFields value={terms} onChange={setTerms} withBasis={false} />

      {dates.length > 0 && (
        <table className="text-sm">
          <caption className="sr-only">
            Nights, contracted rooms, rates and pickup
          </caption>
          <thead>
            <tr>
              <th scope="col" className="pr-3 text-left">
                Night
              </th>
              <th scope="col" className="pr-3 text-left">
                Contracted
              </th>
              <th scope="col" className="pr-3 text-left">
                Rate
              </th>
              <th scope="col" className="pr-3 text-left">
                Picked up
              </th>
              {terms.resellCredit && (
                <th scope="col" className="text-left">
                  Resold
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {dates.map((date) => (
              <tr key={date}>
                <th scope="row" className="pr-3 text-left font-normal">
                  {date}
                </th>
                <Cell
                  label={`Contracted rooms on ${date}`}
                  value={row(date).contracted}
                  onChange={(v) => setCell(date, "contracted", v)}
                />
                <Cell
                  label={`Rate on ${date}`}
                  value={row(date).rate}
                  onChange={(v) => setCell(date, "rate", v)}
                  placeholder="189.00"
                />
                <Cell
                  label={`Picked up on ${date}`}
                  value={row(date).pickedUp}
                  onChange={(v) => setCell(date, "pickedUp", v)}
                />
                {terms.resellCredit && (
                  <Cell
                    label={`Resold on ${date}`}
                    value={row(date).resold}
                    onChange={(v) => setCell(date, "resold", v)}
                  />
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button
        type="button"
        onClick={calculate}
        disabled={pending}
        className={buttonClass}
      >
        {pending ? "Calculating…" : "Calculate"}
      </button>
      {inputError !== undefined && <ErrorPanel error={inputError} />}

      {Object.keys(results).length > 0 && (
        <div className="grid gap-4 md:grid-cols-2" aria-live="polite">
          {BASES.map((b) => (
            <ResultPanel
              key={b.basis}
              title={b.title}
              outcome={results[b.basis]}
              currency={currency.toUpperCase()}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Cell({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <td className="pr-3">
      <input
        aria-label={label}
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} w-24`}
      />
    </td>
  );
}

function ResultPanel({
  title,
  outcome,
  currency,
}: {
  title: string;
  outcome: Outcome | undefined;
  currency: string;
}) {
  const headingId = `result-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-md border border-slate-300 p-4"
    >
      <h2 id={headingId} className="mb-2 text-lg font-semibold">
        {title}
      </h2>
      {outcome === undefined ? null : !outcome.ok ? (
        <ErrorPanel error={outcome.error} />
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt>Risk</dt>
          <dd>
            <RiskBadge level={outcome.evaluation.riskLevel} />
          </dd>
          <dt>Minimum</dt>
          <dd className="tabular-nums">
            {outcome.evaluation.minimumRoomNights} room nights
          </dd>
          <dt>Picked up</dt>
          <dd className="tabular-nums">
            {outcome.evaluation.pickedUpRoomNights} (
            {formatPct(outcome.evaluation.pickupPct)})
          </dd>
          <dt>Shortfall</dt>
          <dd className="tabular-nums">
            {outcome.evaluation.shortfallRoomNights} room nights
          </dd>
          <dt>Damages</dt>
          <dd className="tabular-nums">
            {formatMoney(outcome.evaluation.damagesMinor, currency)}
          </dd>
          <dt>Tax</dt>
          <dd className="tabular-nums">
            {formatMoney(outcome.evaluation.taxMinor, currency)}
          </dd>
          <dt className="font-semibold">Total owed</dt>
          <dd className="font-semibold tabular-nums">
            {formatMoney(outcome.evaluation.totalMinor, currency)}
          </dd>
        </dl>
      )}
    </section>
  );
}

async function post(body: unknown): Promise<Outcome> {
  try {
    const response = await fetch("/api/calculate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json: unknown = await response.json();
    if (!response.ok) {
      const p = json as {
        title?: string;
        detail?: string;
        errors?: { path: string; message: string }[];
      };
      return {
        ok: false,
        error: {
          title: p.title ?? "Calculation failed",
          detail: p.detail ?? `Status ${response.status}`,
          ...(p.errors !== undefined && p.errors.length > 0
            ? { fieldErrors: p.errors }
            : {}),
        },
      };
    }
    return { ok: true, evaluation: json as Evaluation };
  } catch {
    return {
      ok: false,
      error: {
        title: "Calculation failed",
        detail: "The dashboard server did not answer.",
      },
    };
  }
}
