import { NestFactory } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import { WorkerModule } from "./worker.module.js";

describe("WorkerModule", () => {
  it("boots as a standalone context without an HTTP listener", async () => {
    const app = await NestFactory.createApplicationContext(WorkerModule, {
      logger: false,
    });
    expect(app).toBeDefined();
    await app.close();
  });
});
