import { diffDays } from "@alihdrndm/blockpace-core";
import Link from "next/link";
import {
  ButtonLink,
  EmptyState,
  ErrorPanel,
  PickupBar,
  RiskBadge,
} from "../components/ui";
import { api, today } from "../lib/api";
import { cutoffWording, formatMoney } from "../lib/format";
import { errorView } from "../lib/problem";

// Live numbers on every visit.
export const dynamic = "force-dynamic";

export default async function BlocksPage() {
  let blocks: Awaited<ReturnType<typeof api.listBlocks>>["items"];
  try {
    blocks = (await api.listBlocks()).items;
  } catch (error) {
    return (
      <Shell>
        <ErrorPanel error={errorView(error)} />
      </Shell>
    );
  }
  const now = today();

  return (
    <Shell>
      {blocks.length === 0 ? (
        <EmptyState>
          No room blocks yet. Create one with{" "}
          <Link href="/blocks/new" className="underline">
            New block
          </Link>
          .
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Room blocks and their attrition risk
            </caption>
            <thead className="border-b border-slate-400 text-slate-700">
              <tr>
                <th scope="col" className="py-2 pr-3">
                  Block
                </th>
                <th scope="col" className="py-2 pr-3">
                  Hotel
                </th>
                <th scope="col" className="py-2 pr-3">
                  Nights
                </th>
                <th scope="col" className="py-2 pr-3">
                  Cutoff
                </th>
                <th scope="col" className="py-2 pr-3">
                  Pickup
                </th>
                <th scope="col" className="py-2 pr-3 text-right">
                  Shortfall
                </th>
                <th scope="col" className="py-2 pr-3 text-right">
                  Owed today
                </th>
                <th scope="col" className="py-2 pr-3 text-right">
                  Projected at cutoff
                </th>
                <th scope="col" className="py-2">
                  Risk
                </th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((block) => (
                <tr key={block.id} className="border-b border-slate-200">
                  <td className="py-2 pr-3">
                    <Link
                      href={`/blocks/${block.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {block.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-3">
                    <Link
                      href={`/blocks/${block.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {block.hotelName}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {block.startDate} – {block.endDate}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {cutoffWording(diffDays(block.cutoffDate, now))}
                  </td>
                  <td className="py-2 pr-3">
                    <PickupBar pct={block.latest.pickupPct} />
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {block.latest.shortfallRoomNights}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {formatMoney(block.latest.totalMinor, block.currency)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {block.latest.projectedTotalMinor === undefined
                      ? "—"
                      : formatMoney(
                          block.latest.projectedTotalMinor,
                          block.currency,
                        )}
                  </td>
                  <td className="py-2">
                    <RiskBadge level={block.latest.riskLevel} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Room blocks</h1>
        <div className="flex gap-2">
          <ButtonLink href="/blocks/new">New block</ButtonLink>
          <ButtonLink href="/calculator">Calculator</ButtonLink>
        </div>
      </div>
      {children}
    </>
  );
}
