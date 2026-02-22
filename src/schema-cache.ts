import type { TypesenseClientManager } from "./client.js";
import { collectionMatchesPattern } from "./mcp-helpers.js";
import type { Config } from "./types.js";
import { logger } from "./logger.js";

export interface CachedField {
  name: string;
  type: string;
  index?: boolean;
  facet?: boolean;
  sort?: boolean;
  optional?: boolean;
  num_dim?: number;
  embed?: unknown;
  range_index?: boolean;
}

interface CachedSchema {
  collectionName: string;
  sourceId: string;
  fields: CachedField[];
}

function minimizeField(field: Record<string, unknown>): CachedField {
  const min: CachedField = { name: field.name as string, type: field.type as string };
  if (field.index === false) min.index = false;
  if (field.facet === true) min.facet = true;
  if (field.sort === true) min.sort = true;
  if (field.optional === true) min.optional = true;
  if (typeof field.num_dim === "number") min.num_dim = field.num_dim;
  if (field.embed) min.embed = true;
  if (field.range_index === true) min.range_index = true;
  return min;
}

function formatField(field: CachedField): string {
  const attrs: string[] = [];
  if (field.index === false) attrs.push("no-index");
  if (field.facet) attrs.push("facet");
  if (field.sort) attrs.push("sort");
  if (field.optional) attrs.push("optional");
  if (field.type === "float[]" && field.num_dim) attrs.push(`${field.num_dim}-dim`);
  if (field.embed) attrs.push("auto-embed");
  if (field.range_index) attrs.push("range-index");
  const attrStr = attrs.length > 0 ? ` (${attrs.join(", ")})` : "";
  return `${field.name}: ${field.type}${attrStr}`;
}

export class SchemaCache {
  private schemas = new Map<string, CachedSchema>();
  private aliases = new Map<string, string>();

  async warmup(config: Config, clientManager: TypesenseClientManager) {
    for (const source of config.sources) {
      try {
        const client = clientManager.getClient(source.id);
        const collections = await client.collections().retrieve();

        for (const col of collections) {
          const isAllowed = source.collections.some((pattern) =>
            collectionMatchesPattern(col.name, pattern)
          );
          if (!isAllowed) continue;

          const fields = (col.fields ?? []).map((f) =>
            minimizeField(f as Record<string, unknown>)
          );

          this.schemas.set(this.key(source.id, col.name), {
            collectionName: col.name,
            sourceId: source.id,
            fields,
          });
        }

        try {
          const aliasesResult = await client.aliases().retrieve();
          for (const alias of aliasesResult.aliases ?? []) {
            this.aliases.set(
              this.key(source.id, alias.name),
              alias.collection_name
            );
          }
        } catch {
          logger.warn(`Failed to fetch aliases for source "${source.id}"`);
        }

        logger.debug(
          `Cached schemas for source "${source.id}": ${collections.filter((c) => source.collections.some((p) => collectionMatchesPattern(c.name, p))).length} collections`
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(`Failed to cache schemas for source "${source.id}": ${message}`);
      }
    }
  }

  lookup(sourceId: string, collection: string, filter: string): string {
    const schema = this.resolve(sourceId, collection);
    if (!schema) {
      return `No cached schema for collection '${collection}' on source '${sourceId}'.`;
    }

    if (filter === "*") {
      return this.formatFields(schema, schema.fields);
    }

    const matched = schema.fields.filter(
      (f) => f.name === filter || f.name.startsWith(filter + ".")
    );

    if (matched.length === 0) {
      return `No fields matching '${filter}' in '${collection}' (${schema.fields.length} total fields).`;
    }

    return this.formatFields(schema, matched);
  }

  getFieldNames(sourceId: string, collection: string): string[] {
    const schema = this.resolve(sourceId, collection);
    if (!schema) return [];
    return schema.fields.map((f) => f.name);
  }

  private resolve(sourceId: string, collection: string): CachedSchema | undefined {
    const direct = this.schemas.get(this.key(sourceId, collection));
    if (direct) return direct;

    const aliasTarget = this.aliases.get(this.key(sourceId, collection));
    if (aliasTarget) {
      return this.schemas.get(this.key(sourceId, aliasTarget));
    }

    return undefined;
  }

  private formatFields(schema: CachedSchema, fields: CachedField[]): string {
    const lines: string[] = [];
    lines.push(`Collection: ${schema.collectionName} (source: ${schema.sourceId})`);
    lines.push(`Showing ${fields.length} of ${schema.fields.length} fields:`);
    for (const field of fields) {
      lines.push(`  ${formatField(field)}`);
    }
    return lines.join("\n");
  }

  private key(sourceId: string, collection: string) {
    return `${sourceId}::${collection}`;
  }
}
