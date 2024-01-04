import { Logger } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { Config } from "../config.js";
import { ClockService } from "./clock.service.js";

const config = (fixedToday?: string) => ({ FIXED_TODAY: fixedToday }) as Config;

describe("ClockService", () => {
  it("returns FIXED_TODAY when set", () => {
    expect(new ClockService(config("2026-10-06")).today()).toBe("2026-10-06");
  });

  it("returns the current UTC date otherwise", () => {
    expect(new ClockService(config()).today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("ClockService boot warning", () => {
  it("logs a warning when FIXED_TODAY is set", () => {
    const warn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => {});
    new ClockService(config("2026-10-06"));
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
