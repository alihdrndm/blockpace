import { Global, Module } from "@nestjs/common";
import { ClockService } from "./clock/clock.service.js";
import { type Config, loadConfig } from "./config.js";
import { CONFIG } from "./config.token.js";
import { DbModule } from "./db/db.module.js";
import { HealthController } from "./health/health.controller.js";

@Global()
@Module({
  providers: [
    { provide: CONFIG, useFactory: (): Config => loadConfig() },
    ClockService,
  ],
  exports: [CONFIG, ClockService],
})
class CoreModule {}

@Module({
  imports: [CoreModule, DbModule],
  controllers: [HealthController],
})
export class AppModule {}
