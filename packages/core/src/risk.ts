import type { Forecast, RiskLevel } from "./model.js";

export interface RiskInput {
  shortfallRoomNights: number;
  daysToCutoff: number;
  forecast: Forecast;
}

/** First matching rule wins, in the order HANDOFF.md lists them. */
export function riskLevel(input: RiskInput): RiskLevel {
  if (input.shortfallRoomNights === 0) return "met";
  if (input.daysToCutoff <= 0) return "liable";
  if (
    input.forecast.status === "ok" &&
    input.forecast.projectedShortfallRoomNights === 0
  ) {
    return "on_track";
  }
  return "at_risk";
}
