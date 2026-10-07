"use client";

import { inputClass } from "./ui";

export interface TermsValue {
  basis: "cumulative" | "per_night";
  allowedAttritionPct: string;
  damagesPct: string;
  taxPct: string;
  resellCredit: boolean;
  minimumRounding: "ceil" | "floor" | "round";
}

export const DEFAULT_TERMS: TermsValue = {
  basis: "cumulative",
  allowedAttritionPct: "15",
  damagesPct: "100",
  taxPct: "0",
  resellCredit: false,
  minimumRounding: "ceil",
};

/**
 * The attrition-terms inputs shared by "New block" and the calculator. Controlled, so the
 * calculator can react to "resell credit" (it shows the resold column).
 * `withBasis` is false in the calculator, which always shows both bases side by side.
 */
export function TermsFields({
  value,
  onChange,
  withBasis = true,
}: {
  value: TermsValue;
  onChange: (next: TermsValue) => void;
  withBasis?: boolean;
}) {
  const set = <K extends keyof TermsValue>(key: K, next: TermsValue[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <fieldset className="grid gap-3 sm:grid-cols-3">
      <legend className="mb-2 text-sm font-semibold">Attrition terms</legend>
      {withBasis && (
        <div>
          <label htmlFor="basis" className="block text-sm font-medium">
            Basis
          </label>
          <select
            id="basis"
            name="basis"
            value={value.basis}
            onChange={(e) =>
              set("basis", e.target.value as TermsValue["basis"])
            }
            className={inputClass}
          >
            <option value="cumulative">Cumulative (all nights together)</option>
            <option value="per_night">Per night (each night separately)</option>
          </select>
        </div>
      )}
      <PercentField
        id="allowedAttritionPct"
        label="Allowed attrition %"
        value={value.allowedAttritionPct}
        max={100}
        onChange={(v) => set("allowedAttritionPct", v)}
      />
      <PercentField
        id="damagesPct"
        label="Damages % of rate"
        value={value.damagesPct}
        max={100}
        onChange={(v) => set("damagesPct", v)}
      />
      <PercentField
        id="taxPct"
        label="Tax % on damages"
        value={value.taxPct}
        max={50}
        onChange={(v) => set("taxPct", v)}
      />
      <div>
        <label htmlFor="minimumRounding" className="block text-sm font-medium">
          Round the minimum
        </label>
        <select
          id="minimumRounding"
          name="minimumRounding"
          value={value.minimumRounding}
          onChange={(e) =>
            set(
              "minimumRounding",
              e.target.value as TermsValue["minimumRounding"],
            )
          }
          className={inputClass}
        >
          <option value="ceil">Up (cautious)</option>
          <option value="floor">Down</option>
          <option value="round">To nearest</option>
        </select>
      </div>
      <div className="flex items-center gap-2 pt-5">
        <input
          id="resellCredit"
          name="resellCredit"
          type="checkbox"
          checked={value.resellCredit}
          onChange={(e) => set("resellCredit", e.target.checked)}
        />
        <label htmlFor="resellCredit" className="text-sm font-medium">
          Hotel credits resold rooms
        </label>
      </div>
    </fieldset>
  );
}

function PercentField({
  id,
  label,
  value,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  max: number;
  onChange: (next: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="number"
        min={0}
        max={max}
        step={0.01}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} w-28`}
      />
    </div>
  );
}
