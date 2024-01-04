import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import type { Config } from "./config.js";
import { CONFIG } from "./config.token.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  // Config was already parsed once by the CONFIG provider; reuse it rather than parsing again.
  await app.listen(app.get<Config>(CONFIG).PORT);
}
await bootstrap();
