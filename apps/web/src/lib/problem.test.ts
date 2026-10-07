import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiError, errorView, toApiError } from "./problem";

describe("problem+json parsing", () => {
  it("keeps title, detail, code and field errors from the API", () => {
    const error = toApiError(422, {
      type: "https://github.com/alihdrndm/blockpace/blob/main/docs/ERRORS.md#VALIDATION_FAILED",
      title: "Validation failed",
      status: 422,
      detail: "1 field failed validation.",
      code: "VALIDATION_FAILED",
      instance: "req-1",
      errors: [
        {
          path: "cutoffDate",
          code: "custom",
          message: "must not be after the first night",
        },
      ],
    });
    expect(error).toBeInstanceOf(ApiError);
    expect(errorView(error)).toEqual({
      title: "Validation failed",
      detail: "1 field failed validation.",
      fieldErrors: [
        {
          path: "cutoffDate",
          code: "custom",
          message: "must not be after the first night",
        },
      ],
    });
  });

  it("still produces a readable error when the body is not problem+json", () => {
    const error = toApiError(502, "<html>bad gateway</html>");
    expect(error.title).toBe("Unexpected response");
    expect(error.detail).toContain("502");
  });

  it("explains a network failure without leaking internals", () => {
    expect(errorView(new TypeError("fetch failed"))).toEqual({
      title: "Something went wrong",
      detail: "The dashboard could not reach the blockpace API. Is it running?",
    });
  });

  it("calls a response in the wrong shape unexpected, not unreachable", () => {
    const parse = z.object({ id: z.string() }).safeParse({ id: 1 });
    if (parse.success) throw new Error("expected a parse failure");
    expect(errorView(parse.error).title).toBe("Unexpected response");
  });
});

describe("path segments", () => {
  it("accept only UUIDs and real dates, and encode them", async () => {
    // api.ts reads env at import time; give it what it needs.
    const { idSegment, dateSegment } = await import("./api");
    expect(idSegment("01900000-0000-7000-8000-0000000000b2")).toBe(
      "01900000-0000-7000-8000-0000000000b2",
    );
    for (const bad of [
      "../blocks/01900000-0000-7000-8000-0000000000b2",
      "x",
      "",
    ]) {
      expect(() => idSegment(bad)).toThrow(ApiError);
    }
    expect(dateSegment("2026-10-06")).toBe("2026-10-06");
    expect(() => dateSegment("2026-02-30")).toThrow(ApiError);
    expect(() => dateSegment("../x")).toThrow(ApiError);
  });
});
