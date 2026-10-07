import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/bootstrap.js";
import { testConfig } from "./support/app.js";

// Port 1 never answers, so the API starts but its only dependency is unreachable.
describe("readiness with the database down", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp(
      testConfig({
        DATABASE_URL: "postgres://blockpace:blockpace@127.0.0.1:1/blockpace",
      }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it("GET /healthz stays 200 (liveness)", async () => {
    await request(app.getHttpServer()).get("/healthz").expect(200);
  });

  it("GET /readyz is 503 UNAVAILABLE as problem+json", async () => {
    const res = await request(app.getHttpServer()).get("/readyz").expect(503);
    expect(res.headers["content-type"]).toMatch(/application\/problem\+json/);
    expect(res.body.code).toBe("UNAVAILABLE");
  });
});
