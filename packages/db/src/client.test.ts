import { describe, expect, it } from "vitest";
import { createPool } from "./client.js";

describe("createPool", () => {
  it("caps the pool at 10 connections", async () => {
    const pool = createPool("postgres://u:p@localhost:1/none");
    expect(pool.options.max).toBe(10);
    await pool.end();
  });
});
