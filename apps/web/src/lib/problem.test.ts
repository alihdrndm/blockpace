import { describe, expect, it } from "vitest";
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
});
