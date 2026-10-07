import { ProblemDetailsSchema } from "@alihdrndm/blockpace-core";

// Errors from the API arrive as application/problem+json. The pages show `title` and `detail`.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    readonly detail: string,
    readonly code: string,
    readonly fieldErrors: { path: string; message: string }[] = [],
  ) {
    super(`${title}: ${detail}`);
  }
}

/** Builds an ApiError from any failed response body, even one that is not problem+json. */
export function toApiError(status: number, body: unknown): ApiError {
  const parsed = ProblemDetailsSchema.safeParse(body);
  if (parsed.success) {
    const { title, detail, code, errors } = parsed.data;
    return new ApiError(status, title, detail, code, errors ?? []);
  }
  return new ApiError(
    status,
    "Unexpected response",
    `The API answered with status ${status}.`,
    "UNEXPECTED",
  );
}

/** What a page or form needs to show an error. */
export interface ErrorView {
  title: string;
  detail: string;
  fieldErrors?: { path: string; message: string }[];
}

export function errorView(error: unknown): ErrorView {
  if (error instanceof ApiError) {
    return {
      title: error.title,
      detail: error.detail,
      ...(error.fieldErrors.length > 0
        ? { fieldErrors: error.fieldErrors }
        : {}),
    };
  }
  return {
    title: "Something went wrong",
    detail: "The dashboard could not reach the blockpace API. Is it running?",
  };
}
