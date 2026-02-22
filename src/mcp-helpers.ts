import type { Config, SourceConfig } from "./types.js";

type ResolveSourceResult =
  | { ok: true; source: SourceConfig }
  | { ok: false; error: ReturnType<typeof mcpErrorResult> };

type CollectionAccessResult =
  | { ok: true }
  | { ok: false; error: ReturnType<typeof mcpErrorResult> };

export function mcpTextResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export function mcpErrorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

export function collectionMatchesPattern(collection: string, pattern: string): boolean {
  if (pattern.endsWith("*")) {
    return collection.startsWith(pattern.slice(0, -1));
  }
  return collection === pattern;
}

export function isCollectionAllowed(collection: string, source: SourceConfig): boolean {
  return source.collections.some((pattern) => collectionMatchesPattern(collection, pattern));
}

export function checkCollectionAccess(
  collection: string,
  source: SourceConfig
): CollectionAccessResult {
  if (isCollectionAllowed(collection, source)) {
    return { ok: true };
  }
  return {
    ok: false,
    error: mcpErrorResult(
      `Collection '${collection}' is not allowed on source '${source.id}'. ` +
        `Allowed patterns: ${source.collections.join(", ")}`
    ),
  };
}

export function resolveSource(sourceId: string, config: Config): ResolveSourceResult {
  const source = config.sources.find((s) => s.id === sourceId);
  if (!source) {
    const available = config.sources.map((s) => s.id).join(", ");
    return {
      ok: false,
      error: mcpErrorResult(`Unknown source '${sourceId}'. Available: ${available}`),
    };
  }
  return { ok: true, source };
}
