import { createHash, timingSafeEqual } from "node:crypto";
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import type { Request } from "express";
import type { Config } from "../config.js";
import { CONFIG } from "../config.token.js";
import { ProblemException } from "../errors/problem.js";

// Hashing both sides first gives equal-length buffers, which timingSafeEqual requires,
// and means the comparison time reveals nothing about the key's length or content.
const digest = (value: string) =>
  createHash("sha256").update(value, "utf8").digest();

export function keysMatch(given: string, expected: string): boolean {
  return timingSafeEqual(digest(given), digest(expected));
}

/** Protects every /v1 route with the x-api-key header. Health checks and docs stay open. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(@Inject(CONFIG) private readonly config: Config) {
    if (config.API_KEY === "") {
      new Logger(ApiKeyGuard.name).warn(
        "API_KEY not set: authentication disabled (development only)",
      );
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.path.startsWith("/v1/") && request.path !== "/v1") return true;
    if (this.config.API_KEY === "") return true;

    const given = request.header("x-api-key");
    if (given !== undefined && keysMatch(given, this.config.API_KEY))
      return true;
    throw new ProblemException(
      401,
      "UNAUTHORIZED",
      "Unauthorized",
      "A valid x-api-key header is required.",
    );
  }
}
