import type { ServerResponse } from "node:http";
import { systemLookup } from "@alihdrndm/blockpace-db";
import { type DynamicModule, Global, Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { LoggerModule } from "nestjs-pino";
import { ClockService } from "./clock.service.js";
import { CONFIG, type Config } from "./config.js";
import { DbModule } from "./db.module.js";
import { DeliveryService, FETCH, LOOKUP } from "./delivery/delivery.service.js";
import { DailyEvaluationService } from "./evaluation/daily-evaluation.service.js";

/** Same logging rules as the API: structured lines, never bodies or secrets. */
function loggerOptions(config: Config) {
  return {
    pinoHttp: {
      level: config.NODE_ENV === "test" ? "silent" : "info",
      serializers: {
        res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
      },
      ...(config.NODE_ENV === "development"
        ? {
            transport: {
              target: "pino-pretty",
              options: { singleLine: true },
            },
          }
        : {}),
    },
  };
}

/**
 * The worker: a Nest application context with no HTTP listener, running the daily evaluation
 * and the webhook delivery loop. It takes the parsed config so tests build the same module.
 */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: Nest dynamic modules are classes with a static register().
export class WorkerModule {
  static register(config: Config): DynamicModule {
    @Global()
    @Module({
      providers: [{ provide: CONFIG, useValue: config }, ClockService],
      exports: [CONFIG, ClockService],
    })
    class ConfigModule {}

    return {
      module: WorkerModule,
      imports: [
        ConfigModule,
        DbModule,
        LoggerModule.forRoot(loggerOptions(config)),
        ScheduleModule.forRoot(),
      ],
      providers: [
        { provide: FETCH, useValue: globalThis.fetch },
        { provide: LOOKUP, useValue: systemLookup },
        DailyEvaluationService,
        DeliveryService,
      ],
    };
  }
}
