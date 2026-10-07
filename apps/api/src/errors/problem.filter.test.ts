import { HttpException, Logger, NotFoundException } from "@nestjs/common";
import type { Request } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProblemFilter } from "./problem.filter.js";
import { ProblemException } from "./problem.js";

const request = {
  id: "req-1",
  method: "GET",
  path: "/v1/x",
} as unknown as Request & {
  id: string;
};

describe("ProblemFilter", () => {
  afterEach(() => vi.restoreAllMocks());

  it("turns an unexpected error into a bare 500 INTERNAL that leaks nothing", () => {
    const logged = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => {});
    const problem = new ProblemFilter().toProblem(
      new Error("password=hunter2 at db.ts:12"),
      request,
    );
    expect(problem).toEqual({
      type: "https://github.com/alihdrndm/blockpace/blob/main/docs/ERRORS.md#INTERNAL",
      title: "Internal server error",
      status: 500,
      detail: "An unexpected error occurred.",
      code: "INTERNAL",
      instance: "req-1",
    });
    expect(JSON.stringify(problem)).not.toContain("hunter2");
    // The details go to the log instead, for whoever runs the server.
    expect(logged).toHaveBeenCalledOnce();
  });

  it("keeps the code, detail and field errors of a ProblemException", () => {
    const errors = [
      { path: "nights", code: "custom", message: "duplicate night" },
    ];
    const problem = new ProblemFilter().toProblem(
      new ProblemException(
        422,
        "VALIDATION_FAILED",
        "Validation failed",
        "1 field failed.",
        errors,
      ),
      request,
    );
    expect(problem).toMatchObject({
      status: 422,
      code: "VALIDATION_FAILED",
      errors,
    });
  });

  it("maps framework exceptions by status with a fixed, safe detail", () => {
    const filter = new ProblemFilter();
    expect(
      filter.toProblem(new NotFoundException("Cannot GET /v1/x"), request),
    ).toMatchObject({
      status: 404,
      code: "NOT_FOUND",
      detail: "No route matches GET /v1/x.",
    });
    expect(
      filter.toProblem(new HttpException("too big", 413), request),
    ).toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
    });
    expect(
      filter.toProblem(new HttpException("busy", 503), request),
    ).toMatchObject({
      code: "UNAVAILABLE",
    });
  });

  it("treats a 5xx HttpException as INTERNAL too", () => {
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    expect(
      new ProblemFilter().toProblem(new HttpException("boom", 502), request),
    ).toMatchObject({
      status: 500,
      code: "INTERNAL",
    });
  });
});
