import { evaluations } from "@alihdrndm/blockpace-db";
import { Logger } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  insertBlock,
  TestClock,
  TODAY,
  testConfig,
  useTestDb,
} from "../testing/support.js";
import { DailyEvaluationService } from "./daily-evaluation.service.js";

const { db } = useTestDb();

const makeService = () =>
  new DailyEvaluationService(db(), new TestClock(testConfig()));

describe("daily evaluation", () => {
  it("evaluates every active block for today and skips closed ones", async () => {
    const a = await insertBlock(db());
    const b = await insertBlock(db());
    await insertBlock(db(), { status: "closed" });

    expect(await makeService().run()).toEqual({ evaluated: 2, failed: 0 });

    const rows = await db().select().from(evaluations);
    expect(rows.map((r) => r.blockId).sort()).toEqual([a, b].sort());
    expect(rows.every((r) => r.evaluatedFor === TODAY)).toBe(true);
  });

  it("one block's failure is logged and does not stop the others", async () => {
    const logged = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => {});
    // A block with no nights cannot be evaluated, so recordEvaluation throws for it.
    const broken = await insertBlock(db(), { nights: false });
    const healthy = await insertBlock(db());

    expect(await makeService().run()).toEqual({ evaluated: 1, failed: 1 });

    const rows = await db().select().from(evaluations);
    expect(rows.map((r) => r.blockId)).toEqual([healthy]);
    expect(logged.mock.calls[0]?.[0]).toContain(broken);
    logged.mockRestore();
  });

  it("is safe to run twice on the same day (idempotent)", async () => {
    await insertBlock(db());
    const service = makeService();
    await service.run();
    await service.run();
    expect(await db().select().from(evaluations)).toHaveLength(1);
  });
});
