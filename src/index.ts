#!/usr/bin/env node
process.env.NODE_NO_WARNINGS = "1";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { TypesenseClientManager } from "./client.js";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { SchemaCache } from "./schema-cache.js";
import { createServer } from "./server.js";

function printUsage() {
  console.error("Usage: typesense-mcp <config-file>");
  console.error("  config-file: Path to TOML configuration file");
}

let isShuttingDown = false;

async function main() {
  const configPath = process.argv[2];

  if (!configPath) {
    printUsage();
    process.exit(1);
  }

  logger.info(`Loading config from ${configPath}`);
  const config = loadConfig(configPath);
  logger.info(
    `Loaded ${config.sources.length} source(s): ${config.sources.map((s) => s.id).join(", ")}`
  );

  const clientManager = new TypesenseClientManager(config.sources);
  const schemaCache = new SchemaCache();
  logger.info("Warming up schema cache...");
  await schemaCache.warmup(config, clientManager);
  logger.info("Schema cache ready");
  const server = createServer(config, clientManager, schemaCache);
  const transport = new StdioServerTransport();

  function shutdown() {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info("Shutting down...");

    const hardTimeout = setTimeout(() => {
      logger.error("Shutdown timed out, forcing exit");
      process.exit(1);
    }, 5000);
    hardTimeout.unref();

    server
      .close()
      .then(() => {
        logger.info("Clean shutdown complete");
        process.exit(0);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`Error during shutdown: ${message}`);
        process.exit(1);
      });
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  process.stdin.on("end", shutdown);

  await server.connect(transport);
  logger.info("typesense-mcp server ready on stdio");
}

main().catch((err) => {
  logger.error("Fatal error during startup", {
    err: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
