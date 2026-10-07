import { z } from "zod";
import {
  AttritionTermsSchema,
  BlockNightSchema,
  EvaluationSchema,
  IsoDateSchema,
  RiskLevelSchema,
  refineBlockNights,
  SnapshotNightSchema,
} from "./model.js";

// Request, query and response shapes of the HTTP API. They live in core, next to the domain
// schemas they reuse, so the API validates with them and Swagger is generated from them.
// Everything is a strictObject: unknown keys are rejected, never silently dropped.

const uuid = z.uuid();
const timestamp = z.iso.datetime();
const money = z.number().int();

export const BlockStatusSchema = z.enum(["active", "closed"]);
const name = z.string().min(1).max(120);

// ---- pagination -------------------------------------------------------------------------

// The cursor is the base64url of the last item's id; ids are time-ordered UUIDv7 values.
// btoa/atob instead of Buffer so this file also works in the browser bundle of the web app.
export const encodeCursor = (id: string): string =>
  btoa(id).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function decodeCursor(cursor: string): string | undefined {
  let id: string;
  try {
    id = atob(cursor.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return undefined;
  }
  return uuid.safeParse(id).success && encodeCursor(id) === cursor
    ? id
    : undefined;
}

const CursorSchema = z
  .string()
  .refine((value) => decodeCursor(value) !== undefined, "cursor is not valid");

export const ListQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: CursorSchema.optional(),
});

export const BlocksQuerySchema = ListQuerySchema.extend({
  status: BlockStatusSchema.optional(),
});
export const AlertsQuerySchema = ListQuerySchema.extend({
  blockId: uuid.optional(),
});
export const DeliveriesQuerySchema = ListQuerySchema.extend({
  status: z.enum(["pending", "delivered", "failed"]).optional(),
  endpointId: uuid.optional(),
});

export const IdParamSchema = z.strictObject({ id: uuid });
export const SnapshotParamsSchema = z.strictObject({
  id: uuid,
  asOfDate: IsoDateSchema,
});
export const EvaluationQuerySchema = z.strictObject({
  asOf: IsoDateSchema.optional(),
});

// ---- requests ---------------------------------------------------------------------------

export const CreateBlockRequestSchema = z
  .strictObject({
    name,
    hotelName: name,
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, "must be a 3-letter uppercase currency code"),
    cutoffDate: IsoDateSchema,
    terms: AttritionTermsSchema,
    nights: z.array(BlockNightSchema),
  })
  .superRefine((block, ctx) =>
    refineBlockNights(block.nights, block.cutoffDate, ctx),
  );

export const PatchBlockRequestSchema = z
  .strictObject({
    name: name.optional(),
    hotelName: name.optional(),
    cutoffDate: IsoDateSchema.optional(),
    status: BlockStatusSchema.optional(),
    // The whole terms object, not a partial one: a half-updated contract is never meaningful.
    terms: AttritionTermsSchema.optional(),
  })
  .refine(
    (patch) => Object.keys(patch).length > 0,
    "send at least one field to change",
  );

