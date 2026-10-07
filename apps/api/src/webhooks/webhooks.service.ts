import { randomBytes } from "node:crypto";
import { decodeCursor, newId } from "@alihdrndm/blockpace-core";
import {
  type AlertEventRow,
  alertEvents,
  checkWebhookUrl,
  type Db,
  type LookupAddresses,
  type WebhookDeliveryRow,
  type WebhookEndpointRow,
  webhookDeliveries,
  webhookEndpoints,
} from "@alihdrndm/blockpace-db";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, lt, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { ClockService } from "../clock/clock.service.js";
import { toPage, toTimestamp } from "../common/http.js";
import type { Config } from "../config.js";
import { CONFIG } from "../config.token.js";
import { DB } from "../db/db.module.js";
import { notFound, ProblemException } from "../errors/problem.js";
import { WEBHOOK_LOOKUP } from "./lookup.token.js";

interface Page {
  limit: number;
  cursor?: string | undefined;
}

/** The secret is deliberately absent: it is shown once, in the create response, and never again. */
export const toEndpointResponse = (row: WebhookEndpointRow) => ({
  id: row.id,
  url: row.url,
  active: row.active,
  createdAt: toTimestamp(row.createdAt),
});

const toAlertResponse = (row: AlertEventRow) => ({
  id: row.id,
  blockId: row.blockId,
  type: row.type,
  dedupeKey: row.dedupeKey,
  payload: row.payload,
  createdAt: toTimestamp(row.createdAt),
});

const toDeliveryResponse = (row: WebhookDeliveryRow) => ({
  id: row.id,
  endpointId: row.endpointId,
  ...(row.alertEventId === null ? {} : { alertEventId: row.alertEventId }),
  eventType: row.eventType,
  status: row.status,
  attempts: row.attempts,
  nextAttemptAt: toTimestamp(row.nextAttemptAt),
  ...(row.lastStatusCode === null
    ? {}
    : { lastStatusCode: row.lastStatusCode }),
  ...(row.lastError === null ? {} : { lastError: row.lastError }),
  ...(row.deliveredAt === null
    ? {}
    : { deliveredAt: toTimestamp(row.deliveredAt) }),
  createdAt: toTimestamp(row.createdAt),
});

/** Ids are UUIDv7 (time-ordered), so "newest first" pages are "id descending, before the cursor". */
function beforeCursor(column: AnyPgColumn, cursor: string | undefined): SQL[] {
  const after = cursor === undefined ? undefined : decodeCursor(cursor);
  return after === undefined ? [] : [lt(column, after)];
}

@Injectable()
export class WebhooksService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(ClockService) private readonly clock: ClockService,
    @Inject(WEBHOOK_LOOKUP) private readonly lookup: LookupAddresses,
  ) {}

  async createEndpoint(url: string) {
    const check = await checkWebhookUrl(url, {
      allowPrivate: this.config.ALLOW_PRIVATE_WEBHOOK_TARGETS,
      lookup: this.lookup,
    });
    if (!check.ok) {
      throw new ProblemException(
        422,
        "WEBHOOK_URL_NOT_ALLOWED",
        "Webhook URL not allowed",
        check.reason,
      );
    }
    // 32 random bytes as hex: the key receivers use to verify each delivery's HMAC signature.
    const secret = randomBytes(32).toString("hex");
    const [row] = await this.db
      .insert(webhookEndpoints)
      .values({ id: newId(), url, secret })
      .returning();
    if (row === undefined) throw new Error("insert returned no row");
    return { ...toEndpointResponse(row), secret };
  }

  async listEndpoints(query: Page) {
    const rows = await this.db
      .select()
      .from(webhookEndpoints)
      .where(and(...beforeCursor(webhookEndpoints.id, query.cursor)))
      .orderBy(desc(webhookEndpoints.id))
      .limit(query.limit + 1);
    return toPage(rows, query.limit, toEndpointResponse);
  }

  async removeEndpoint(id: string): Promise<void> {
    const deleted = await this.db
      .delete(webhookEndpoints)
      .where(eq(webhookEndpoints.id, id))
      .returning({ id: webhookEndpoints.id });
    if (deleted.length === 0) throw notFound(`Webhook endpoint ${id}`);
  }

  /** Queues a PING so the receiver can check signatures before any real alert arrives. */
  async sendTest(endpointId: string) {
    const [endpoint] = await this.db
      .select({ id: webhookEndpoints.id })
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.id, endpointId));
    if (endpoint === undefined)
      throw notFound(`Webhook endpoint ${endpointId}`);

    const now = this.clock.now();
    const id = newId();
    const [row] = await this.db
      .insert(webhookDeliveries)
      .values({
        id,
        endpointId,
        eventType: "PING",
        body: { id, type: "PING", createdAt: toTimestamp(now) },
        status: "pending",
        nextAttemptAt: now,
      })
      .returning();
    if (row === undefined) throw new Error("insert returned no row");
    return toDeliveryResponse(row);
  }

  async listAlerts(query: Page & { blockId?: string | undefined }) {
    const conditions = beforeCursor(alertEvents.id, query.cursor);
    if (query.blockId !== undefined)
      conditions.push(eq(alertEvents.blockId, query.blockId));
    const rows = await this.db
      .select()
      .from(alertEvents)
      .where(and(...conditions))
      .orderBy(desc(alertEvents.id))
      .limit(query.limit + 1);
    return toPage(rows, query.limit, toAlertResponse);
  }

  async listDeliveries(
    query: Page & {
      status?: "pending" | "delivered" | "failed" | undefined;
      endpointId?: string | undefined;
    },
  ) {
    const conditions = beforeCursor(webhookDeliveries.id, query.cursor);
    if (query.status !== undefined)
      conditions.push(eq(webhookDeliveries.status, query.status));
    if (query.endpointId !== undefined)
      conditions.push(eq(webhookDeliveries.endpointId, query.endpointId));
    const rows = await this.db
      .select()
      .from(webhookDeliveries)
      .where(and(...conditions))
      .orderBy(desc(webhookDeliveries.id))
      .limit(query.limit + 1);
    return toPage(rows, query.limit, toDeliveryResponse);
  }
}
