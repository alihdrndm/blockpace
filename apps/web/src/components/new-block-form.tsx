"use client";

import { eachNight, tryParseIsoDate } from "@alihdrndm/blockpace-core";
import { useActionState, useState } from "react";
import { createBlock, type FormState } from "../app/actions";
import { DEFAULT_TERMS, TermsFields } from "./terms-fields";
import { buttonClass, ErrorPanel, inputClass } from "./ui";

const IDLE: FormState = { status: "idle" };

interface NightInput {
  contracted: string;
  rate: string;
}

/**
 * New block: the grid of nights is generated from the first night and the number of nights.
 * Every field is controlled: React resets uncontrolled fields after a form action, even when
 * the API rejects it, so a validation error would otherwise wipe the whole form.
 */
export function NewBlockForm() {
  const [state, formAction, pending] = useActionState(createBlock, IDLE);
  const [name, setName] = useState("");
  const [hotelName, setHotelName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [firstNight, setFirstNight] = useState("");
  const [count, setCount] = useState("3");
  const [cutoffDate, setCutoffDate] = useState("");
  const [terms, setTerms] = useState(DEFAULT_TERMS);
  const [grid, setGrid] = useState<Record<string, NightInput>>({});

  const first = tryParseIsoDate(firstNight);
  const nightCount = Number(count);
  const dates =
    first !== undefined &&
    Number.isInteger(nightCount) &&
    nightCount >= 1 &&
    nightCount <= 60
      ? eachNight(first, nightCount)
      : [];
  const cell = (date: string) => grid[date] ?? { contracted: "", rate: "" };
  const setCell = (date: string, key: keyof NightInput, value: string) =>
    setGrid((current) => ({
      ...current,
      [date]: { ...cell(date), [key]: value },
    }));

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          id="name"
          label="Block name"
          value={name}
          onChange={setName}
          maxLength={120}
        />
        <Field
          id="hotelName"
          label="Hotel"
          value={hotelName}
          onChange={setHotelName}
          maxLength={120}
        />
        <Field
          id="currency"
          label="Currency (3 letters)"
          value={currency}
          onChange={setCurrency}
          pattern="[A-Za-z]{3}"
          maxLength={3}
        />
        <Field
          id="firstNight"
          label="First night"
          type="date"
          value={firstNight}
          onChange={setFirstNight}
        />
        <div>
          <label htmlFor="nightCount" className="block text-sm font-medium">
            Number of nights
          </label>
          <input
            id="nightCount"
            name="nightCount"
            type="number"
            min={1}
            max={60}
            required
            value={count}
            onChange={(e) => setCount(e.target.value)}
            className={`${inputClass} w-24`}
          />
        </div>
        <Field
          id="cutoffDate"
          label="Cutoff date"
          type="date"
          value={cutoffDate}
          onChange={setCutoffDate}
        />
      </div>

      <TermsFields value={terms} onChange={setTerms} />

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Nights</legend>
        {dates.length === 0 ? (
          <p className="text-sm text-slate-700">
            Pick the first night and the number of nights to fill in the grid.
          </p>
        ) : (
          <table className="text-sm">
            <thead>
              <tr>
                <th scope="col" className="pr-3 text-left">
                  Night
                </th>
                <th scope="col" className="pr-3 text-left">
                  Contracted rooms
                </th>
                <th scope="col" className="text-left">
                  Rate
                </th>
              </tr>
            </thead>
            <tbody>
              {dates.map((date) => (
                <tr key={date}>
                  <th scope="row" className="pr-3 text-left font-normal">
                    {date}
                    <input type="hidden" name="nightDate" value={date} />
                  </th>
                  <td className="pr-3">
                    <label className="sr-only" htmlFor={`contracted-${date}`}>
                      Contracted rooms on {date}
                    </label>
                    <input
                      id={`contracted-${date}`}
                      name={`contracted-${date}`}
                      type="number"
                      min={0}
                      max={5000}
                      step={1}
                      required
                      value={cell(date).contracted}
                      onChange={(e) =>
                        setCell(date, "contracted", e.target.value)
                      }
                      className={`${inputClass} w-24`}
                    />
                  </td>
                  <td>
                    <label className="sr-only" htmlFor={`rate-${date}`}>
                      Rate on {date} (major units, for example 189.00)
                    </label>
                    <input
                      id={`rate-${date}`}
                      name={`rate-${date}`}
                      inputMode="decimal"
                      placeholder="189.00"
                      required
                      value={cell(date).rate}
                      onChange={(e) => setCell(date, "rate", e.target.value)}
                      className={`${inputClass} w-28`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </fieldset>

      <button
        type="submit"
        className={buttonClass}
        disabled={pending || dates.length === 0}
      >
        {pending ? "Creating…" : "Create block"}
      </button>
      {state.status === "error" && <ErrorPanel error={state.error} />}
    </form>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  pattern,
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  type?: string;
  pattern?: string;
  maxLength?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
        {...(pattern === undefined ? {} : { pattern })}
        {...(maxLength === undefined ? {} : { maxLength })}
      />
    </div>
  );
}