export const SnapshotPutRequestSchema = z
  .strictObject({
    nights: z.array(SnapshotNightSchema).min(1).max(60),
    note: z.string().max(500).optional(),
  })
  .superRefine((snapshot, ctx) => {
    const seen = new Set<string>();
    for (const night of snapshot.nights) {
      if (seen.has(night.date)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate night ${night.date}`,
          path: ["nights"],
        });
      }
      seen.add(night.date);
    }
  });

export const CalculationRequestSchema = z
  .strictObject({
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, "must be a 3-letter uppercase currency code"),
    cutoffDate: IsoDateSchema.optional(),
    today: IsoDateSchema.optional(),
    terms: AttritionTermsSchema,
    nights: z.array(
      BlockNightSchema.extend({
        pickedUpRooms: SnapshotNightSchema.shape.pickedUpRooms,
        resoldRooms: SnapshotNightSchema.shape.resoldRooms,
      }),
    ),
  })
  .superRefine((request, ctx) =>
    refineBlockNights(request.nights, request.cutoffDate, ctx),
  );

export const CreateWebhookEndpointRequestSchema = z.strictObject({
  url: z.string().max(2000).pipe(z.url()),
});

// ---- responses --------------------------------------------------------------------------

export const BlockResponseSchema = z.strictObject({
  id: uuid,
  name: z.string(),
  hotelName: z.string(),
  currency: z.string(),
  startDate: IsoDateSchema,
  endDate: IsoDateSchema,
  cutoffDate: IsoDateSchema,
  status: BlockStatusSchema,
  terms: AttritionTermsSchema,
  nights: z.array(BlockNightSchema),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const BlockLatestSchema = z.strictObject({
  riskLevel: RiskLevelSchema,
  pickupPct: z.number(),
  shortfallRoomNights: z.number().int(),
  totalMinor: money,
  projectedTotalMinor: money.optional(),
  snapshotAsOf: IsoDateSchema.optional(),
});

export const BlockListItemSchema = BlockResponseSchema.omit({
  nights: true,
}).extend({
  latest: BlockLatestSchema,
});

export const PacePointSchema = z.strictObject({
  asOfDate: IsoDateSchema,
  pickedUpRoomNights: z.number().int(),
  pickupPct: z.number(),
  shortfallRoomNights: z.number().int(),
  totalMinor: money,
});

export const PaceResponseSchema = z.strictObject({
  contractedRoomNights: z.number().int(),
  minimumRoomNights: z.number().int(),
  cutoffDate: IsoDateSchema,
  points: z.array(PacePointSchema),
});

export const SnapshotResponseSchema = z.strictObject({
  id: uuid,
  blockId: uuid,
  asOfDate: IsoDateSchema,
  source: z.enum(["manual", "csv", "api"]),
  note: z.string().optional(),
  nights: z.array(SnapshotNightSchema),
  createdAt: timestamp,
});

export const SnapshotPutResponseSchema = z.strictObject({
  snapshot: SnapshotResponseSchema,
  evaluation: EvaluationSchema,
});

export const ImportResponseSchema = z.strictObject({
  snapshots: z.number().int(),
});

export const AlertEventSchema = z.strictObject({
  id: uuid,
  blockId: uuid,
  type: z.enum(["RISK_LEVEL_CHANGED", "CUTOFF_APPROACHING", "SNAPSHOT_STALE"]),
  dedupeKey: z.string(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: timestamp,
});

export const WebhookEndpointSchema = z.strictObject({
  id: uuid,
  url: z.string(),
  active: z.boolean(),
  createdAt: timestamp,
});

/** The secret appears in this response only, never again. */
export const WebhookEndpointCreatedSchema = WebhookEndpointSchema.extend({
  secret: z.string(),
});

export const WebhookDeliverySchema = z.strictObject({
  id: uuid,
  endpointId: uuid,
  alertEventId: uuid.optional(),
  eventType: z.string(),
  status: z.enum(["pending", "delivered", "failed"]),
  attempts: z.number().int(),
  nextAttemptAt: timestamp,
  lastStatusCode: z.number().int().optional(),
  lastError: z.string().optional(),
  deliveredAt: timestamp.optional(),
  createdAt: timestamp,
});

/** `{ items, nextCursor? }` for any list endpoint. */
export const listOf = <T extends z.ZodType>(item: T) =>
  z.strictObject({ items: z.array(item), nextCursor: z.string().optional() });

export const ProblemDetailsSchema = z.strictObject({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  code: z.string(),
  instance: z.string(),
  errors: z
    .array(
      z.strictObject({
        path: z.string(),
        code: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
});

export type CreateBlockRequest = z.output<typeof CreateBlockRequestSchema>;
export type PatchBlockRequest = z.output<typeof PatchBlockRequestSchema>;
export type SnapshotPutRequest = z.output<typeof SnapshotPutRequestSchema>;
export type CalculationRequest = z.output<typeof CalculationRequestSchema>;
export type ListQuery = z.output<typeof ListQuerySchema>;
export type ProblemDetails = z.output<typeof ProblemDetailsSchema>;
