import { createDb, createPool, type Db } from "@alihdrndm/blockpace-db";
import {
  Global,
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown,
} from "@nestjs/common";
import type pg from "pg";
import { CONFIG, type Config } from "./config.js";

export const PG_POOL = Symbol("PG_POOL");
export const DB = Symbol("DB");

// Closes the pool on SIGTERM so the worker exits instead of hanging on open connections.
@Injectable()
class PoolShutdown implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [CONFIG],
      useFactory: (config: Config) => createPool(config.DATABASE_URL),
    },
    {
      provide: DB,
      inject: [PG_POOL],
      useFactory: (pool: pg.Pool): Db => createDb(pool),
    },
    PoolShutdown,
  ],
  exports: [PG_POOL, DB],
})
export class DbModule {}
