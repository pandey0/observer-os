# Running Observer OS + Demo App

## Prerequisites

- Node.js >= 20
- pnpm (`npm install -g pnpm`)
- Docker + Docker Compose

---

## 1. Build the monorepo (once)

```bash
cd /path/to/observe
pnpm install
pnpm build
```

---

## 2. Start Docker infrastructure

The demo app needs PostgreSQL and Redis.

```bash
cd examples/demo-app
docker compose up -d
```

This starts:
| Container | Port | Credentials |
|---|---|---|
| PostgreSQL 16 | `5433` (→ internal 5432) | db: `observer_demo`, user: `demo`, pw: `demo123` |
| Redis 7 | `6379` | no auth |

Wait for both to be healthy (a few seconds). Check with:

```bash
docker compose ps
```

---

## 3. Start the Observer daemon

```bash
cd /path/to/observe
pnpm --filter @observer-os/daemon start
```

Daemon runs on **http://localhost:4000**. Verify:

```bash
curl http://localhost:4000/api/health
# → {"status":"ok"}
```

---

## 4. Start the Explorer UI

```bash
pnpm --filter @observer-os/explorer dev
```

Open **http://localhost:5173** in your browser.

---

## 5. Start the demo app with auto-instrumentation

```bash
cd examples/demo-app
PGPORT=5433 OBSERVER_URL=http://localhost:4000 \
  ./node_modules/.bin/tsx \
  --require ../../packages/auto-instrument/dist/index.js \
  src/index.ts
```

Expected output:
```
[Observer OS] auto-instrumented (http-server, postgres, ioredis, ws) → session ses_xxxxxxxx
[db] schema ready

  Task Manager API
  http://localhost:3000/api
```

Or use the bundled start script (starts everything together):

```bash
cd examples/demo-app
chmod +x scripts/start.sh
./scripts/start.sh
```

---

## 6. Use the demo app

Open **http://localhost:3000** in your browser.

Test users (password: `password123`):
- `alice@acme.com` — admin
- `bob@acme.com` — member
- `carol@acme.com` — member

As you log in, create tasks, move tasks between columns — the graph in Explorer updates in real time.

---

## 7. What you see in Explorer

After a login + task fetch, the graph shows:

| Node | Type | Description |
|---|---|---|
| `http-server:3000` | HttpServer | Express server infrastructure |
| `postgres:pool:localhost:5433/observer_demo` | PostgresPool | Connection pool |
| `redis:client:localhost:6379` | RedisClient | Session store |
| `ws:client:1` | WebSocketClient | Browser WS connection |
| `http-server:request:cor_xxx` | HttpServerRequest | One node per HTTP request |

Edges (`CORRELATED_WITH`) form automatically between the HTTP request node and all postgres/redis operations triggered by that request — no code changes required.

---

## 8. MCP — Ask Claude about your running app

The MCP server exposes Observer OS tools to Claude Code.

### Register (one-time per project)

```bash
cd /path/to/observe
claude mcp add observer-os \
  -e OBSERVER_URL=http://localhost:4000 \
  -s local \
  -- node packages/mcp-server/dist/index.js
```

Verify:
```bash
claude mcp list
# observer-os: node .../mcp-server/dist/index.js — ✔ Connected
```

### Available tools

| Tool | What it does |
|---|---|
| `observer_list_sessions` | List all sessions (ACTIVE + COMPLETED) |
| `observer_get_session` | Session details by ID |
| `observer_search_sessions` | Search by text, domain, status, tag |
| `observer_get_nodes` | All graph nodes for a session |
| `observer_get_events` | Raw event timeline for a session |
| `observer_get_context` | Structured context package (for AI) |
| `observer_query` | Ask a natural-language question about a session |
| `observer_get_performance` | Performance report (slowest queries, p95 latency) |
| `observer_export_session` | Full session export as JSON |
| `observer_debug_request` | Reconstruct full HTTP chain: request body, response body, SQL queries + params, console output, anomalies |

### Example prompts in Claude Code

With the demo app running and MCP connected, open a Claude Code session in the `observe` directory and try:

```
List my active Observer OS sessions
```
```
Show me the graph nodes for session ses_xxxxxxxx
```
```
What postgres queries ran during the last HTTP request?
```
```
Which endpoint is slowest?
```
```
Why did the login request take so long?
```

Claude will call the MCP tools automatically and reason about the live runtime data.

### Re-register after a rebuild

If you rebuild the MCP server (`pnpm --filter @observer-os/mcp-server build`), the registration stays valid — it points to the dist file which gets overwritten in place.

If the daemon URL changes (e.g. different port), update:

```bash
claude mcp remove observer-os
claude mcp add observer-os \
  -e OBSERVER_URL=http://localhost:NEW_PORT \
  -s local \
  -- node packages/mcp-server/dist/index.js
```

---

## Session lifecycle

Each app restart creates a **new session** with a clean graph. The previous session is automatically closed (`COMPLETED`) when the new one starts — the orphan cleanup runs at startup and closes any stale `— pid N` sessions whose process is no longer running.

In Explorer's left sidebar:
- **ACTIVE** — current run
- **COMPLETED** — previous runs (last 10 shown, `+N more` to expand)

Use the **compare** tab (right panel) to diff two sessions: pick a COMPLETED baseline, see which nodes are new, removed, or changed.

---

## Ports reference

| Service | Port | Notes |
|---|---|---|
| Demo app | 3000 | Express API + static UI |
| Observer daemon | 4000 | REST + WebSocket |
| Explorer UI | 5173 | Vite dev server |
| PostgreSQL | 5433 | Docker, remapped from 5432 |
| Redis | 6379 | Docker |
| Chrome CDP | 9222 | Optional, for browser plugin |

---

## Teardown

```bash
# Stop demo app: Ctrl+C in its terminal
# Stop daemon: Ctrl+C in its terminal
# Stop Explorer: Ctrl+C in its terminal

# Stop Docker (keeps data):
cd examples/demo-app && docker compose stop

# Stop Docker + delete data:
cd examples/demo-app && docker compose down -v
```
