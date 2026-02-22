import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { TypesenseClientManager } from "../client.js";
import { logger } from "../logger.js";
import type { SchemaCache } from "../schema-cache.js";
import {
  checkCollectionAccess,
  isCollectionAllowed,
  mcpErrorResult,
  mcpTextResult,
  resolveSource,
} from "../mcp-helpers.js";
import type { Config } from "../types.js";

export function registerLookupTool(
  server: McpServer,
  config: Config,
  clientManager: TypesenseClientManager,
  schemaCache: SchemaCache
) {
  const sourceIds = config.sources.map((s) => s.id);

  server.registerTool(
    "lookup",
    {
      title: "Lookup",
      description:
        "Look up Typesense metadata: collections, schemas, documents, counts, aliases, or synonyms. " +
        "Use action to select the operation. Always exclude embedding fields when retrieving documents.",
      inputSchema: {
        source: z.string().describe(`Typesense source ID. Available: ${sourceIds.join(", ")}`),
        action: z
          .enum(["collections", "schema", "document", "count", "aliases", "synonyms"])
          .describe(
            "Operation to perform. " +
            "'collections' — list all collections. " +
            "'schema' — look up field definitions (requires collection, optional filter). " +
            "'document' — retrieve a single document by ID (requires collection, document_id). " +
            "'count' — count documents (requires collection, optional filter). " +
            "'aliases' — list all aliases. " +
            "'synonyms' — list synonym rules (requires collection)."
          ),
        collection: z
          .string()
          .optional()
          .describe("Collection name. Required for schema, document, count, synonyms."),
        filter: z
          .string()
          .optional()
          .describe(
            "For schema: field name filter — exact name, prefix (e.g. 'channels.YOUTUBE'), or '*' for all. " +
            "For count: filter_by expression to count matching documents."
          ),
        document_id: z
          .string()
          .optional()
          .describe("Document ID to retrieve. Required for action=document."),
        exclude_fields: z
          .string()
          .optional()
          .describe("Comma-separated fields to exclude. Used with action=document."),
      },
    },
    async (params) => {
      try {
        const resolved = resolveSource(params.source, config);
        if (!resolved.ok) return resolved.error;

        const client = clientManager.getClient(params.source);

        switch (params.action) {
          case "collections": {
            const collections = await client.collections().retrieve();
            const allowed = collections.filter((c) =>
              isCollectionAllowed(c.name, resolved.source)
            );
            const summary = allowed.map((c) => ({
              name: c.name,
              num_documents: c.num_documents,
              num_fields: c.fields?.length ?? 0,
              created_at: c.created_at,
            }));
            return mcpTextResult(JSON.stringify(summary, null, 2));
          }

          case "schema": {
            if (!params.collection) return mcpErrorResult("'collection' is required for action=schema.");

            const access = checkCollectionAccess(params.collection, resolved.source);
            if (!access.ok) return access.error;

            return mcpTextResult(
              schemaCache.lookup(params.source, params.collection, params.filter ?? "*")
            );
          }

          case "document": {
            if (!params.collection) return mcpErrorResult("'collection' is required for action=document.");
            if (!params.document_id) return mcpErrorResult("'document_id' is required for action=document.");

            const access = checkCollectionAccess(params.collection, resolved.source);
            if (!access.ok) return access.error;

            const doc = await client
              .collections(params.collection)
              .documents(params.document_id)
              .retrieve();

            if (params.exclude_fields) {
              const excludeSet = new Set(params.exclude_fields.split(",").map((f) => f.trim()));
              const filtered = Object.fromEntries(
                Object.entries(doc as Record<string, unknown>).filter(
                  ([key]) => !excludeSet.has(key)
                )
              );
              return mcpTextResult(JSON.stringify(filtered, null, 2));
            }

            return mcpTextResult(JSON.stringify(doc, null, 2));
          }

          case "count": {
            if (!params.collection) return mcpErrorResult("'collection' is required for action=count.");

            const access = checkCollectionAccess(params.collection, resolved.source);
            if (!access.ok) return access.error;

            const searchParams: Record<string, unknown> = {
              q: "*",
              query_by: "",
              per_page: 0,
            };
            if (params.filter) searchParams.filter_by = params.filter;

            const result = await client
              .collections(params.collection)
              .documents()
              .search(searchParams as never);

            const count = result.found ?? 0;
            return mcpTextResult(JSON.stringify({ collection: params.collection, count }, null, 2));
          }

          case "aliases": {
            const aliasesResult = await client.aliases().retrieve();
            const filtered = {
              ...aliasesResult,
              aliases: (aliasesResult.aliases ?? []).filter(
                (a: { collection_name?: string }) =>
                  a.collection_name && isCollectionAllowed(a.collection_name, resolved.source)
              ),
            };
            return mcpTextResult(JSON.stringify(filtered, null, 2));
          }

          case "synonyms": {
            if (!params.collection) return mcpErrorResult("'collection' is required for action=synonyms.");

            const access = checkCollectionAccess(params.collection, resolved.source);
            if (!access.ok) return access.error;

            const synonyms = await client
              .collections(params.collection)
              .synonyms()
              .retrieve();

            return mcpTextResult(JSON.stringify(synonyms, null, 2));
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`lookup error: ${message}`);
        return mcpErrorResult(message);
      }
    }
  );
}
