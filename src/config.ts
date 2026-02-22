import fs from "node:fs";
import { parse as parseToml } from "smol-toml";
import { z } from "zod";

import type { Config, SourceConfig } from "./types.js";

export const sourceConfigSchema = z.object({
  id: z.string().min(1, "Source id is required"),
  host: z.string().min(1, "Source host is required"),
  port: z.number().int().positive().optional().default(443),
  protocol: z.enum(["https", "http"]).optional().default("https"),
  api_key: z.string().min(1, "Source api_key is required"),
  readonly: z.boolean().optional().default(false),
  connection_timeout: z.number().positive().optional().default(5),
  max_search_results: z.number().int().positive().optional().default(250),
  collections: z.array(z.string()).min(1, "At least one collection pattern is required"),
});

const configSchema = z.object({
  sources: z.array(sourceConfigSchema).min(1, "At least one source is required"),
});

export function expandEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}|\$([A-Z_][A-Z0-9_]*)/gi, (match, braced, bare) => {
    const varName = braced ?? bare;
    const envValue = process.env[varName];
    if (envValue === undefined) {
      throw new Error(`Environment variable ${varName} is not set (referenced in config)`);
    }
    return envValue;
  });
}

function toSourceConfig(raw: z.infer<typeof sourceConfigSchema>): SourceConfig {
  return {
    id: raw.id,
    host: expandEnvVars(raw.host),
    port: raw.port,
    protocol: raw.protocol,
    apiKey: expandEnvVars(raw.api_key),
    readonly: raw.readonly,
    connectionTimeout: raw.connection_timeout,
    maxSearchResults: raw.max_search_results,
    collections: raw.collections,
  };
}

export function loadConfig(filePath: string): Config {
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read config file "${filePath}": ${message}`);
  }

  let parsed: unknown;
  try {
    parsed = parseToml(content);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse TOML in "${filePath}": ${message}`);
  }

  const result = configSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid config in "${filePath}":\n${issues}`);
  }

  const sources = result.data.sources.map(toSourceConfig);
  return { sources };
}
