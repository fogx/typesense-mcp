import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { TypesenseClientManager } from "./client.js";
import { logger } from "./logger.js";
import { registerSchemaResource } from "./resources/schema.js";
import type { SchemaCache } from "./schema-cache.js";
import { registerLookupTool } from "./tools/lookup.js";
import { registerManageTool } from "./tools/manage.js";
import { registerSearchTool } from "./tools/search.js";
import type { Config } from "./types.js";

export function createServer(
  config: Config,
  clientManager: TypesenseClientManager,
  schemaCache: SchemaCache
) {
  const server = new McpServer(
    {
      name: "typesense-mcp",
      version: "1.0.0",
    },
    {
      instructions:
        "Use lookup with action=schema to look up field definitions before searching. " +
        "Always exclude embedding fields (embedding, retrievalEmbedding, classificationEmbedding) via exclude_fields. " +
        "Use lookup with action=collections to discover available collections.",
    }
  );

  registerSearchTool(server, config, clientManager, schemaCache);
  registerLookupTool(server, config, clientManager, schemaCache);

  const hasWritableSource = config.sources.some((s) => !s.readonly);
  if (hasWritableSource) {
    registerManageTool(server, config, clientManager);
  }

  registerSchemaResource(server, config, clientManager, schemaCache);

  logger.debug("MCP server instance created");

  return server;
}
