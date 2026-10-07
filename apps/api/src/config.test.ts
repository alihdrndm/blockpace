import { afterEach, describe, expect, it, vi } from "vitest";
import { parseConfig } from "./config.js";

describe("parseConfig", () => {
  afterEach(() => vi.restoreAllMocks());

  it("applies defaults", () => {
    const config = parseConfig({ DATABASE_URL: "postgres://x" });
    expect(config.PORT).toBe(4020);
    expect(config.RUN_MIGRATIONS).toBe(false);
    expect(config.API_KEY).toBe("");
  });

  it("treats empty strings as unset", () => {
    const config = parseConfig({
      DATABASE_URL: "postgres://x",
      FIXED_TODAY: "",
      PORT: "",
    });
    expect(config.FIXED_TODAY).toBeUndefined();
    expect(config.PORT).toBe(4020);
  });

  it("prints every problem and exits with code 1 on invalid config", () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as never);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => parseConfig({ FIXED_TODAY: "tomorrow" })).toThrow("exit");
    expect(exit).toHaveBeenCalledWith(1);
    expect(log).toHaveBeenCalledTimes(2);
  });

  it("rejects an impossible FIXED_TODAY such as 2026-02-30", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as never);
    expect(() =>
      parseConfig({ DATABASE_URL: "postgres://x", FIXED_TODAY: "2026-02-30" }),
    ).toThrow("exit");
  });
});
