# MCP Setup — AI Agent Integration

Observer OS exposes a Model Context Protocol (MCP) server that gives AI agents (Claude Desktop, Cursor, VS Code Copilot) direct access to your runtime graph. No copy-paste. No explaining context. The agent calls Observer tools directly.

---

## What MCP gives you

Instead of:
> "My checkout API returned 500. Here's the error: [paste stack trace]. The request was to POST /api/checkout. The database might be involved..."

The agent calls:
```
observer_list_sessions → finds active session
observer_get_nodes → finds FAILED nodes
observer_get_context { nodeId: "http-server:request:42" } → gets full causal chain
```

And answers: "The checkout fails because `INSERT INTO orders` violates a `unique_constraint` on `(user_id, product_id)`. The constraint was added in migration `0031` but the dedup logic in `checkoutService.ts:87` was not updated."

---

## Building the MCP server

```bash
pnpm --filter @observer-os/mcp-server build
```

Output: `packages/mcp-server/dist/index.js`

---

## Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json` (Linux/Mac: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "observer-os": {
      "command": "node",
      "args": ["/absolute/path/to/observe/packages/mcp-server/dist/index.js"],
      "env": {
        "OBSERVER_URL": "http://localhost:4000",
        "OBSERVER_API_KEY": ""
      }
    }
  }
}
```

Restart Claude Desktop. You'll see the Observer tools available in the tools panel.

---

## Cursor

Add to `.cursor/mcp.json` in your project root (or `~/.cursor/mcp.json` for global):

```json
{
  "mcpServers": {
    "observer-os": {
      "command": "node",
      "args": ["/absolute/path/to/observe/packages/mcp-server/dist/index.js"],
      "env": {
        "OBSERVER_URL": "http://localhost:4000"
      }
    }
  }
}
```

---

## VS Code (Observer extension)

The Observer OS VS Code extension provides status bar integration, error notifications, and session management — it talks to the daemon directly over HTTP, not MCP.

Install the extension:

```bash
cd apps/vscode-extension
pnpm build
# Then install the .vsix from dist/
```

Or run in development:

```bash
# In VS Code, open apps/vscode-extension, press F5 to launch Extension Development Host
```

Configure via VS Code settings:

```json
{
  "observerOS.daemonUrl": "http://localhost:4000",
  "observerOS.apiKey": "",
  "observerOS.autoConnect": true,
  "observerOS.pollIntervalMs": 3000
}
```

Commands available (`Cmd+Shift+P`):
- `Observer OS: Copy Context` — copy AI-ready context for selected node
- `Observer OS: List Sessions` — browse and switch sessions
- `Observer OS: Start Session` — create a new named session
- `Observer OS: Show Status` — show daemon connection status

---

## Available MCP tools

| Tool | Description |
|------|-------------|
| `observer_list_sessions` | List all sessions with status and event counts |
| `observer_get_session` | Get full details for a specific session |
| `observer_search_sessions` | Search sessions by name, tag, status, date range |
| `observer_get_nodes` | Get the runtime graph nodes for a session |
| `observer_get_events` | Get raw events with filtering |
| `observer_get_context` | Get AI-ready context package around a node (causal chain, metadata, related nodes) |
| `observer_query` | Natural language query (requires `ANTHROPIC_API_KEY` in daemon env) |
| `observer_get_performance` | Get performance analysis (slow queries, p95 latency) |
| `observer_export_session` | Export session as JSON or Markdown |
| `observer_debug_request` | Reconstruct full request chain — request body, response body, all SQL queries + params, console output, anomaly detection. Primary debugging tool. |

### CDP tools (browser control)

Requires Chrome running with `--remote-debugging-port=9222`.

| Tool | Description |
|------|-------------|
| `cdp_status` | Check Chrome DevTools Protocol connection status |
| `cdp_list_pages` | List all open pages/tabs |
| `cdp_navigate` | Navigate current page to a URL |
| `cdp_new_page` | Open a new tab |
| `cdp_select_page` | Switch focus to a specific tab |
| `cdp_take_screenshot` | Capture screenshot of current page |
| `cdp_take_snapshot` | Capture full DOM snapshot |
| `cdp_evaluate` | Evaluate JavaScript in the page context |
| `cdp_click` | Click an element by selector |
| `cdp_fill` | Fill an input field |
| `cdp_press_key` | Simulate a key press |
| `cdp_get_console` | Retrieve console log messages |
| `cdp_get_network` | Retrieve network request log |
| `cdp_heap_snapshot` | Take a JS heap snapshot for memory analysis |
| `cdp_performance_start` | Start performance recording |
| `cdp_performance_stop` | Stop performance recording and return metrics |
| `cdp_emulate` | Emulate a device or network condition |

### Example: debugging a failed API

In Claude Desktop with Observer connected:

```
You: why is POST /api/checkout returning 500?

Claude: [calls observer_list_sessions → finds "Default Session"]
        [calls observer_get_nodes → finds FAILED node http-server:request:7]
        [calls observer_get_context { nodeId: "http-server:request:7", depth: "DETAILED" }]

        The checkout endpoint fails because of a PostgreSQL constraint violation:
        
        Chain:
          browser: fetch POST /api/checkout [23ms, FAILED]
            → http-server: POST /api/checkout [21ms, FAILED status 500]
              → postgres: INSERT INTO orders [2ms, FAILED]
                  error: duplicate key value violates unique constraint "orders_user_product_key"
        
        The user (id: 42) has already placed an order for product 99. 
        The deduplication check in your route handler appears to be missing.
```

---

## MCP environment variables

| Variable | Description |
|----------|-------------|
| `OBSERVER_URL` | Daemon URL (default: `http://localhost:4000`) |
| `OBSERVER_API_KEY` | API key if daemon requires auth |

---

## Running daemon with AI query support

For natural language queries (`observer_query`), set `ANTHROPIC_API_KEY` in the daemon environment:

```bash
ANTHROPIC_API_KEY=sk-ant-... pnpm --filter @observer-os/daemon start
```

Without this, the query tool returns a hint to configure the key.

---

## Plugin registry

Observer ships with a searchable plugin registry:

```bash
# List all plugins
observer registry list

# Search by category
observer registry search --category database

# Get plugin details
observer registry get plugin-postgres
```

Or via the MCP server — agents can discover which Observer plugins are available for a given runtime.
