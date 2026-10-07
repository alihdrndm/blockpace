import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { loadConfig } from "./config.js";
import { WorkerModule } from "./worker.module.js";

// A standalone application context: the full Nest container, but no HTTP listener.
const app = await NestFactory.createApplicationContext(
  WorkerModule.register(loadConfig()),
  { bufferLogs: true },
);
app.useLogger(app.get(Logger));
// On SIGTERM: stop the timers, close the database pool, exit.
app.enableShutdownHooks();
app.get(Logger).log("worker started");
