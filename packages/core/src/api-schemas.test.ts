import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as api from "./api-schemas.js";

const night = (date: string) => ({
  date,
  contractedRooms: 10,
  rateMinor: 10000,
});
const terms = { basis: "cumulative", allowedAttritionPct: 15 };
const ID = "01900000-0000-7000-8000-000000000001";

const issues = (schema: z.ZodType, input: unknown) => {
  const result = schema.safeParse(input);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.message);
};

describe("cursors", () => {
  it("round-trip an id through base64url", () => {
    const cursor = api.encodeCursor(ID);
    expect(cursor).not.toMatch(/[+/=]/);
    expect(api.decodeCursor(cursor)).toBe(ID);
  });

  it("reject cursors that are not a base64url id", () => {
    expect(api.decodeCursor("not base64!")).toBeUndefined();
    expect(api.decodeCursor(api.encodeCursor("hello"))).toBeUndefined();
    expect(api.ListQuerySchema.safeParse({ cursor: "zzz" }).success).toBe(
      false,
    );
  });
});

describe("list queries", () => {
  it("default limit to 50 and coerce query strings", () => {
    expect(api.ListQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(api.ListQuerySchema.parse({ limit: "20" }).limit).toBe(20);
  });

  it("reject limits outside 1 to 200 and unknown keys", () => {
    expect(api.ListQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(api.ListQuerySchema.safeParse({ limit: "201" }).success).toBe(false);
    expect(api.ListQuerySchema.safeParse({ page: "2" }).success).toBe(false);
  });

  it("accept the documented filters", () => {
    expect(api.BlocksQuerySchema.parse({ status: "closed" }).status).toBe(
      "closed",
    );
    expect(api.AlertsQuerySchema.parse({ blockId: ID }).blockId).toBe(ID);
    expect(
      api.DeliveriesQuerySchema.parse({ status: "failed", endpointId: ID })
        .status,
    ).toBe("failed");
    expect(api.BlocksQuerySchema.safeParse({ status: "open" }).success).toBe(
      false,
    );
  });
});

describe("CreateBlockRequest", () => {
  const valid = {
    name: "TechConf",
    hotelName: "Harborview Hotel",
    currency: "USD",
    cutoffDate: "2026-10-20",
    terms,
    nights: [night("2026-11-10"), night("2026-11-11")],
  };

  it("accepts a valid block", () => {
    expect(api.CreateBlockRequestSchema.safeParse(valid).success).toBe(true);
  });

  it("enforces name lengths 1 to 120", () => {
    expect(
      issues(api.CreateBlockRequestSchema, { ...valid, name: "" }),
    ).not.toEqual([]);
    expect(
      issues(api.CreateBlockRequestSchema, {
        ...valid,
        hotelName: "x".repeat(121),
      }),
    ).not.toEqual([]);
  });

  it("applies the night rules (consecutive, cutoff not after first night)", () => {
    const gap = {
      ...valid,
      nights: [night("2026-11-10"), night("2026-11-12")],
    };
    expect(issues(api.CreateBlockRequestSchema, gap).join()).toMatch(
      /not consecutive/,
    );
    const late = { ...valid, cutoffDate: "2026-11-11" };
    expect(issues(api.CreateBlockRequestSchema, late).join()).toMatch(
      /cutoffDate/,
    );
  });
});

describe("PatchBlockRequest", () => {
  it("accepts any single field and rejects an empty body or nights", () => {
    expect(
      api.PatchBlockRequestSchema.safeParse({ status: "closed" }).success,
    ).toBe(true);
    expect(issues(api.PatchBlockRequestSchema, {}).join()).toMatch(
      /at least one field/,
    );
    expect(api.PatchBlockRequestSchema.safeParse({ nights: [] }).success).toBe(
      false,
    );
  });
});

describe("SnapshotPutRequest", () => {
  it("accepts nights with an optional note and rejects duplicates", () => {
    const ok = {
      nights: [{ date: "2026-11-10", pickedUpRooms: 3 }],
      note: "from the hotel",
    };
    expect(api.SnapshotPutRequestSchema.parse(ok).nights[0]?.resoldRooms).toBe(
      0,
    );
    const twice = {
      nights: [
        { date: "2026-11-10", pickedUpRooms: 3 },
        { date: "2026-11-10", pickedUpRooms: 4 },
      ],
    };
    expect(issues(api.SnapshotPutRequestSchema, twice).join()).toMatch(
      /duplicate night/,
    );
    expect(api.SnapshotPutRequestSchema.safeParse({ nights: [] }).success).toBe(
      false,
    );
  });
});

describe("CalculationRequest", () => {
  it("accepts nights with pickup and makes cutoffDate and today optional", () => {
    const request = {
      currency: "USD",
      terms,
      nights: [{ ...night("2026-11-10"), pickedUpRooms: 8 }],
    };
    const parsed = api.CalculationRequestSchema.parse(request);
    expect(parsed.cutoffDate).toBeUndefined();
    expect(parsed.nights[0]?.resoldRooms).toBe(0);
    const gap = {
      ...request,
      nights: [
        { ...night("2026-11-10"), pickedUpRooms: 8 },
        { ...night("2026-11-12"), pickedUpRooms: 8 },
      ],
    };
    expect(issues(api.CalculationRequestSchema, gap).join()).toMatch(
      /not consecutive/,
    );
  });
});

describe("CreateWebhookEndpointRequest", () => {
  it("requires a URL", () => {
    expect(
      api.CreateWebhookEndpointRequestSchema.safeParse({
        url: "https://example.com/hook",
      }).success,
    ).toBe(true);
    expect(
      api.CreateWebhookEndpointRequestSchema.safeParse({ url: "not a url" })
        .success,
    ).toBe(false);
  });
});

describe("JSON Schema for Swagger", () => {
  // Every schema the API documents must convert, or the docs generation would fail at boot.
  const requests = [
    api.ListQuerySchema,
    api.BlocksQuerySchema,
    api.AlertsQuerySchema,
    api.DeliveriesQuerySchema,
    api.CreateBlockRequestSchema,
    api.PatchBlockRequestSchema,
    api.SnapshotPutRequestSchema,
    api.CalculationRequestSchema,
    api.CreateWebhookEndpointRequestSchema,
  ];
  const responses = [
    api.BlockResponseSchema,
    api.listOf(api.BlockListItemSchema),
    api.PaceResponseSchema,
    api.SnapshotPutResponseSchema,
    api.ImportResponseSchema,
    api.listOf(api.AlertEventSchema),
    api.WebhookEndpointCreatedSchema,
    api.listOf(api.WebhookDeliverySchema),
    api.ProblemDetailsSchema,
  ];

  it("converts every request and response schema", () => {
    for (const schema of requests) {
      expect(() => z.toJSONSchema(schema, { io: "input" })).not.toThrow();
    }
    for (const schema of responses) {
      expect(() => z.toJSONSchema(schema, { io: "output" })).not.toThrow();
    }
  });
});
