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

Create `typesense-mcp.toml` with your Typesense connection details:

```toml
[[sources]]
id = "production"
host = "your-cluster.a1.typesense.net"
api_key = "your-api-key"
readonly = true                      # blocks manage tool
connection_timeout = 5               # seconds (default: 5)
max_search_results = 250             # caps per_page (default: 250)
collections = ["creators_production*"]  # glob patterns for allowed collections
```

Add multiple `[[sources]]` blocks for different environments.

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
