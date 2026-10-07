import { ProblemDetailsSchema } from "@alihdrndm/blockpace-core";
import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ApiResponse } from "@nestjs/swagger";
import type pg from "pg";
import { PG_POOL } from "../db/db.module.js";

@Controller()
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  // Liveness: answers 200 as long as the process is up, even if the database is down.
  @Get("healthz")
  @ApiResponse({ status: 200, description: "The process is up" })
  healthz(): { status: "ok" } {
    return { status: "ok" };
  }

  // Readiness: 200 only when every dependency (the database) is reachable.
  @Get("readyz")
  @ApiResponse({ status: 200, description: "The database answers" })
  @ApiResponse({
    status: 503,
    description: "UNAVAILABLE: the database does not answer",
    standardSchema: ProblemDetailsSchema,
  })
  async readyz(): Promise<{ status: "ok" }> {
    try {
      await this.pool.query("select 1");
    } catch {
      throw new ServiceUnavailableException();
    }
    return { status: "ok" };
  }
}
