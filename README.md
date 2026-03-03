# Typesense MCP Server

A Model Context Protocol server for querying and managing Typesense search indices.

## Tools

### `search` — text, vector, or hybrid search
Single search endpoint supporting full-text, vector (by embedding or document ID), and hybrid (text + vector with alpha blending).

### `lookup` — read metadata
Dispatch by `action`: `collections`, `schema`, `document`, `count`, `aliases`, `synonyms`.

### `manage` — write operations (blocked on readonly sources)
Dispatch by `action`: `upsert_documents`, `delete_documents`, `upsert_alias`, `delete_alias`, `create_collection`, `delete_collection`, `upsert_synonym`, `delete_synonym`.

Only registered when at least one source has `readonly = false`.

### Resource
`collection://{source}/{collection}` — field schema with types and attributes.

## Setup

### 1. Create a config file

Create `typesense-mcp.toml` with your Typesense connection details. See the [Configuration Reference](#configuration-reference) below for all available options.

```toml
[[sources]]
id = "production"
host = "your-cluster.a1.typesense.net"
api_key = "your-api-key"
readonly = true
collections = ["products*", "orders*"]
```

Add multiple `[[sources]]` blocks for different environments (production, staging, local, etc.).

### 2. Add to `.mcp.json`

```json
{
  "mcpServers": {
    "typesense": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "typesense-mcp", "path/to/typesense-mcp.toml"]
    }
  }
}
```

Restart Claude Code and the `mcp__typesense__*` tools will be available.

## Configuration Reference

Each `[[sources]]` block defines a connection to a Typesense cluster. You can configure multiple sources to give the LLM access to different environments or clusters.

### Source fields

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | **yes** | — | Unique identifier for this source. Used in all tool calls to target the right cluster. |
| `host` | string | **yes** | — | Typesense host (e.g. `your-cluster.a1.typesense.net`). Supports [environment variables](#environment-variables). |
| `api_key` | string | **yes** | — | Typesense API key. Supports [environment variables](#environment-variables). |
| `collections` | string[] | **yes** | — | [Collection patterns](#collections) controlling which collections this source can access. |
| `port` | number | no | `443` | Typesense server port. |
| `protocol` | `"https"` \| `"http"` | no | `"https"` | Connection protocol. Use `"http"` for local Typesense instances. |
| `readonly` | boolean | no | `false` | When `true`, blocks all write operations on this source. See [readonly mode](#readonly-mode). |
| `connection_timeout` | number | no | `5` | Connection timeout in seconds. |
| `max_search_results` | number | no | `250` | Maximum `per_page` value for search results. Any search request with a higher `per_page` gets capped to this value. |

### Collections

The `collections` field is the primary access control mechanism. It determines which collections the LLM can see and interact with across the entire server.

**Pattern syntax**: each entry is either an exact collection name or a prefix with a trailing `*` wildcard.

```toml
# Exact match — only this specific collection
collections = ["products"]

# Wildcard — any collection starting with "products"
# Matches: products, products_v2, products_2024-01-15T00:00:00Z
collections = ["products*"]

# Multiple patterns
collections = ["products*", "orders*", "users"]
```

**What `collections` controls:**

| Effect | Description |
|---|---|
| **Schema cache** | At startup, the server fetches schemas from Typesense and caches only collections matching your patterns. This determines which schemas are available instantly vs requiring a live lookup. |
| **Schema resource** | The `collection://{source}/{collection}` MCP resource only exposes collections matching your patterns. This is what the LLM reads to learn field names and types before searching. |
| **Collection discovery** | `lookup action=collections` filters the results — the LLM only sees collections matching your patterns. |
| **Alias discovery** | `lookup action=aliases` filters aliases — only aliases pointing to allowed collections are returned. |
| **Access gating** | Every `search`, `manage`, and collection-specific `lookup` call validates the requested collection against your patterns before executing. Requests for non-matching collections are rejected. |

**The `["*"]` wildcard**: setting `collections = ["*"]` matches every collection on the cluster. This effectively disables collection-level access control. Appropriate for local development, but on shared or production clusters it means the LLM can access (and with `readonly = false`, modify) any collection.

**Recommended approach**: use specific prefixes scoped to your environment. This is especially useful with timestamped collection names:

```toml
# Production — read-only, scoped to production collections
[[sources]]
id = "production"
host = "cluster.typesense.net"
api_key = "${TYPESENSE_PROD_KEY}"
readonly = true
collections = ["products_production*", "orders_production*"]

# Staging — writable, scoped to staging collections
[[sources]]
id = "staging"
host = "cluster.typesense.net"
api_key = "${TYPESENSE_STAGING_KEY}"
collections = ["products_staging*", "orders_staging*"]
```

### Readonly mode

When `readonly = true`, the `manage` tool blocks all write operations on that source, returning an error message. This lets you safely use an admin API key for read operations (schema lookups, searches) without risking accidental mutations.

If **all** sources are readonly, the `manage` tool is not registered at all — the LLM won't even see it as an available tool.

```toml
[[sources]]
id = "production"
host = "cluster.typesense.net"
api_key = "admin-key-here"
readonly = true  # safe to use admin key — writes are blocked
collections = ["products_production*"]
```

Alternatively, you can create a [scoped API key](https://typesense.org/docs/27.1/api/api-keys.html) in Typesense with only search permissions, which provides defense at the Typesense layer as well.

### Environment variables

The `host` and `api_key` fields support environment variable substitution to avoid storing secrets in the config file:

```toml
[[sources]]
id = "production"
host = "${TYPESENSE_HOST}"
api_key = "${TYPESENSE_API_KEY}"
collections = ["products*"]
```

Both `${VAR_NAME}` and `$VAR_NAME` syntax are supported. The server will throw an error at startup if a referenced variable is not set.

### Logging

Set the `LOG_LEVEL` environment variable to control log verbosity. Logs are written to stderr.

| Level | Description |
|---|---|
| `debug` | Verbose output including client creation and cache details |
| `info` | Startup progress and operational events (default) |
| `warn` | Non-fatal issues (e.g. failed to fetch aliases for a source) |
| `error` | Errors during tool execution or shutdown |

### Full example

```toml
# Production — locked down for safe exploration
[[sources]]
id = "production"
host = "${TYPESENSE_HOST}"
api_key = "${TYPESENSE_PROD_KEY}"
port = 443
protocol = "https"
readonly = true
connection_timeout = 10
max_search_results = 100
collections = ["products_production*", "orders_production*"]

# Staging — writable for testing
[[sources]]
id = "staging"
host = "${TYPESENSE_HOST}"
api_key = "${TYPESENSE_STAGING_KEY}"
readonly = false
collections = ["products_staging*", "orders_staging*"]

# Local — wide open for development
[[sources]]
id = "local"
host = "localhost"
port = 8108
protocol = "http"
api_key = "xyz"
collections = ["*"]
```

## Startup behavior

When the server starts, it:

1. **Parses and validates** the TOML config — the server exits immediately if any required fields are missing or invalid.
2. **Expands environment variables** in `host` and `api_key` fields.
3. **Warms the schema cache** — connects to each source, retrieves all collections, filters them against the configured patterns, and caches the field schemas. This means schema lookups are instant once the server is running.
4. **Registers tools** — `search` and `lookup` are always registered. `manage` is only registered if at least one source has `readonly = false`.
5. **Registers the schema resource** — exposes `collection://{source}/{collection}` for all allowed collections.
6. **Connects via stdio** and is ready to handle requests.

If a source is unreachable during warmup, the server logs a warning and continues — other sources will still work. Schema lookups for the unreachable source will return "No cached schema" until the source becomes available.

## Development

```bash
git clone https://github.com/fogx/typesense-mcp.git
cd typesense-mcp
npm install
npm run build
npm test
```

### Releasing

1. Add a changeset: `npx changeset`
2. Version: `npx changeset version`
3. Commit and push
4. Create a GitHub Release — CI will publish to npm