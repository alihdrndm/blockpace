import { StandardSchemaValidationPipe } from "@nestjs/common";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { type FieldError, validationFailed } from "./problem.js";

// Turns Standard Schema issues (from the Zod schemas in packages/core) into one
// errors[] entry per issue, so a client can show each problem next to its field.

const pathOf = (issue: StandardSchemaV1.Issue): string =>
  (issue.path ?? [])
    .map((segment) => (typeof segment === "object" ? segment.key : segment))
    .map(String)
    .join(".");

export function toFieldErrors(
  issues: readonly StandardSchemaV1.Issue[],
): FieldError[] {
  return issues.map((issue) => ({
    path: pathOf(issue),
    // Zod passes its own issue objects through Standard Schema, so they carry a code.
    code: String((issue as { code?: unknown }).code ?? "invalid"),
    message: issue.message,
  }));
}

/** Validates @Body/@Query/@Param against the schema given in the decorator, returning parsed values. */
export const validationPipe = new StandardSchemaValidationPipe({
  transform: true,
  exceptionFactory: (issues) =>
    validationFailed(
      `${issues.length} field${issues.length === 1 ? "" : "s"} failed validation.`,
      toFieldErrors(issues),
    ),
});
