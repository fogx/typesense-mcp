export interface SourceConfig {
  id: string;
  host: string;
  port: number;
  protocol: string;
  apiKey: string;
  readonly: boolean;
  connectionTimeout: number;
  maxSearchResults: number;
  collections: string[];
}

export interface Config {
  sources: SourceConfig[];
}
