import { NestFactory } from "@nestjs/core";
import { SchedulerRegistry } from "@nestjs/schedule";
import { describe, expect, it } from "vitest";
import { testConfig, useTestDb } from "./testing/support.js";
import { WorkerModule } from "./worker.module.js";

useTestDb();

describe("WorkerModule", () => {
  it("boots without an HTTP listener and schedules the daily cron and the delivery loop", async () => {
    const app = await NestFactory.createApplicationContext(
      WorkerModule.register(testConfig()),
      { logger: false },
    );
    await app.init();
    const scheduler = app.get(SchedulerRegistry);
    expect(scheduler.getCronJob("daily-evaluation")).toBeDefined();
    expect(scheduler.doesExist("interval", "webhook-delivery")).toBe(true);

    await app.close();
    expect(scheduler.doesExist("interval", "webhook-delivery")).toBe(false);
  });
});
