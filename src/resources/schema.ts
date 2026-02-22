import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { TypesenseClientManager } from "../client.js";
import { logger } from "../logger.js";
import { isCollectionAllowed } from "../mcp-helpers.js";
import type { SchemaCache } from "../schema-cache.js";
import type { Config } from "../types.js";

export function registerSchemaResource(
  server: McpServer,
  config: Config,
  clientManager: TypesenseClientManager,
  schemaCache: SchemaCache
) {
  server.registerResource(
    "collection_schema",
    new ResourceTemplate("collection://{source}/{collection}", {
      list: async () => {
        const resources: Array<{
          uri: string;
          name: string;
          description: string;
        }> = [];

        for (const source of config.sources) {
          try {
            const client = clientManager.getClient(source.id);
            const collections = await client.collections().retrieve();

            for (const col of collections) {
              if (!isCollectionAllowed(col.name, source)) continue;
              resources.push({
                uri: `collection://${source.id}/${col.name}`,
                name: `${col.name} (${source.id})`,
                description: `Schema for ${col.name} — ${col.num_documents ?? 0} docs`,
              });
            }
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            logger.warn(`Failed to list collections for source "${source.id}": ${message}`);
          }
        }

        return { resources };
      },
    }),
    {
      title: "Collection Schema",
      description:
        "Field schema for a Typesense collection. Returns all fields from the cached schema.",
      mimeType: "text/plain",
    },
    async (uri, variables) => {
      const sourceId = Array.isArray(variables.source) ? variables.source[0] : variables.source;
      const collection = Array.isArray(variables.collection)
        ? variables.collection[0]
        : variables.collection;

      const source = config.sources.find((s) => s.id === sourceId);
      if (!source) {
        throw new Error(
          `Unknown source: ${sourceId}. Available: ${config.sources.map((s) => s.id).join(", ")}`
        );
      }

      if (!isCollectionAllowed(collection, source)) {
        throw new Error(
          `Collection '${collection}' is not allowed on source '${sourceId}'. ` +
            `Allowed patterns: ${source.collections.join(", ")}`
        );
      }

      return {
        contents: [
          {
            uri: uri.href,
            text: schemaCache.lookup(sourceId, collection, "*"),
          },
        ],
      };
    }
  );
}
