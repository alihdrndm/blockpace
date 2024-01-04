import type { IsoDate } from "@alihdrndm/blockpace-core";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Config } from "../config.js";
import { CONFIG } from "../config.token.js";

// Nothing else in the API reads the system date: tests and FIXED_TODAY swap this out.
@Injectable()
export class ClockService {
  constructor(@Inject(CONFIG) private readonly config: Config) {
    if (config.FIXED_TODAY) {
      new Logger(ClockService.name).warn(
        `FIXED_TODAY is set: the clock is frozen at ${config.FIXED_TODAY}`,
      );
    }
  }

  today(): IsoDate {
    return (this.config.FIXED_TODAY ??
      new Date().toISOString().slice(0, 10)) as IsoDate;
  }

  now(): Date {
    return new Date();
  }
}
