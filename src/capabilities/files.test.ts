/**
 * Unit tests for files capability path validation.
 * Run with: npm test
 *
 * Coverage targets:
 *  - noRelativeSegments Zod refine via filesListItemsInputSchema / filesReadInputSchema
 *  - Encoded-separator traversal patterns (%2f, %2e, mixed) that a split-then-decode
 *    approach would miss (see MSM-19 SecurityEngineer findings)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filesListItemsInputSchema, filesReadInputSchema } from "./files.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function acceptsPath(schema: typeof filesListItemsInputSchema | typeof filesReadInputSchema, path: string): boolean {
  const result = schema.safeParse({ path });
  return result.success;
}

// ---------------------------------------------------------------------------
// filesListItemsInputSchema — path validation
// ---------------------------------------------------------------------------

describe("filesListItemsInputSchema path validation", () => {
  // Valid paths
  it("accepts a simple absolute path", () => {
    assert.ok(acceptsPath(filesListItemsInputSchema, "/Documents"));
  });

  it("accepts a nested path", () => {
    assert.ok(acceptsPath(filesListItemsInputSchema, "/Documents/Reports/2026"));
  });

  it("accepts a path with URL-safe encoded spaces", () => {
    assert.ok(acceptsPath(filesListItemsInputSchema, "/My%20Documents"));
  });

  it("accepts a path with a leading slash only", () => {
    assert.ok(acceptsPath(filesListItemsInputSchema, "/"));
  });

  // Literal traversal — must reject
  it("rejects a literal .. segment", () => {
    assert.ok(!acceptsPath(filesListItemsInputSchema, "/../secrets"));
  });

  it("rejects a literal . segment", () => {
    assert.ok(!acceptsPath(filesListItemsInputSchema, "/./Documents"));
  });

  it("rejects .. embedded in the middle", () => {
    assert.ok(!acceptsPath(filesListItemsInputSchema, "/Documents/../secrets"));
  });

  // Encoded-separator traversal — the cases SecurityEngineer confirmed bypass
  it("rejects %2f-encoded slash creating .. segment: foo%2f..%2fbar", () => {
    assert.ok(!acceptsPath(filesListItemsInputSchema, "/foo%2f..%2fbar"));
  });

  it("rejects fully encoded traversal: %2e%2e%2fsecrets", () => {
    assert.ok(!acceptsPath(filesListItemsInputSchema, "/%2e%2e%2fsecrets"));
  });

  it("rejects mixed encoded dot and slash: .%2fsecrets", () => {
    assert.ok(!acceptsPath(filesListItemsInputSchema, "/.%2fsecrets"));
  });

  it("rejects uppercase-encoded: %2F..%2Fbar", () => {
    assert.ok(!acceptsPath(filesListItemsInputSchema, "/foo%2F..%2Fbar"));
  });

  it("accepts double-encoded segment: %252e%252e (single-decode gives %2e%2e, not .. — not a traversal vector)", () => {
    // Double encoding decodes to %2e%2e (not ..) in a single decodeURIComponent pass.
    // The validator must not over-reject here — double-encoded paths are just invalid
    // file names on Graph and Graph will return 400, but they are not traversal vectors.
    assert.ok(acceptsPath(filesListItemsInputSchema, "/%252e%252e"));
  });

  it("rejects malformed percent-encoding: %zz", () => {
    assert.ok(!acceptsPath(filesListItemsInputSchema, "/%zz/documents"));
  });

  // Mutual exclusion
  it("rejects both itemId and path provided", () => {
    const result = filesListItemsInputSchema.safeParse({ itemId: "abc", path: "/Documents" });
    assert.ok(!result.success);
  });

  it("accepts only itemId", () => {
    const result = filesListItemsInputSchema.safeParse({ itemId: "abc123" });
    assert.ok(result.success);
  });

  it("accepts neither (lists root)", () => {
    const result = filesListItemsInputSchema.safeParse({});
    assert.ok(result.success);
  });
});

// ---------------------------------------------------------------------------
// filesReadInputSchema — path validation
// ---------------------------------------------------------------------------

describe("filesReadInputSchema path validation", () => {
  it("rejects %2f-encoded slash creating .. segment", () => {
    assert.ok(!acceptsPath(filesReadInputSchema, "/foo%2f..%2fbar"));
  });

  it("rejects fully encoded traversal: %2e%2e%2fsecrets", () => {
    assert.ok(!acceptsPath(filesReadInputSchema, "/%2e%2e%2fsecrets"));
  });

  it("rejects mixed encoded dot and slash: .%2fsecrets", () => {
    assert.ok(!acceptsPath(filesReadInputSchema, "/.%2fsecrets"));
  });

  it("accepts a valid file path", () => {
    assert.ok(acceptsPath(filesReadInputSchema, "/Documents/report.txt"));
  });

  it("requires itemId or path", () => {
    const result = filesReadInputSchema.safeParse({});
    assert.ok(!result.success);
  });
});
