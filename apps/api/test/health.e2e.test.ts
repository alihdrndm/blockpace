import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { CONFIG } from "../src/config.token.js";

// Port 1 is never listening, so readyz must report the database as unreachable without needing Docker.
describe("health endpoints", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CONFIG)
      .useValue({
        DATABASE_URL: "postgres://blockpace:blockpace@127.0.0.1:1/blockpace",
      })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /healthz is 200 even when the database is down", async () => {
    const res = await request(app.getHttpServer()).get("/healthz").expect(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("GET /readyz is 503 when the database is unreachable", async () => {
    await request(app.getHttpServer()).get("/readyz").expect(503);
  });
});
