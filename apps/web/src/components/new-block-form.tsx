"use client";

import { eachNight, tryParseIsoDate } from "@alihdrndm/blockpace-core";
import { useActionState, useState } from "react";
import { createBlock, type FormState } from "../app/actions";
import { DEFAULT_TERMS, TermsFields } from "./terms-fields";
import { buttonClass, ErrorPanel, inputClass } from "./ui";

const IDLE: FormState = { status: "idle" };

/** New block: the grid of nights is generated from the first night and the number of nights. */
export function NewBlockForm() {
  const [state, formAction, pending] = useActionState(createBlock, IDLE);
  const [firstNight, setFirstNight] = useState("");
  const [count, setCount] = useState("3");
  const [terms, setTerms] = useState(DEFAULT_TERMS);

  const first = tryParseIsoDate(firstNight);
  const nightCount = Number(count);
  const dates =
    first !== undefined &&
    Number.isInteger(nightCount) &&
    nightCount >= 1 &&
    nightCount <= 60
      ? eachNight(first, nightCount)
      : [];

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="name" label="Block name" required maxLength={120} />
        <Field id="hotelName" label="Hotel" required maxLength={120} />
        <Field
          id="currency"
          label="Currency (3 letters)"
          required
          defaultValue="USD"
          pattern="[A-Za-z]{3}"
          maxLength={3}
        />
        <div>
          <label htmlFor="firstNight" className="block text-sm font-medium">
            First night
          </label>
          <input
            id="firstNight"
            name="firstNight"
            type="date"
            required
            value={firstNight}
            onChange={(e) => setFirstNight(e.target.value)}
            className={inputClass}
          />
        </div>
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
        <Field id="cutoffDate" label="Cutoff date" type="date" required />
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
  type = "text",
  ...rest
}: {
  id: string;
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  pattern?: string;
  maxLength?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input id={id} name={id} type={type} className={inputClass} {...rest} />
    </div>
  );
}
