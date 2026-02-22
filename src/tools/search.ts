import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { TypesenseClientManager } from "../client.js";
import { logger } from "../logger.js";
import type { SchemaCache } from "../schema-cache.js";
import { checkCollectionAccess, mcpErrorResult, mcpTextResult, resolveSource } from "../mcp-helpers.js";
import type { Config } from "../types.js";

export function registerSearchTool(
  server: McpServer,
  config: Config,
  clientManager: TypesenseClientManager,
  schemaCache: SchemaCache
) {
  const sourceIds = config.sources.map((s) => s.id);

  server.registerTool(
    "search",
    {
      title: "Search",
      description:
        "Search a Typesense collection. Supports full-text search, vector search, or hybrid (both). " +
        "Always exclude embedding fields via exclude_fields to avoid huge responses.",
      inputSchema: {
        source: z.string().describe(`Typesense source ID. Available: ${sourceIds.join(", ")}`),
        collection: z.string().describe("Collection name or alias to search"),
        q: z.string().describe('Search query string. Use "*" to match all documents.'),
        query_by: z
          .string()
          .describe("Comma-separated list of fields to search against (e.g. 'displayName,bio')"),
        vector_query: z
          .string()
          .optional()
          .describe(
            "Vector search query. Format: 'field:([], k: 10, alpha: 0.5, distance_threshold: 0.75)'. " +
            "Combine with q and query_by for hybrid search (alpha controls text vs vector weight)."
          ),
        split_join_tokens: z
          .string()
          .optional()
          .describe(
            "Token splitting strategy. Use 'fallback' to auto-split compound words " +
            "(e.g. 'indiehackers' → 'indie hackers'). Options: 'fallback', 'always', 'off'."
          ),
        filter_by: z
          .string()
          .optional()
          .describe(
            "Filter expression (e.g. 'isExternal:false && channels.YOUTUBE.exists:true')"
          ),
        sort_by: z
          .string()
          .optional()
          .describe("Sort expression (e.g. 'discoveryReach:desc')"),
        per_page: z
          .number()
          .int()
          .optional()
          .describe("Results per page (default 10, max from source config)"),
        page: z.number().int().optional().describe("Page number (default 1)"),
        include_fields: z
          .string()
          .optional()
          .describe("Comma-separated fields to include in results"),
        exclude_fields: z
          .string()
          .optional()
          .describe(
            "Comma-separated fields to exclude (always exclude embedding fields like 'embedding,retrievalEmbedding,classificationEmbedding')"
          ),
        facet_by: z
          .string()
          .optional()
          .describe("Comma-separated fields to facet on"),
        prefix: z
          .string()
          .optional()
          .describe("Comma-separated booleans for prefix search per query_by field"),
        group_by: z
          .string()
          .optional()
          .describe("Field to group results by"),
        group_limit: z.number().int().optional().describe("Max results per group (default 3)"),
        query_by_weights: z
          .string()
          .optional()
          .describe("Comma-separated weights for query_by fields"),
        drop_tokens_threshold: z
          .number()
          .int()
          .optional()
          .describe("Number of results below which tokens are dropped"),
        text_match_type: z
          .string()
          .optional()
          .describe("'max_score' or 'max_weight'"),
        highlight_fields: z.string().optional().describe("Fields to highlight in results"),
      },
    },
    async (params) => {
      try {
        const resolved = resolveSource(params.source, config);
        if (!resolved.ok) return resolved.error;

        const access = checkCollectionAccess(params.collection, resolved.source);
        if (!access.ok) return access.error;

        const client = clientManager.getClient(params.source);
        const source = resolved.source;

        const searchParams: Record<string, unknown> = {
          q: params.q,
          query_by: params.query_by,
        };

        if (params.vector_query) searchParams.vector_query = params.vector_query;
        if (params.split_join_tokens) searchParams.split_join_tokens = params.split_join_tokens;
        if (params.filter_by) searchParams.filter_by = params.filter_by;
        if (params.sort_by) searchParams.sort_by = params.sort_by;
        if (params.per_page !== undefined) {
          searchParams.per_page = Math.min(params.per_page, source.maxSearchResults);
        }
        if (params.page !== undefined) searchParams.page = params.page;
        if (params.include_fields) searchParams.include_fields = params.include_fields;
        if (params.exclude_fields) searchParams.exclude_fields = params.exclude_fields;
        if (params.facet_by) searchParams.facet_by = params.facet_by;
        if (params.prefix) searchParams.prefix = params.prefix;
        if (params.group_by) searchParams.group_by = params.group_by;
        if (params.group_limit !== undefined) searchParams.group_limit = params.group_limit;
        if (params.query_by_weights) searchParams.query_by_weights = params.query_by_weights;
        if (params.drop_tokens_threshold !== undefined)
          searchParams.drop_tokens_threshold = params.drop_tokens_threshold;
        if (params.text_match_type) searchParams.text_match_type = params.text_match_type;
        if (params.highlight_fields) searchParams.highlight_fields = params.highlight_fields;

        const result = await client
          .collections(params.collection)
          .documents()
          .search(searchParams as never);

        return mcpTextResult(JSON.stringify(result, null, 2));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`search error: ${message}`);

        if (message.includes("Could not find a field named")) {
          const fieldNames = schemaCache.getFieldNames(params.source, params.collection);
          if (fieldNames.length > 0) {
            return mcpErrorResult(
              `${message}\n\nUse lookup with action=schema to look up valid field names for '${params.collection}'.`
            );
          }
        }

        return mcpErrorResult(message);
      }
    }
  );
}
