// Server-only: the typed client for the NestJS API. Only server components, server actions
// and route handlers call it, so the API key never reaches the browser.
import {
  AlertEventSchema,
  BlockListItemSchema,
  BlockResponseSchema,
  EvaluationSchema,
  ImportResponseSchema,
  type IsoDate,
  listOf,
  PaceResponseSchema,
  parseIsoDate,
  SnapshotPutResponseSchema,
  tryParseIsoDate,
  WebhookDeliverySchema,
  WebhookEndpointCreatedSchema,
  WebhookEndpointSchema,
} from "@alihdrndm/blockpace-core";
import { z } from "zod";
import { env } from "../env";
import { ApiError, toApiError } from "./problem";

type Init = { method?: string; body?: unknown; form?: FormData };

const Uuid = z.uuid();

/**
 * An id from a URL or a form, checked before it becomes part of an API path. Without this, a
 * crafted value such as "../blocks/<id>" would make the server call a different endpoint.
 */
export function idSegment(id: string): string {
  if (!Uuid.safeParse(id).success) {
    throw new ApiError(
      404,
      "Not found",
      "That id does not exist.",
      "NOT_FOUND",
    );
  }
  return encodeURIComponent(id);
}

/** A calendar date from a form, checked before it becomes part of an API path. */
export function dateSegment(date: string): string {
  if (tryParseIsoDate(date) === undefined) {
    throw new ApiError(
      422,
      "Validation failed",
      "The date must be a real date (YYYY-MM-DD).",
      "VALIDATION_FAILED",
    );
  }
  return encodeURIComponent(date);
}

async function call<T extends z.ZodType>(
  path: string,
  schema: T | undefined,
  init: Init = {},
): Promise<z.output<T>> {
  const headers: Record<string, string> = {};
  if (env.API_KEY !== undefined) headers["x-api-key"] = env.API_KEY;
  let body: BodyInit | undefined;
  if (init.form !== undefined) {
    body = init.form;
  } else if (init.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.body);
  }

  const response = await fetch(`${env.API_BASE_URL}${path}`, {
    method: init.method ?? "GET",
    headers,
    ...(body === undefined ? {} : { body }),
    // Every page shows live numbers: never serve a cached API answer.
    cache: "no-store",
  });
  if (!response.ok) {
    const problem: unknown = await response.json().catch(() => undefined);
    throw toApiError(response.status, problem);
  }
  if (schema === undefined || response.status === 204)
    return undefined as z.output<T>;
  return schema.parse(await response.json());
}

/** The dashboard's "today": FIXED_TODAY when set (demos, tests), else the current UTC date. */
export function today(): IsoDate {
  return parseIsoDate(env.FIXED_TODAY ?? new Date().toISOString().slice(0, 10));
}

export const api = {
  listBlocks: () => call("/v1/blocks?limit=200", listOf(BlockListItemSchema)),
  getBlock: (id: string) =>
    call(`/v1/blocks/${idSegment(id)}`, BlockResponseSchema),
  createBlock: (body: unknown) =>
    call("/v1/blocks", BlockResponseSchema, { method: "POST", body }),
  evaluation: (id: string) =>
    call(`/v1/blocks/${idSegment(id)}/evaluation`, EvaluationSchema),
  pace: (id: string) =>
    call(`/v1/blocks/${idSegment(id)}/pace`, PaceResponseSchema),
  alerts: (blockId: string) =>
    call(
      `/v1/alerts?blockId=${idSegment(blockId)}&limit=50`,
      listOf(AlertEventSchema),
    ),
  putSnapshot: (id: string, asOfDate: string, body: unknown) =>
    call(
      `/v1/blocks/${idSegment(id)}/snapshots/${dateSegment(asOfDate)}`,
      SnapshotPutResponseSchema,
      {
        method: "PUT",
        body,
      },
    ),
  importCsv: (id: string, form: FormData) =>
    call(`/v1/blocks/${idSegment(id)}/snapshots/import`, ImportResponseSchema, {
      method: "POST",
      form,
    }),
  calculate: (body: unknown) =>
    call("/v1/calculations/attrition", EvaluationSchema, {
      method: "POST",
      body,
    }),
  listEndpoints: () =>
    call("/v1/webhook-endpoints?limit=200", listOf(WebhookEndpointSchema)),
  createEndpoint: (url: string) =>
    call("/v1/webhook-endpoints", WebhookEndpointCreatedSchema, {
      method: "POST",
      body: { url },
    }),
  deleteEndpoint: (id: string) =>
    call(`/v1/webhook-endpoints/${idSegment(id)}`, undefined, {
      method: "DELETE",
    }),
  testEndpoint: (id: string) =>
    call(`/v1/webhook-endpoints/${idSegment(id)}/test`, undefined, {
      method: "POST",
    }),
  deliveries: () =>
    call("/v1/webhook-deliveries?limit=50", listOf(WebhookDeliverySchema)),
};
