import type { RiskLevel } from "@alihdrndm/blockpace-core";
import Link from "next/link";
import type { ReactNode } from "react";
import { RISK_BADGES } from "../lib/format";
import type { ErrorView } from "../lib/problem";

// Small presentational pieces shared by every page. No state, so they work in server components.

export function RiskBadge({ level }: { level: RiskLevel }) {
  const badge = RISK_BADGES[level];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-medium ring-1 ring-inset ${badge.className}`}
    >
      <span aria-hidden="true">{badge.icon}</span>
      {badge.label}
    </span>
  );
}

export function ErrorPanel({ error }: { error: ErrorView }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-red-700 bg-red-50 p-4 text-red-950"
    >
      <p className="font-semibold">{error.title}</p>
      <p className="mt-1">{error.detail}</p>
      {error.fieldErrors !== undefined && error.fieldErrors.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-sm">
          {error.fieldErrors.map((field) => (
            <li key={`${field.path}:${field.message}`}>
              {field.path === "" ? "Request" : field.path}: {field.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-slate-400 p-6 text-center text-slate-700">
      {children}
    </p>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <p role="status" aria-live="polite" className="p-6 text-slate-700">
      Loading {label}…
    </p>
  );
}

/** A thin bar for pickup %; the number is always printed next to it. */
export function PickupBar({ pct }: { pct: number }) {
  const width = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 text-right tabular-nums">{pct}%</span>
      <div className="h-1.5 w-24 rounded bg-slate-200" aria-hidden="true">
        <div
          className="h-1.5 rounded bg-slate-700"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

export function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-slate-300 p-3">
      <dt className="text-sm text-slate-700">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
      {hint !== undefined && <dd className="text-xs text-slate-700">{hint}</dd>}
    </div>
  );
}

export function ButtonLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
    >
      {children}
    </Link>
  );
}

export const inputClass =
  "rounded-md border border-slate-500 px-2 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-900";

export const buttonClass =
  "rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-slate-700 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900";

export const secondaryButtonClass =
  "rounded-md border border-slate-500 px-3 py-1.5 text-sm transition-colors duration-150 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-900";
