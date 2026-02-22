import { describe, expect, it } from "vitest";

import {
  checkCollectionAccess,
  collectionMatchesPattern,
  isCollectionAllowed,
} from "../src/mcp-helpers.js";
import type { SourceConfig } from "../src/types.js";

describe("collectionMatchesPattern", () => {
  it("matches exact name without wildcard", () => {
    expect(collectionMatchesPattern("creators_production", "creators_production")).toBe(true);
  });

  it("rejects non-matching exact name", () => {
    expect(collectionMatchesPattern("creators_staging", "creators_production")).toBe(false);
  });

  it("matches prefix with trailing wildcard", () => {
    expect(collectionMatchesPattern("creators_production", "creators_production*")).toBe(true);
    expect(
      collectionMatchesPattern(
        "creators_production_2026-01-15T00:00:00.000Z",
        "creators_production*"
      )
    ).toBe(true);
  });

  it("rejects non-matching prefix with wildcard", () => {
    expect(collectionMatchesPattern("creators_staging", "creators_production*")).toBe(false);
  });

  it("handles single character after prefix", () => {
    expect(collectionMatchesPattern("creators_test1", "creators_test*")).toBe(true);
  });
});

const productionSource: SourceConfig = {
  id: "production",
  host: "ts.example.com",
  port: 443,
  protocol: "https",
  apiKey: "key",
  readonly: true,
  connectionTimeout: 5,
  maxSearchResults: 250,
  collections: ["creators_production*", "creator_content_production*"],
};

const stagingSource: SourceConfig = {
  id: "staging",
  host: "ts.example.com",
  port: 443,
  protocol: "https",
  apiKey: "key",
  readonly: false,
  connectionTimeout: 5,
  maxSearchResults: 250,
  collections: ["creators_staging*", "creator_content_staging*"],
};

describe("isCollectionAllowed", () => {
  it("allows collection matching any pattern", () => {
    expect(isCollectionAllowed("creators_production", productionSource)).toBe(true);
    expect(isCollectionAllowed("creator_content_production", productionSource)).toBe(true);
  });

  it("rejects collection not matching any pattern", () => {
    expect(isCollectionAllowed("creators_staging", productionSource)).toBe(false);
  });

  it("allows timestamped collection names", () => {
    expect(
      isCollectionAllowed("creators_staging_2026-01-15T00:00:00.000Z", stagingSource)
    ).toBe(true);
  });
});

describe("checkCollectionAccess", () => {
  it("returns ok for allowed collection", () => {
    const result = checkCollectionAccess("creators_production", productionSource);
    expect(result.ok).toBe(true);
  });

  it("returns error with source id and patterns for blocked collection", () => {
    const result = checkCollectionAccess("creators_staging", productionSource);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.isError).toBe(true);
      const text = result.error.content[0].text;
      expect(text).toContain("creators_staging");
      expect(text).toContain("production");
      expect(text).toContain("creators_production*");
    }
  });
});
