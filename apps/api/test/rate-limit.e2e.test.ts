import { describe, expect, it } from "vitest";
import { useTestApp } from "./support/app.js";

// Its own file, so a fresh app starts with an empty rate-limit counter.
const { http } = useTestApp();

describe("rate limit", () => {
  it("allows 120 requests per minute per IP, then answers 429 RATE_LIMITED", async () => {
    for (let i = 0; i < 120; i++) {
      await http().get("/healthz").expect(200);
    }
    const res = await http().get("/healthz").expect(429);
    expect(res.headers["content-type"]).toMatch(/application\/problem\+json/);
    expect(res.body.code).toBe("RATE_LIMITED");
  });
});
