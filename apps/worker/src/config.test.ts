import { afterEach, describe, expect, it, vi } from "vitest";
import { parseConfig } from "./config.js";

describe("worker parseConfig", () => {
  afterEach(() => vi.restoreAllMocks());

  it("applies the documented defaults", () => {
    expect(parseConfig({ DATABASE_URL: "postgres://x" })).toEqual({
      NODE_ENV: "development",
      DATABASE_URL: "postgres://x",
      ALLOW_PRIVATE_WEBHOOK_TARGETS: false,
      WEBHOOK_POLL_MS: 10000,
      WEBHOOK_TIMEOUT_MS: 5000,
    });
  });

  it("prints every problem and exits with code 1 on invalid config", () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as never);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => parseConfig({ FIXED_TODAY: "2026-02-30" })).toThrow("exit");
    expect(exit).toHaveBeenCalledWith(1);
    expect(log).toHaveBeenCalledTimes(2);
  });
});
