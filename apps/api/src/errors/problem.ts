import type { ProblemDetails } from "@alihdrndm/blockpace-core";

// Every non-2xx response is an RFC 9457 problem document. Each `code` has an anchor in
// docs/ERRORS.md, which the `type` URL points at.

export const ERRORS_DOC_URL =
  "https://github.com/alihdrndm/blockpace/blob/main/docs/ERRORS.md";

export type ErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "INTERNAL"
  | "BAD_REQUEST"
  | "PAYLOAD_TOO_LARGE"
  | "UNAVAILABLE"
  | "SNAPSHOT_NIGHTS_MISMATCH"
  | "SNAPSHOT_IN_FUTURE"
  | "RESOLD_EXCEEDS_CONTRACTED"
  | "IMPORT_INVALID"
  | "WEBHOOK_URL_NOT_ALLOWED"
  | "SNAPSHOT_LIMIT";

export type FieldError = NonNullable<ProblemDetails["errors"]>[number];

/** Thrown by controllers and services for every expected failure. */
export class ProblemException extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    readonly title: string,
    readonly detail: string,
    readonly errors?: FieldError[],
  ) {
    super(detail);
  }
}

export const notFound = (what: string) =>
  new ProblemException(404, "NOT_FOUND", "Not found", `${what} was not found.`);

export const validationFailed = (detail: string, errors: FieldError[]) =>
  new ProblemException(
    422,
    "VALIDATION_FAILED",
    "Validation failed",
    detail,
    errors,
  );

/** The code a framework error gets when no ProblemException describes it. */
export function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return "BAD_REQUEST";
    case 401:
      return "UNAUTHORIZED";
    case 404:
      return "NOT_FOUND";
    case 413:
      return "PAYLOAD_TOO_LARGE";
    case 422:
      return "VALIDATION_FAILED";
    case 429:
      return "RATE_LIMITED";
    case 503:
      return "UNAVAILABLE";
    default:
      return status >= 500 ? "INTERNAL" : "BAD_REQUEST";
  }
}

export const TITLES: Record<ErrorCode, string> = {
  VALIDATION_FAILED: "Validation failed",
  UNAUTHORIZED: "Unauthorized",
  NOT_FOUND: "Not found",
  RATE_LIMITED: "Too many requests",
  INTERNAL: "Internal server error",
  BAD_REQUEST: "Bad request",
  PAYLOAD_TOO_LARGE: "Payload too large",
  UNAVAILABLE: "Service unavailable",
  SNAPSHOT_NIGHTS_MISMATCH: "Snapshot nights do not match the block",
  SNAPSHOT_IN_FUTURE: "Snapshot date is in the future",
  RESOLD_EXCEEDS_CONTRACTED: "Resold rooms exceed contracted rooms",
  IMPORT_INVALID: "CSV import is invalid",
  WEBHOOK_URL_NOT_ALLOWED: "Webhook URL not allowed",
  SNAPSHOT_LIMIT: "Too many snapshots",
};
