import {
  checkWebhookUrl,
  type Db,
  type LookupAddresses,
  webhookDeliveries,
  webhookEndpoints,
} from "@alihdrndm/blockpace-db";
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";
import { and, asc, eq, lte } from "drizzle-orm";
import { ClockService } from "../clock.service.js";
import { CONFIG, type Config } from "../config.js";
import { DB } from "../db.module.js";
import { signPayload } from "./signature.js";

/** Injection tokens so tests can swap the network for local fakes. */
export const FETCH = Symbol("FETCH");
export const LOOKUP = Symbol("LOOKUP");
export type FetchFn = typeof fetch;

/** Seconds to wait after attempt 1, 2, 3, 4, 5 fails. The 6th failure is final. */
export const BACKOFF_SECONDS = [60, 300, 1800, 7200, 43200];
export const MAX_ATTEMPTS = 6;
const BATCH_SIZE = 20;
const MAX_ERROR_LENGTH = 500;

type Outcome =
  | { ok: true; statusCode: number }
  | { ok: false; statusCode?: number; error: string };

export type TickResult = "ran" | "skipped";

@Injectable()
export class DeliveryService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(DeliveryService.name);
  private running = false;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ClockService) private readonly clock: ClockService,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(FETCH) private readonly fetchFn: FetchFn,
    @Inject(LOOKUP) private readonly lookup: LookupAddresses,
    @Inject(SchedulerRegistry) private readonly scheduler: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    const timer = setInterval(() => {
      this.tick().catch((error: unknown) =>
        this.logger.error(`delivery tick failed: ${String(error)}`),
      );
    }, this.config.WEBHOOK_POLL_MS);
    this.scheduler.addInterval("webhook-delivery", timer);
  }

  onApplicationShutdown(): void {
    if (this.scheduler.doesExist("interval", "webhook-delivery")) {
      this.scheduler.deleteInterval("webhook-delivery");
    }
  }

  /** One poll. A slow tick (a slow webhook receiver) makes the next one skip, not pile up. */
  async tick(): Promise<TickResult> {
    if (this.running) return "skipped";
    this.running = true;
    try {
      await this.deliverDue();
      return "ran";
    } finally {
      this.running = false;
    }
  }

  /**
   * Locks up to 20 due deliveries with FOR UPDATE SKIP LOCKED and sends them. Rows another
   * worker has locked are skipped rather than waited for, so several workers can run this at
   * once and no row is ever sent twice. The locks are held until the results are written.
   * Returns how many deliveries were attempted.
   */
  async deliverDue(): Promise<number> {
    const now = this.clock.now();
    return this.db.transaction(async (tx) => {
      const due = await tx
        .select({
          id: webhookDeliveries.id,
          eventType: webhookDeliveries.eventType,
          body: webhookDeliveries.body,
          attempts: webhookDeliveries.attempts,
          url: webhookEndpoints.url,
          secret: webhookEndpoints.secret,
        })
        .from(webhookDeliveries)
        .innerJoin(
          webhookEndpoints,
          eq(webhookDeliveries.endpointId, webhookEndpoints.id),
        )
        .where(
          and(
            eq(webhookDeliveries.status, "pending"),
            lte(webhookDeliveries.nextAttemptAt, now),
          ),
        )
        .orderBy(asc(webhookDeliveries.nextAttemptAt))
        .limit(BATCH_SIZE)
        .for("update", { of: webhookDeliveries, skipLocked: true });

      for (const row of due) {
        const outcome = await this.send(row, now);
        const attempts = row.attempts + 1;
        if (outcome.ok) {
          await tx
            .update(webhookDeliveries)
            .set({
              status: "delivered",
              attempts,
              deliveredAt: now,
              lastStatusCode: outcome.statusCode,
              lastError: null,
              updatedAt: now,
            })
            .where(eq(webhookDeliveries.id, row.id));
        } else {
          const final = attempts >= MAX_ATTEMPTS;
          const wait = BACKOFF_SECONDS[attempts - 1] ?? 0;
          await tx
            .update(webhookDeliveries)
            .set({
              attempts,
              lastStatusCode: outcome.statusCode ?? null,
              lastError: outcome.error.slice(0, MAX_ERROR_LENGTH),
              updatedAt: now,
              ...(final
                ? { status: "failed" }
                : { nextAttemptAt: new Date(now.getTime() + wait * 1000) }),
            })
            .where(eq(webhookDeliveries.id, row.id));
        }
        // Delivery ids and outcomes only: never bodies, secrets or headers.
        this.logger.log(
          `delivery ${row.id} attempt ${attempts}: ${outcome.ok ? "delivered" : outcome.error.slice(0, 120)}`,
        );
      }
      return due.length;
    });
  }

  private async send(
    row: {
      id: string;
      eventType: string;
      body: Record<string, unknown>;
      url: string;
      secret: string;
    },
    now: Date,
  ): Promise<Outcome> {
    // Checked again on every attempt: DNS for the host may have changed since creation.
    const check = await checkWebhookUrl(row.url, {
      allowPrivate: this.config.ALLOW_PRIVATE_WEBHOOK_TARGETS,
      lookup: this.lookup,
    });
    if (!check.ok)
      return { ok: false, error: `URL not allowed: ${check.reason}` };

    // Serialised once, so the bytes that are signed are exactly the bytes that are sent.
    const rawBody = JSON.stringify(row.body);
    const timestamp = Math.floor(now.getTime() / 1000);
    try {
      const response = await this.fetchFn(row.url, {
        method: "POST",
        body: rawBody,
        redirect: "manual",
        signal: AbortSignal.timeout(this.config.WEBHOOK_TIMEOUT_MS),
        headers: {
          "content-type": "application/json",
          "user-agent": "blockpace-webhooks/1",
          "x-blockpace-event": row.eventType,
          "x-blockpace-delivery": row.id,
          "x-blockpace-timestamp": String(timestamp),
          "x-blockpace-signature": signPayload(row.secret, timestamp, rawBody),
        },
      });
      // The receiver's answer is not needed; drain it so the connection is released.
      await response.body?.cancel();
      if (response.status >= 200 && response.status <= 299) {
        return { ok: true, statusCode: response.status };
      }
      // 3xx included: redirects are never followed, a webhook must answer at its own URL.
      return {
        ok: false,
        statusCode: response.status,
        error: `HTTP ${response.status}`,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        return {
          ok: false,
          error: `timed out after ${this.config.WEBHOOK_TIMEOUT_MS} ms`,
        };
      }
      const cause = (error as { cause?: { code?: unknown } }).cause?.code;
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        error: cause === undefined ? message : `${message} (${String(cause)})`,
      };
    }
  }
}
