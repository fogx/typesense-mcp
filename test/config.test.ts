import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { expandEnvVars, loadConfig } from "../src/config.js";

vi.mock("node:fs");

describe("expandEnvVars", () => {
  beforeEach(() => {
    process.env.TEST_HOST = "search.example.com";
    process.env.TEST_KEY = "secret-api-key";
  });

  afterEach(() => {
    delete process.env.TEST_HOST;
    delete process.env.TEST_KEY;
  });

  it("expands ${VAR} syntax", () => {
    expect(expandEnvVars("${TEST_HOST}")).toBe("search.example.com");
  });

  it("expands $VAR syntax", () => {
    expect(expandEnvVars("$TEST_HOST")).toBe("search.example.com");
  });

  it("expands multiple variables in one string", () => {
    expect(expandEnvVars("${TEST_HOST}:${TEST_KEY}")).toBe("search.example.com:secret-api-key");
  });

  it("throws for undefined env vars", () => {
    expect(() => expandEnvVars("${NONEXISTENT_VAR}")).toThrow(
      "Environment variable NONEXISTENT_VAR is not set"
    );
  });

  it("returns plain strings unchanged", () => {
    expect(expandEnvVars("plain-string")).toBe("plain-string");
  });
});

describe("loadConfig", () => {
  beforeEach(() => {
    process.env.TS_HOST = "ts.example.com";
    process.env.TS_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.TS_HOST;
    delete process.env.TS_KEY;
    vi.restoreAllMocks();
  });

  const validToml = `
[[sources]]
id = "production"
host = "\${TS_HOST}"
port = 443
protocol = "https"
api_key = "\${TS_KEY}"
readonly = true
collections = ["creators_production*"]

[[sources]]
id = "staging"
host = "staging.example.com"
api_key = "staging-key"
readonly = false
collections = ["creators_staging*"]
`;

  it("parses valid TOML with env var expansion", () => {
    vi.mocked(fs.readFileSync).mockReturnValue(validToml);

    const config = loadConfig("test.toml");

    expect(config.sources).toHaveLength(2);
    expect(config.sources[0]).toEqual({
      id: "production",
      host: "ts.example.com",
      port: 443,
      protocol: "https",
      apiKey: "test-key",
      readonly: true,
      connectionTimeout: 5,
      maxSearchResults: 250,
      collections: ["creators_production*"],
    });
  });

  it("applies defaults for optional fields", () => {
    vi.mocked(fs.readFileSync).mockReturnValue(validToml);

    const config = loadConfig("test.toml");

    expect(config.sources[1]).toEqual({
      id: "staging",
      host: "staging.example.com",
      port: 443,
      protocol: "https",
      apiKey: "staging-key",
      readonly: false,
      connectionTimeout: 5,
      maxSearchResults: 250,
      collections: ["creators_staging*"],
    });
  });

  it("throws on missing config file", () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });

    expect(() => loadConfig("missing.toml")).toThrow('Failed to read config file "missing.toml"');
  });

  it("throws on invalid TOML syntax", () => {
    vi.mocked(fs.readFileSync).mockReturnValue("this is [not valid toml");

    expect(() => loadConfig("bad.toml")).toThrow('Failed to parse TOML in "bad.toml"');
  });

  it("throws on missing required fields", () => {
    vi.mocked(fs.readFileSync).mockReturnValue(`
[[sources]]
id = "test"
`);

    expect(() => loadConfig("incomplete.toml")).toThrow("Invalid config");
  });

  it("throws on invalid sources shape", () => {
    vi.mocked(fs.readFileSync).mockReturnValue("[sources]");

    expect(() => loadConfig("empty.toml")).toThrow("Invalid config");
  });

  it("throws when collections is missing", () => {
    vi.mocked(fs.readFileSync).mockReturnValue(`
[[sources]]
id = "test"
host = "test.example.com"
api_key = "test-key"
`);

    expect(() => loadConfig("no-collections.toml")).toThrow("Invalid config");
  });

  it("throws when collections is empty", () => {
    vi.mocked(fs.readFileSync).mockReturnValue(`
[[sources]]
id = "test"
host = "test.example.com"
api_key = "test-key"
collections = []
`);

    expect(() => loadConfig("empty-collections.toml")).toThrow("Invalid config");
  });
});
