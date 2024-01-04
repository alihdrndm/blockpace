import { describe, expect, it } from "vitest";
import { parseDbEnv } from "./env.js";

describe("parseDbEnv", () => {
  it("requires DATABASE_URL and defaults the seed webhook URL", () => {
    const env = parseDbEnv({ DATABASE_URL: "postgres://x" });
    expect(env.DATABASE_URL).toBe("postgres://x");
    expect(env.SEED_WEBHOOK_URL).toBe("http://localhost:4999/");
    expect(env.FIXED_TODAY).toBeUndefined();
  });

  it("treats empty strings as unset", () => {
    const env = parseDbEnv({ DATABASE_URL: "postgres://x", FIXED_TODAY: "" });
    expect(env.FIXED_TODAY).toBeUndefined();
  });

  it("names every problem when the environment is invalid", () => {
    expect(() => parseDbEnv({ FIXED_TODAY: "2026-02-30" })).toThrow(
      /DATABASE_URL[\s\S]*FIXED_TODAY/,
    );
  });
});
