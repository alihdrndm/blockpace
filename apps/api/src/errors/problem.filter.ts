import type { ProblemDetails } from "@alihdrndm/blockpace-core";
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import {
  codeForStatus,
  ERRORS_DOC_URL,
  type ErrorCode,
  ProblemException,
  TITLES,
} from "./problem.js";

/**
 * The one global exception filter. It turns every error into application/problem+json.
 * Unexpected errors become a bare 500: their message and stack go to the log, never to the client.
 */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { id?: unknown }>();
    const response = http.getResponse<Response>();
    const problem = this.toProblem(exception, request);

    response
      .status(problem.status)
      .type("application/problem+json")
      .send(JSON.stringify(problem));
  }

  toProblem(
    exception: unknown,
    request: Request & { id?: unknown },
  ): ProblemDetails {
    const instance = typeof request.id === "string" ? request.id : "";
    const build = (
      status: number,
      code: ErrorCode,
      detail: string,
      title = TITLES[code],
      errors?: ProblemDetails["errors"],
    ): ProblemDetails => ({
      type: `${ERRORS_DOC_URL}#${code}`,
      title,
      status,
      detail,
      code,
      instance,
      ...(errors === undefined ? {} : { errors }),
    });

    if (exception instanceof ProblemException) {
      return build(
        exception.status,
        exception.code,
        exception.detail,
        exception.title,
        exception.errors,
      );
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = codeForStatus(status);
      if (code === "INTERNAL") return this.internal(exception, build);
      return build(status, code, this.safeDetail(status, request));
    }

    return this.internal(exception, build);
  }

  private internal(
    exception: unknown,
    build: (status: number, code: ErrorCode, detail: string) => ProblemDetails,
  ): ProblemDetails {
    // Only the error type and stack frames are logged, never the message: a failed database
    // query's message includes its parameters, which are values from the request body.
    if (exception instanceof Error) {
      const frames = (exception.stack ?? "").split("\n").slice(1).join("\n");
      this.logger.error(`${exception.name} (message withheld)\n${frames}`);
    } else {
      this.logger.error(`non-Error thrown: ${typeof exception}`);
    }
    return build(500, "INTERNAL", "An unexpected error occurred.");
  }

  // Framework messages can echo internals, so each status gets a fixed, safe sentence.
  private safeDetail(status: number, request: Request): string {
    switch (status) {
      case 401:
        return "A valid x-api-key header is required.";
      case 404:
        return `No route matches ${request.method} ${request.path}.`;
      case 413:
        return "The request body is too large.";
      case 429:
        return "Too many requests from this address. Try again in a minute.";
      case 503:
        return "A dependency is not reachable.";
      default:
        return "The request could not be processed.";
    }
  }
}
