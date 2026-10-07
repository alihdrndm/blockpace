import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker.module.js";

// A standalone application context: the full Nest container, but no HTTP listener.
const app = await NestFactory.createApplicationContext(WorkerModule);
app.enableShutdownHooks();
new Logger("Worker").log("worker started");
