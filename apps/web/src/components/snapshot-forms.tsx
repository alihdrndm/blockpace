"use client";

import { useActionState, useState } from "react";
import { type FormState, importCsv, recordSnapshot } from "../app/actions";
import { buttonClass, ErrorPanel, inputClass } from "./ui";

const IDLE: FormState = { status: "idle" };

function Result({ state }: { state: FormState }) {
  if (state.status === "error") return <ErrorPanel error={state.error} />;
  if (state.status === "ok") {
    return (
      <p role="status" className="text-green-900">
        {state.message}
      </p>
    );
  }
  return null;
}

/** "Record snapshot": one number per night, prefilled from the latest snapshot. */
export function RecordSnapshotForm({
  blockId,
  today,
  nights,
  withResold,
}: {
  blockId: string;
  today: string;
  nights: { date: string; pickedUpRooms: number; resoldRooms: number }[];
  withResold: boolean;
}) {
  const action = recordSnapshot.bind(
    null,
    blockId,
    nights.map((n) => n.date),
    withResold,
  );
  const [state, formAction, pending] = useActionState(action, IDLE);
  // Controlled inputs: React resets uncontrolled fields after a form action, even when the API
  // rejects it, so a 422 would otherwise wipe what the planner typed.
  const [asOfDate, setAsOfDate] = useState(today);
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      nights.map((n) => [
        n.date,
        { picked: String(n.pickedUpRooms), resold: String(n.resoldRooms) },
      ]),
    ),
  );
  const inputsFor = (date: string) =>
    values[date] ?? { picked: "", resold: "0" };
  const setValue = (date: string, key: "picked" | "resold", next: string) =>
    setValues((current) => ({
      ...current,
      [date]: { ...inputsFor(date), [key]: next },
    }));

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor="asOfDate" className="block text-sm font-medium">
          As-of date
        </label>
        <input
          id="asOfDate"
          name="asOfDate"
          type="date"
          value={asOfDate}
          onChange={(e) => setAsOfDate(e.target.value)}
          required
          className={inputClass}
        />
      </div>
      <table className="text-sm">
        <thead>
          <tr>
            <th scope="col" className="pr-3 text-left">
              Night
            </th>
            <th scope="col" className="pr-3 text-left">
              Picked up
            </th>
            {withResold && (
              <th scope="col" className="text-left">
                Resold
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {nights.map((night) => (
            <tr key={night.date}>
              <th scope="row" className="pr-3 text-left font-normal">
                {night.date}
              </th>
              <td className="pr-3">
                <label className="sr-only" htmlFor={`picked-${night.date}`}>
                  Picked up on {night.date}
                </label>
                <input
                  id={`picked-${night.date}`}
                  name={`picked-${night.date}`}
                  type="number"
                  min={0}
                  step={1}
                  required
                  value={inputsFor(night.date).picked}
                  onChange={(e) =>
                    setValue(night.date, "picked", e.target.value)
                  }
                  className={`${inputClass} w-24`}
                />
              </td>
              {withResold && (
                <td>
                  <label className="sr-only" htmlFor={`resold-${night.date}`}>
                    Resold on {night.date}
                  </label>
                  <input
                    id={`resold-${night.date}`}
                    name={`resold-${night.date}`}
                    type="number"
                    min={0}
                    step={1}
                    required
                    value={inputsFor(night.date).resold}
                    onChange={(e) =>
                      setValue(night.date, "resold", e.target.value)
                    }
                    className={`${inputClass} w-24`}
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "Saving…" : "Record snapshot"}
      </button>
      <Result state={state} />
    </form>
  );
}

/** "Import CSV": as_of_date,night,picked_up[,resold]; the API accepts all rows or none. */
export function ImportCsvForm({ blockId }: { blockId: string }) {
  const [state, formAction, pending] = useActionState(
    importCsv.bind(null, blockId),
    IDLE,
  );
  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor="csv-file" className="block text-sm font-medium">
          CSV file (as_of_date, night, picked_up, optional resold; up to 1 MB)
        </label>
        <input
          id="csv-file"
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
          className="mt-1 text-sm"
        />
      </div>
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "Importing…" : "Import CSV"}
      </button>
      <Result state={state} />
    </form>
  );
}
