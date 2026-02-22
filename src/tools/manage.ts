import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { TypesenseClientManager } from "../client.js";
import { logger } from "../logger.js";
import { checkCollectionAccess, mcpErrorResult, mcpTextResult, resolveSource } from "../mcp-helpers.js";
import type { Config } from "../types.js";

export function registerManageTool(
  server: McpServer,
  config: Config,
  clientManager: TypesenseClientManager
) {
  const sourceIds = config.sources.map((s) => s.id);

  server.registerTool(
    "manage",
    {
      title: "Manage",
      description:
        "Write operations for Typesense: create/delete collections, upsert/delete documents, " +
        "manage aliases, and manage synonyms. Blocked on readonly sources.",
      inputSchema: {
        source: z.string().describe(`Typesense source ID. Available: ${sourceIds.join(", ")}`),
        action: z
          .enum([
            "upsert_documents",
            "delete_documents",
            "upsert_alias",
            "delete_alias",
            "create_collection",
            "delete_collection",
            "upsert_synonym",
            "delete_synonym",
          ])
          .describe(
            "Mutation to perform. " +
            "'upsert_documents' — index/update documents (requires collection, documents). " +
            "'delete_documents' — delete by filter (requires collection, filter). " +
            "'upsert_alias' — create/update alias (requires alias_name, collection). " +
            "'delete_alias' — remove alias (requires alias_name). " +
            "'create_collection' — create collection (requires schema). " +
            "'delete_collection' — drop collection (requires collection). " +
            "'upsert_synonym' — create/update synonym rule (requires collection, synonym_id, synonyms). " +
            "'delete_synonym' — remove synonym rule (requires collection, synonym_id)."
          ),
        collection: z
          .string()
          .optional()
          .describe("Collection name. Required for most actions."),
        documents: z
          .array(z.record(z.unknown()))
          .optional()
          .describe("Array of document objects to index. Required for upsert_documents."),
        import_action: z
          .enum(["create", "update", "upsert", "emplace"])
          .optional()
          .describe("Import mode for upsert_documents (default: upsert)."),
        filter: z
          .string()
          .optional()
          .describe("Filter expression for delete_documents."),
        alias_name: z
          .string()
          .optional()
          .describe("Alias name. Required for upsert_alias, delete_alias."),
        schema: z
          .record(z.unknown())
          .optional()
          .describe("Full collection schema object. Required for create_collection."),
        synonym_id: z
          .string()
          .optional()
          .describe("Synonym rule ID. Required for upsert_synonym, delete_synonym."),
        synonyms: z
          .array(z.string())
          .optional()
          .describe("Array of synonym words. Required for upsert_synonym."),
        root: z
          .string()
          .optional()
          .describe("Root word for one-way synonyms (upsert_synonym). Omit for multi-way."),
      },
    },
    async (params) => {
      try {
        const resolved = resolveSource(params.source, config);
        if (!resolved.ok) return resolved.error;

        if (resolved.source.readonly) {
          return mcpErrorResult(
            `Source '${params.source}' is configured as readonly. Write operations are not allowed.`
          );
        }

        const client = clientManager.getClient(params.source);

        switch (params.action) {
          case "upsert_documents": {
            if (!params.collection) return mcpErrorResult("'collection' is required for upsert_documents.");
            if (!params.documents) return mcpErrorResult("'documents' is required for upsert_documents.");

            const access = checkCollectionAccess(params.collection, resolved.source);
            if (!access.ok) return access.error;

            const result = await client
              .collections(params.collection)
              .documents()
              .import(params.documents as never, { action: params.import_action ?? "upsert" });

            return mcpTextResult(JSON.stringify(result, null, 2));
          }

          case "delete_documents": {
            if (!params.collection) return mcpErrorResult("'collection' is required for delete_documents.");
            if (!params.filter) return mcpErrorResult("'filter' is required for delete_documents.");

            const access = checkCollectionAccess(params.collection, resolved.source);
            if (!access.ok) return access.error;

            const result = await client
              .collections(params.collection)
              .documents()
              .delete({ filter_by: params.filter });

            return mcpTextResult(JSON.stringify(result, null, 2));
          }

          case "upsert_alias": {
            if (!params.alias_name) return mcpErrorResult("'alias_name' is required for upsert_alias.");
            if (!params.collection) return mcpErrorResult("'collection' is required for upsert_alias.");

            const access = checkCollectionAccess(params.collection, resolved.source);
            if (!access.ok) return access.error;

            const result = await client
              .aliases()
              .upsert(params.alias_name, { collection_name: params.collection });

            return mcpTextResult(JSON.stringify(result, null, 2));
          }

          case "delete_alias": {
            if (!params.alias_name) return mcpErrorResult("'alias_name' is required for delete_alias.");

            try {
              const alias = await client.aliases(params.alias_name).retrieve();
              if (alias.collection_name) {
                const access = checkCollectionAccess(alias.collection_name, resolved.source);
                if (!access.ok) return access.error;
              }
            } catch {
              // Alias might not exist — let the delete call handle that error
            }

            const result = await client.aliases(params.alias_name).delete();
            return mcpTextResult(JSON.stringify(result, null, 2));
          }

          case "create_collection": {
            if (!params.schema) return mcpErrorResult("'schema' is required for create_collection.");

            const schemaName = (params.schema as { name?: string }).name;
            if (schemaName) {
              const access = checkCollectionAccess(schemaName, resolved.source);
              if (!access.ok) return access.error;
            }

            const result = await client.collections().create(params.schema as never);
            return mcpTextResult(JSON.stringify(result, null, 2));
          }

          case "delete_collection": {
            if (!params.collection) return mcpErrorResult("'collection' is required for delete_collection.");

            const access = checkCollectionAccess(params.collection, resolved.source);
            if (!access.ok) return access.error;

            const result = await client.collections(params.collection).delete();
            return mcpTextResult(JSON.stringify(result, null, 2));
          }

          case "upsert_synonym": {
            if (!params.collection) return mcpErrorResult("'collection' is required for upsert_synonym.");
            if (!params.synonym_id) return mcpErrorResult("'synonym_id' is required for upsert_synonym.");
            if (!params.synonyms) return mcpErrorResult("'synonyms' is required for upsert_synonym.");

            const access = checkCollectionAccess(params.collection, resolved.source);
            if (!access.ok) return access.error;

            const synonymDef: Record<string, unknown> = { synonyms: params.synonyms };
            if (params.root) synonymDef.root = params.root;

            const result = await client
              .collections(params.collection)
              .synonyms()
              .upsert(params.synonym_id, synonymDef as never);

            return mcpTextResult(JSON.stringify(result, null, 2));
          }

          case "delete_synonym": {
            if (!params.collection) return mcpErrorResult("'collection' is required for delete_synonym.");
            if (!params.synonym_id) return mcpErrorResult("'synonym_id' is required for delete_synonym.");

            const access = checkCollectionAccess(params.collection, resolved.source);
            if (!access.ok) return access.error;

            const result = await client
              .collections(params.collection)
              .synonyms(params.synonym_id)
              .delete();

            return mcpTextResult(JSON.stringify(result, null, 2));
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`manage error: ${message}`);
        return mcpErrorResult(message);
      }
    }
  );
}
