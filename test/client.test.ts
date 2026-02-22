import { describe, expect, it } from "vitest";

import { TypesenseClientManager } from "../src/client.js";
import type { SourceConfig } from "../src/types.js";

const testSources: SourceConfig[] = [
  {
    id: "production",
    host: "ts.example.com",
    port: 443,
    protocol: "https",
    apiKey: "test-key",
    readonly: true,
    connectionTimeout: 5,
    maxSearchResults: 250,
    collections: ["creators_production*"],
  },
  {
    id: "staging",
    host: "staging.example.com",
    port: 8108,
    protocol: "http",
    apiKey: "staging-key",
    readonly: false,
    connectionTimeout: 10,
    maxSearchResults: 100,
    collections: ["creators_staging*"],
  },
];

describe("TypesenseClientManager", () => {
  it("creates a client for a known source", () => {
    const manager = new TypesenseClientManager(testSources);
    const client = manager.getClient("production");

    expect(client).toBeDefined();
    expect(client.configuration).toBeDefined();
  });

  it("returns the same client instance on repeated calls", () => {
    const manager = new TypesenseClientManager(testSources);
    const first = manager.getClient("production");
    const second = manager.getClient("production");

    expect(first).toBe(second);
  });

  it("creates different clients for different sources", () => {
    const manager = new TypesenseClientManager(testSources);
    const prod = manager.getClient("production");
    const staging = manager.getClient("staging");

    expect(prod).not.toBe(staging);
  });

  it("throws for unknown source", () => {
    const manager = new TypesenseClientManager(testSources);

    expect(() => manager.getClient("nonexistent")).toThrow("Unknown source: nonexistent");
  });
});
