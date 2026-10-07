import { describe, expect, it } from "vitest";
import { API_KEY, useTestApp } from "./support/app.js";

const { http } = useTestApp();
const PROBLEM = /application\/problem\+json/;
const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("health", () => {
  it("GET /healthz is 200 {status: ok} without an API key", async () => {
    const res = await http().get("/healthz").expect(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("GET /readyz is 200 when the database answers", async () => {
    await http().get("/readyz").expect(200);
  });
});

describe("request id", () => {
  it("echoes x-request-id when the caller sends one", async () => {
    const res = await http().get("/healthz").set("x-request-id", "trace-123");
    expect(res.headers["x-request-id"]).toBe("trace-123");
  });

  it("generates a UUID v7 when the caller sends none", async () => {
    const res = await http().get("/healthz");
    expect(res.headers["x-request-id"]).toMatch(UUID_V7);
  });
});

describe("errors are problem+json", () => {
  it("unknown routes are 404 NOT_FOUND with the request id as instance", async () => {
    const res = await http()
      .get("/v1/nothing-here")
      .set("x-api-key", API_KEY)
      .set("x-request-id", "req-404")
      .expect(404)
      .expect("content-type", PROBLEM);
    expect(res.body).toEqual({
      type: "https://github.com/alihdrndm/blockpace/blob/main/docs/ERRORS.md#NOT_FOUND",
      title: "Not found",
      status: 404,
      detail: "No route matches GET /v1/nothing-here.",
      code: "NOT_FOUND",
      instance: "req-404",
    });
  });

  it("validation failures are 422 VALIDATION_FAILED with one entry per issue", async () => {
    const res = await http()
      .post("/v1/calculations/attrition")
      .set("x-api-key", API_KEY)
      .send({
        currency: "usd",
        terms: { basis: "weekly" },
        nights: [],
        extra: 1,
      })
      .expect(422)
      .expect("content-type", PROBLEM);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    const paths = (res.body.errors as { path: string }[]).map((e) => e.path);
    expect(paths).toEqual(
      expect.arrayContaining(["currency", "terms.basis", ""]),
    );
    for (const error of res.body.errors as Record<string, unknown>[]) {
      expect(Object.keys(error).sort()).toEqual(["code", "message", "path"]);
    }
  });

  it("malformed JSON is 400 BAD_REQUEST without echoing the parser message", async () => {
    const res = await http()
      .post("/v1/calculations/attrition")
      .set("x-api-key", API_KEY)
      .set("content-type", "application/json")
      .send("{not json")
      .expect(400)
      .expect("content-type", PROBLEM);
    expect(res.body.code).toBe("BAD_REQUEST");
    expect(res.body.detail).toBe("The request could not be processed.");
  });
});

describe("authentication (x-api-key)", () => {
  it("rejects /v1 without a key: 401 UNAUTHORIZED", async () => {
    const res = await http()
      .post("/v1/calculations/attrition")
      .send({})
      .expect(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("rejects a wrong key, including one that only differs in length", async () => {
    await http()
      .post("/v1/calculations/attrition")
      .set("x-api-key", "test-ke")
      .send({})
      .expect(401);
    await http()
      .post("/v1/calculations/attrition")
      .set("x-api-key", "wrong-key")
      .send({})
      .expect(401);
  });

  it("lets the right key through to validation", async () => {
    await http()
      .post("/v1/calculations/attrition")
      .set("x-api-key", API_KEY)
      .send({})
      .expect(422);
  });

  it("never asks for a key on /healthz, /readyz, /docs or /docs-json", async () => {
    for (const path of ["/healthz", "/readyz", "/docs", "/docs-json"]) {
      const res = await http().get(path);
      expect(res.status, path).toBe(200);
    }
  });
});

describe("security headers and docs", () => {
  it("sets helmet's default headers", async () => {
    const res = await http().get("/healthz");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("documents the calculator request and responses from the Zod schemas", async () => {
    const res = await http().get("/docs-json").expect(200);
    const operation = res.body.paths["/v1/calculations/attrition"].post;
    const body = JSON.stringify(operation.requestBody);
    expect(body).toContain("pickedUpRooms");
    expect(Object.keys(operation.responses).sort()).toEqual([
      "200",
      "401",
      "422",
      "429",
    ]);
    expect(res.body.components.securitySchemes.apiKey.name).toBe("x-api-key");
  });
});
