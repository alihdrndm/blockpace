import type { Db } from "@alihdrndm/blockpace-db";
import { migrate } from "@alihdrndm/blockpace-db";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module.js";
import type { Config } from "./config.js";
import { DB } from "./db/db.module.js";

/**
 * Builds the fully configured app without listening. main.ts and the e2e tests both use it,
 * so tests exercise exactly the middleware, guards, filter and docs that production runs.
 */
export async function createApp(config: Config): Promise<INestApplication> {
  // CORS stays disabled (Nest's default): only the Next.js server calls this API.
  const app = await NestFactory.create(AppModule.register(config), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableShutdownHooks();

  if (config.RUN_MIGRATIONS) await migrate(app.get<Db>(DB));

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("blockpace API")
      .setDescription(
        "Hotel room-block attrition risk. Errors are application/problem+json; see docs/ERRORS.md.",
      )
      .setVersion("0.1.0")
      .addApiKey({ type: "apiKey", name: "x-api-key", in: "header" }, "apiKey")
      .build(),
  );
  SwaggerModule.setup("docs", app, document, { jsonDocumentUrl: "docs-json" });
  return app;
}
