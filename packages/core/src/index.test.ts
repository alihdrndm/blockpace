import { describe, expect, it } from "vitest";
import { CORE_PACKAGE } from "./index.js";

describe("core package", () => {
  it("exposes its package name", () => {
    expect(CORE_PACKAGE).toBe("@alihdrndm/blockpace-core");
  });
});
