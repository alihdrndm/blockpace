"use client";

import { addDays, diffDays, type IsoDate } from "@alihdrndm/blockpace-core";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface PacePoint {
  asOfDate: IsoDate;
  pickedUpRoomNights: number;
}

/**
 * Picked-up room nights per snapshot. The x axis counts days from the first snapshot (plain
 * numbers, no Date objects), so the cutoff can be drawn even when no snapshot falls on it.
 */
export function PaceChart({
  points,
  minimum,
  contracted,
  cutoffDate,
}: {
  points: PacePoint[];
  minimum: number;
  contracted: number;
  cutoffDate: IsoDate;
}) {
  const first = points[0]?.asOfDate ?? cutoffDate;
  const data = points.map((p) => ({
    day: diffDays(p.asOfDate, first),
    pickup: p.pickedUpRoomNights,
  }));
  const cutoffDay = diffDays(cutoffDate, first);
  // The domain always includes the cutoff, also when it falls before the first snapshot
  // (reports recorded after the cutoff), so the cutoff line is never silently dropped.
  const firstDay = Math.min(0, cutoffDay);
  const lastDay = Math.max(cutoffDay, ...data.map((d) => d.day));
  const label = (day: number) => addDays(first, day);

  return (
    <figure aria-label="Picked-up room nights by snapshot date, with minimum, contracted and cutoff lines">
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 16, right: 24, bottom: 8, left: 8 }}
          >
            <CartesianGrid stroke="#cbd5e1" strokeDasharray="3 3" />
            <XAxis
              dataKey="day"
              type="number"
              domain={[firstDay, lastDay]}
              tickFormatter={label}
              stroke="#334155"
            />
            <YAxis
              domain={[0, Math.ceil(contracted * 1.05)]}
              stroke="#334155"
            />
            <Tooltip
              // No JS animation: the spec allows only CSS transitions under 200 ms.
              isAnimationActive={false}
              labelFormatter={(day) => label(Number(day))}
              formatter={(value) => [`${value} room nights`, "Picked up"]}
            />
            <ReferenceLine
              y={contracted}
              stroke="#334155"
              strokeDasharray="6 3"
              label="Contracted"
            />
            <ReferenceLine
              y={minimum}
              stroke="#b45309"
              strokeDasharray="6 3"
              label="Minimum"
            />
            <ReferenceLine x={cutoffDay} stroke="#b91c1c" label="Cutoff" />
            <Line
              type="monotone"
              dataKey="pickup"
              stroke="#0f172a"
              strokeWidth={2}
              dot={{ r: 3 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
