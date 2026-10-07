import Link from "next/link";
import type { ReactNode } from "react";
import { PaceChart } from "../../../components/pace-chart";
import {
  ImportCsvForm,
  RecordSnapshotForm,
} from "../../../components/snapshot-forms";
import {
  EmptyState,
  ErrorPanel,
  RiskBadge,
  Tile,
} from "../../../components/ui";
import { api, today } from "../../../lib/api";
import {
  cutoffWording,
  formatMoney,
  formatPct,
  termsSentence,
} from "../../../lib/format";
import { type ErrorView, errorView } from "../../../lib/problem";

export const dynamic = "force-dynamic";

type Result<T> = { ok: true; value: T } | { ok: false; error: ErrorView };

/** Each section loads on its own, so one failing call shows an error in place, not a blank page. */
async function load<T>(promise: Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, error: errorView(error) };
  }
}

export default async function BlockPage({ params }: PageProps<"/blocks/[id]">) {
  const { id } = await params;
  const [block, evaluation, pace, alerts] = await Promise.all([
    load(api.getBlock(id)),
    load(api.evaluation(id)),
    load(api.pace(id)),
    load(api.alerts(id)),
  ]);

  if (!block.ok) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorPanel error={block.error} />
      </div>
    );
  }
  const b = block.value;
  const money = (minor: number) => formatMoney(minor, b.currency);

  return (
    <div className="space-y-10">
      <BackLink />
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{b.name}</h1>
          {evaluation.ok && <RiskBadge level={evaluation.value.riskLevel} />}
          {b.status === "closed" && (
            <span className="text-sm text-slate-700">(closed)</span>
          )}
        </div>
        <p className="text-slate-800">
          {b.hotelName} · nights {b.startDate} – {b.endDate} · cutoff{" "}
          {b.cutoffDate}
        </p>
        <p className="text-slate-800">{termsSentence(b.terms)}</p>
      </header>

      <Section title="Today">
        {evaluation.ok ? (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <Tile
              label="Contracted"
              value={`${evaluation.value.contractedRoomNights}`}
              hint="room nights"
            />
            <Tile
              label="Minimum"
              value={`${evaluation.value.minimumRoomNights}`}
              hint="room nights"
            />
            <Tile
              label="Picked up"
              value={`${evaluation.value.pickedUpRoomNights}`}
              hint={formatPct(evaluation.value.pickupPct)}
            />
            <Tile
              label="Shortfall"
              value={`${evaluation.value.shortfallRoomNights}`}
              hint="room nights"
            />
            <Tile
              label="Owed today"
              value={money(evaluation.value.totalMinor)}
            />
            <Tile
              label="Projected at cutoff"
              value={
                evaluation.value.forecast.status === "ok"
                  ? money(evaluation.value.forecast.projectedTotalMinor)
                  : "—"
              }
              hint={
                evaluation.value.forecast.status === "ok"
                  ? "straight-line forecast"
                  : forecastReason(evaluation.value.forecast.reason)
              }
            />
            <Tile
              label="Days to cutoff"
              value={`${evaluation.value.daysToCutoff}`}
              hint={cutoffWording(evaluation.value.daysToCutoff)}
            />
          </dl>
        ) : (
          <ErrorPanel error={evaluation.error} />
        )}
      </Section>

      <Section title="Pace">
        {!pace.ok ? (
          <ErrorPanel error={pace.error} />
        ) : pace.value.points.length === 0 ? (
          <EmptyState>No snapshots yet. Record the first one below.</EmptyState>
        ) : (
          <>
            <PaceChart
              points={pace.value.points}
              minimum={pace.value.minimumRoomNights}
              contracted={pace.value.contractedRoomNights}
              cutoffDate={pace.value.cutoffDate}
            />
            <details className="mt-3">
              <summary className="cursor-pointer text-sm underline">
                Show data
              </summary>
              <table className="mt-2 text-sm">
                <caption className="sr-only">Pickup by snapshot date</caption>
                <thead>
                  <tr>
                    <th scope="col" className="pr-4 text-left">
                      As of
                    </th>
                    <th scope="col" className="pr-4 text-right">
                      Picked up
                    </th>
                    <th scope="col" className="pr-4 text-right">
                      Pickup %
                    </th>
                    <th scope="col" className="pr-4 text-right">
                      Shortfall
                    </th>
                    <th scope="col" className="text-right">
                      Owed
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pace.value.points.map((p) => (
                    <tr key={p.asOfDate}>
                      <td className="pr-4">{p.asOfDate}</td>
                      <td className="pr-4 text-right tabular-nums">
                        {p.pickedUpRoomNights}
                      </td>
                      <td className="pr-4 text-right tabular-nums">
                        {formatPct(p.pickupPct)}
                      </td>
                      <td className="pr-4 text-right tabular-nums">
                        {p.shortfallRoomNights}
                      </td>
                      <td className="text-right tabular-nums">
                        {money(p.totalMinor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-xs text-slate-700">
                Minimum {pace.value.minimumRoomNights} · Contracted{" "}
                {pace.value.contractedRoomNights} · Cutoff{" "}
                {pace.value.cutoffDate}
              </p>
            </details>
          </>
        )}
      </Section>

      <Section title="Nights">
        {evaluation.ok ? (
          <NightsTable
            nights={evaluation.value.nights}
            perNight={evaluation.value.basis === "per_night"}
            money={money}
          />
        ) : (
          <ErrorPanel error={evaluation.error} />
        )}
      </Section>

      <div className="grid gap-10 md:grid-cols-2">
        <Section title="Record snapshot">
          <RecordSnapshotForm
            blockId={b.id}
            today={today()}
            withResold={b.terms.resellCredit}
            nights={
              evaluation.ok
                ? evaluation.value.nights.map((n) => ({
                    date: n.date,
                    pickedUpRooms: n.pickedUpRooms,
                    resoldRooms: n.resoldRooms,
                  }))
                : b.nights.map((n) => ({
                    date: n.date,
                    pickedUpRooms: 0,
                    resoldRooms: 0,
                  }))
            }
          />
        </Section>
        <Section title="Import CSV">
          <ImportCsvForm blockId={b.id} />
        </Section>
      </div>

      <Section title="Alerts">
        {!alerts.ok ? (
          <ErrorPanel error={alerts.error} />
        ) : alerts.value.items.length === 0 ? (
          <EmptyState>No alerts for this block yet.</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-200">
            {alerts.value.items.map((alert) => (
              <li key={alert.id} className="py-2 text-sm">
                <span className="font-medium">{alertLabel(alert.type)}</span>{" "}
                <span className="text-slate-700">
                  · {alert.dedupeKey} · {alert.createdAt}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function NightsTable({
  nights,
  perNight,
  money,
}: {
  nights: {
    date: string;
    contractedRooms: number;
    rateMinor: number;
    pickedUpRooms: number;
    minimumRooms?: number | undefined;
    shortfallRooms?: number | undefined;
  }[];
  perNight: boolean;
  money: (minor: number) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Nightly figures</caption>
        <thead className="border-b border-slate-400 text-left text-slate-700">
          <tr>
            <th scope="col" className="py-1 pr-3">
              Date
            </th>
            <th scope="col" className="py-1 pr-3 text-right">
              Contracted
            </th>
            {perNight && (
              <th scope="col" className="py-1 pr-3 text-right">
                Minimum
              </th>
            )}
            <th scope="col" className="py-1 pr-3 text-right">
              Picked up
            </th>
            {perNight && (
              <th scope="col" className="py-1 pr-3 text-right">
                Shortfall
              </th>
            )}
            <th scope="col" className="py-1 text-right">
              Rate
            </th>
          </tr>
        </thead>
        <tbody>
          {nights.map((night) => (
            <tr key={night.date} className="border-b border-slate-200">
              <td className="py-1 pr-3">{night.date}</td>
              <td className="py-1 pr-3 text-right tabular-nums">
                {night.contractedRooms}
              </td>
              {perNight && (
                <td className="py-1 pr-3 text-right tabular-nums">
                  {night.minimumRooms}
                </td>
              )}
              <td className="py-1 pr-3 text-right tabular-nums">
                {night.pickedUpRooms}
              </td>
              {perNight && (
                <td className="py-1 pr-3 text-right tabular-nums">
                  {night.shortfallRooms}
                </td>
              )}
              <td className="py-1 text-right tabular-nums">
                {money(night.rateMinor)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`section-${title}`} className="space-y-3">
      <h2 id={`section-${title}`} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function BackLink() {
  return (
    <Link href="/" className="text-sm underline-offset-4 hover:underline">
      ← All blocks
    </Link>
  );
}

function forecastReason(
  reason: "NO_SNAPSHOT" | "PAST_CUTOFF" | "INSUFFICIENT_HISTORY",
): string {
  if (reason === "NO_SNAPSHOT") return "no snapshot yet";
  if (reason === "PAST_CUTOFF") return "cutoff has passed";
  return "needs two snapshots";
}

function alertLabel(type: string): string {
  if (type === "RISK_LEVEL_CHANGED") return "Risk level changed";
  if (type === "CUTOFF_APPROACHING") return "Cutoff approaching";
  if (type === "SNAPSHOT_STALE") return "Pickup report is stale";
  return type;
}
