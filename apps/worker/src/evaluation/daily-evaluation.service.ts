import { blocks, type Db, recordEvaluation } from "@alihdrndm/blockpace-db";
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { asc, eq } from "drizzle-orm";
import { ClockService } from "../clock.service.js";
import { DB } from "../db.module.js";

export interface DailyRunResult {
  evaluated: number;
  failed: number;
}

/**
 * Re-evaluates every active block once a day, so cutoff reminders and stale-snapshot alerts
 * fire even when nobody touches a block. Safe to run on several workers and several times a
 * day: the unique constraints inside recordEvaluation make repeats a no-op.
 */
@Injectable()
export class DailyEvaluationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DailyEvaluationService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ClockService) private readonly clock: ClockService,
  ) {}

  /** Once at boot, so a worker that was down at 00:05 UTC catches up immediately. */
  onApplicationBootstrap(): void {
    this.run().catch((error: unknown) =>
      this.logger.error(`boot-time daily evaluation failed: ${String(error)}`),
    );
  }

  @Cron("5 0 * * *", { name: "daily-evaluation", timeZone: "UTC" })
  async scheduled(): Promise<void> {
    await this.run();
  }

  async run(): Promise<DailyRunResult> {
    const today = this.clock.today();
    const active = await this.db
      .select({ id: blocks.id })
      .from(blocks)
      .where(eq(blocks.status, "active"))
      .orderBy(asc(blocks.id));

    const result: DailyRunResult = { evaluated: 0, failed: 0 };
    for (const { id } of active) {
      // One transaction per block: a failure rolls back only that block and the loop goes on.
      try {
        await this.db.transaction((tx) =>
          recordEvaluation(tx, id, today, this.clock.now()),
        );
        result.evaluated += 1;
      } catch (error) {
        result.failed += 1;
        this.logger.error(
          `daily evaluation failed for block ${id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    this.logger.log(
      `daily evaluation for ${today}: ${result.evaluated} evaluated, ${result.failed} failed`,
    );
    return result;
  }
}
