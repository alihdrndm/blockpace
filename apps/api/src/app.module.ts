import type { IncomingMessage, ServerResponse } from "node:http";
import { newId } from "@alihdrndm/blockpace-core";
import { type LookupAddresses, systemLookup } from "@alihdrndm/blockpace-db";
import { type DynamicModule, Global, Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_PIPE } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { ApiKeyGuard } from "./auth/api-key.guard.js";
import { BlocksController } from "./blocks/blocks.controller.js";
import { BlocksService } from "./blocks/blocks.service.js";
import { CalculationsController } from "./calculations/calculations.controller.js";
import { ClockService } from "./clock/clock.service.js";
import type { Config } from "./config.js";
import { CONFIG } from "./config.token.js";
import { DbModule } from "./db/db.module.js";
import { ProblemFilter } from "./errors/problem.filter.js";
import { validationPipe } from "./errors/validation.js";
import { HealthController } from "./health/health.controller.js";
import { SnapshotsController } from "./snapshots/snapshots.controller.js";
import { SnapshotsService } from "./snapshots/snapshots.service.js";
import { AlertsController } from "./webhooks/alerts.controller.js";
import { WEBHOOK_LOOKUP } from "./webhooks/lookup.token.js";
import { WebhookDeliveriesController } from "./webhooks/webhook-deliveries.controller.js";
import { WebhookEndpointsController } from "./webhooks/webhook-endpoints.controller.js";
import { WebhooksService } from "./webhooks/webhooks.service.js";

const REQUEST_ID = "x-request-id";

// Reuses the caller's request id when it sends one, so a request can be traced across systems.
function requestId(request: IncomingMessage, response: ServerResponse): string {
  const given = request.headers[REQUEST_ID];
  const id =
    typeof given === "string" && given.length > 0 && given.length <= 200
      ? given
      : newId();
  response.setHeader(REQUEST_ID, id);
  return id;
}

/**
 * Logging rules: one line per request with method, path, status, duration and request id.
 * Bodies and headers (other than x-request-id and user-agent) never reach the log.
 */
function loggerOptions(config: Config) {
  return {
    pinoHttp: {
      level: config.NODE_ENV === "test" ? "silent" : "info",
      genReqId: requestId,
      serializers: {
        req: (req: IncomingMessage & { id?: unknown }) => ({
          id: req.id,
          method: req.method,
          path: (req.url ?? "").split("?")[0],
          userAgent: req.headers["user-agent"],
        }),
        res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
      },
      ...(config.NODE_ENV === "development"
        ? {
            transport: { target: "pino-pretty", options: { singleLine: true } },
          }
        : {}),
    },
  };
}

/** Test seams that cannot come from environment variables. */
export interface AppOptions {
  /** DNS lookup used by the webhook URL rule; tests pass a fake so they never touch the network. */
  lookup?: LookupAddresses;
}

/**
 * The root module takes the already-parsed config, so tests build the exact same app
 * as production with a different Config object.
 */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: Nest dynamic modules are classes with a static register().
export class AppModule {
  static register(config: Config, options: AppOptions = {}): DynamicModule {
    @Global()
    @Module({
      providers: [
        { provide: CONFIG, useValue: config },
        ClockService,
        { provide: WEBHOOK_LOOKUP, useValue: options.lookup ?? systemLookup },
      ],
      exports: [CONFIG, ClockService, WEBHOOK_LOOKUP],
    })
    class ConfigModule {}

    return {
      module: AppModule,
      imports: [
        ConfigModule,
        DbModule,
        LoggerModule.forRoot(loggerOptions(config)),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
      ],
      controllers: [
        HealthController,
        CalculationsController,
        BlocksController,
        SnapshotsController,
        WebhookEndpointsController,
        AlertsController,
        WebhookDeliveriesController,
      ],
      providers: [
        BlocksService,
        SnapshotsService,
        WebhooksService,
        // Guards run in this order: rate limit first, then the API key.
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: ApiKeyGuard },
        { provide: APP_FILTER, useClass: ProblemFilter },
        { provide: APP_PIPE, useValue: validationPipe },
      ],
    };
  }
}
