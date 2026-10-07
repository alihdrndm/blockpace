import type { IsoDate } from "@alihdrndm/blockpace-core";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { CONFIG, type Config } from "./config.js";

// Nothing else in the worker reads the system date: tests and FIXED_TODAY swap this out.
@Injectable()
export class ClockService {
  constructor(@Inject(CONFIG) private readonly config: Config) {
    if (config.FIXED_TODAY) {
      new Logger(ClockService.name).warn(
        `FIXED_TODAY is set: the clock is frozen at ${config.FIXED_TODAY}`,
      );
    }
  }

  /** The current UTC calendar date, or FIXED_TODAY. */
  today(): IsoDate {
    return (this.config.FIXED_TODAY ??
      this.now().toISOString().slice(0, 10)) as IsoDate;
  }

  now(): Date {
    return new Date();
  }
}
