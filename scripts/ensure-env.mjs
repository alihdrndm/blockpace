// Copies .env.example to .env on first run so local scripts have a DATABASE_URL.
import { copyFileSync, existsSync } from "node:fs";

if (!existsSync(".env")) {
  copyFileSync(".env.example", ".env");
  console.log("created .env from .env.example");
}
