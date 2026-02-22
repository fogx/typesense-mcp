import Typesense from "typesense";

import { logger } from "./logger.js";
import type { SourceConfig } from "./types.js";

export class TypesenseClientManager {
  private clients = new Map<string, Typesense.Client>();
  private sources: SourceConfig[];

  constructor(sources: SourceConfig[]) {
    this.sources = sources;
  }

  getClient(sourceId: string): Typesense.Client {
    const existing = this.clients.get(sourceId);
    if (existing) return existing;

    const source = this.sources.find((s) => s.id === sourceId);
    if (!source) {
      throw new Error(`Unknown source: ${sourceId}`);
    }

    logger.debug(`Creating Typesense client for source "${sourceId}"`);

    const client = new Typesense.Client({
      nodes: [
        {
          host: source.host,
          port: source.port,
          protocol: source.protocol,
        },
      ],
      apiKey: source.apiKey,
      connectionTimeoutSeconds: source.connectionTimeout,
    });

    this.clients.set(sourceId, client);
    return client;
  }
}
