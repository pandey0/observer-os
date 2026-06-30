# Observer OS

**Runtime Intelligence Platform** — see everything your Node.js app does, in real time, with zero code changes.

> Auto-instrument any Node.js application via a single `--require` flag. Captures HTTP requests, SQL queries, Redis commands, WebSocket messages, and console output. Exposes the full runtime graph to humans (Explorer UI) and AI agents (MCP server).

---

## Why Observer OS?

When a request fails in production or staging, the usual workflow is:
1. Grep logs
2. Add `console.log`, redeploy
3. Reproduce the issue
4. Copy-paste stack traces into a chat window

Observer OS replaces that with a live runtime graph. Every request, every query, every error — captured automatically, correlated, and available to Claude or any MCP-compatible AI agent in one tool call.

---

## Features

- **Zero code changes** — `--require` hook patches Node.js prototypes before your app starts
- **Auto-detection** — probes `node_modules`, patches whatever it finds (pg, mysql2, ioredis, ws)
- **Full request chain** — request body → SQL queries + params → Redis commands → console output → response body, all correlated by request
- **Local-first** — all data stored at `~/.observer/` as flat files (no external database, no cloud)
- **AI-native** — MCP server gives Claude Code direct access to runtime data; no copy-paste
- **Browser control** — 17 CDP tools for browser automation alongside runtime observation
- **Session history** — compare current run vs previous runs; diff which nodes changed

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Your Node.js App                                   │
│  NODE_OPTIONS="--require auto-instrument/dist"      │
│       │                                             │
│  patches: http.Server, pg.Pool, mysql2.Pool,        │
│           ioredis, node-redis, ws, console          │
└────────────┬────────────────────────────────────────┘
             │  POST /api/sessions/:id/events
             ▼
┌─────────────────────────────────────────────────────┐
│  Observer Daemon  :4000                             │
│  ├── Session Engine  (lifecycle, flat-file storage) │
│  ├── Event Log       (~/.observer/sessions/NDJSON)  │
│  ├── REST API        (query sessions, events, nodes)│
│  └── WebSocket       (live push to Explorer)        │
└─────┬──────────────────────┬────────────────────────┘
      │                      │
      ▼                      ▼
┌───────────────┐   ┌────────────────────────────────┐
│  Explorer     │   │  MCP Server (stdio)             │
│  :5173        │   │  10 observer tools              │
│  Runtime      │   │  17 CDP browser tools           │
│  graph UI     │   │  ─────────────────              │
│  for humans   │   │  Claude Code / Cursor / Desktop │
└───────────────┘   └────────────────────────────────┘
```

---

## Quick Start

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9
- Docker + Docker Compose (for demo app)

### 1. Clone and build

```bash
git clone <repo-url>
cd observe
pnpm install && pnpm build
```

### 2. Start the daemon

```bash
pnpm --filter @observer-os/daemon start
# Observer OS ready → http://localhost:4000
```

### 3. Run your app with auto-instrumentation

```bash
NODE_OPTIONS="--require $(pwd)/packages/auto-instrument/dist/index.js" \
OBSERVER_URL=http://localhost:4000 \
node src/index.js
```

Output:
```
[Observer OS] auto-instrumented (http-server, postgres, ioredis, ws) → session ses_abc123
```

### 4. Open Explorer

```bash
pnpm --filter @observer-os/explorer dev
# → http://localhost:5173
```

### 5. Connect Claude Code

```bash
claude mcp add observer-os \
  -e OBSERVER_URL=http://localhost:4000 \
  -s local \
  -- node packages/mcp-server/dist/index.js
```

---

## What Gets Instrumented Automatically

No code changes. No imports. Just the `--require` flag.

| Library / API | Auto-detected | Events |
|---|---|---|
| Any HTTP server (Express, Fastify, Koa, raw `http`) | Always | `observer.http-server/request.*` |
| Outgoing HTTP/HTTPS | Always | `observer.http-client/request.*` |
| PostgreSQL (`pg`) | If installed | `observer.postgres/query.*` |
| MySQL (`mysql2`) | If installed | `observer.mysql/query.*` |
| Redis (`ioredis`, `redis`) | If installed | `observer.redis/command.*` |
| WebSocket server (`ws`) | If installed | `observer.ws/client.*` |
| `console.log/warn/error/debug/info` | Always | `observer.console/*` |

Detection takes ~5ms at startup. If a library isn't installed, its patch is a no-op.

---

## MCP Tools (for AI agents)

### Observer tools (10)

| Tool | What it does |
|---|---|
| `observer_debug_request` | **Main debugging tool.** Full HTTP chain: request body, response body, SQL queries + params, console output, anomaly detection |
| `observer_list_sessions` | List all sessions with status and event counts |
| `observer_get_session` | Get session details by ID |
| `observer_search_sessions` | Search by name, tag, status, or text |
| `observer_get_nodes` | Runtime graph nodes for a session |
| `observer_get_events` | Raw event timeline (paginated, filterable) |
| `observer_get_context` | AI-ready context package around a node — causal chain, related nodes |
| `observer_query` | Natural-language question about a session (requires `ANTHROPIC_API_KEY`) |
| `observer_get_performance` | p50/p95/p99 latency, slowest operations |
| `observer_export_session` | Export session as markdown or JSON |

### CDP browser tools (17)

Requires Chrome with `--remote-debugging-port=9222`.

`cdp_status` · `cdp_list_pages` · `cdp_navigate` · `cdp_new_page` · `cdp_select_page` · `cdp_take_screenshot` · `cdp_take_snapshot` · `cdp_evaluate` · `cdp_click` · `cdp_fill` · `cdp_press_key` · `cdp_get_console` · `cdp_get_network` · `cdp_heap_snapshot` · `cdp_performance_start` · `cdp_performance_stop` · `cdp_emulate`

---

## Demo App

A full-featured task manager (Jira/Linear-lite) built with Express, PostgreSQL, Redis, and WebSocket — instrumented by Observer OS automatically.

```bash
cd examples/demo-app
docker compose up -d          # start Postgres + Redis
./scripts/start.sh            # start daemon + app + Explorer
```

Open `http://localhost:3000`. Test accounts (password: `password123`):

| Email | Role |
|---|---|
| alice@acme.com | Admin |
| bob@acme.com | Member |
| carol@acme.com | Member |

See [examples/demo-app/README.md](./examples/demo-app/README.md) for full walkthrough.

---

## Monorepo Structure

```
observe/
├── packages/
│   ├── auto-instrument/     @observer-os/auto-instrument  — --require hook, zero-config patchers
│   ├── core/                @observer-os/core             — EventLog, ProjectionEngine, SessionEngine
│   ├── sdk/                 @observer-os/sdk              — Plugin SDK, PluginRegistry
│   ├── mcp-server/          @observer-os/mcp-server       — MCP tools for Claude/Cursor
│   ├── cli/                 @observer-os/cli              — observer CLI (observer run, sessions, query)
│   ├── context-engine/      @observer-os/context-engine   — AI context packages
│   ├── ai-query/            @observer-os/ai-query         — Anthropic streaming query
│   ├── registry/            @observer-os/registry         — Plugin registry
│   ├── plugin-browser/      @observer-os/plugin-browser   — Browser IIFE instrumentation
│   ├── plugin-express/      @observer-os/plugin-express   — Express middleware
│   ├── plugin-postgres/     @observer-os/plugin-postgres  — pg Pool patching (SDK-based)
│   ├── plugin-redis/        @observer-os/plugin-redis     — ioredis patching (SDK-based)
│   ├── plugin-prisma/       @observer-os/plugin-prisma    — Prisma $extends integration
│   ├── plugin-graphql/      @observer-os/plugin-graphql   — GraphQL execute() wrapping
│   ├── plugin-http/         @observer-os/plugin-http      — Outgoing http/https patching
│   ├── plugin-react/        @observer-os/plugin-react     — React error boundaries
│   └── plugin-nextjs/       @observer-os/plugin-nextjs    — Next.js App Router integration
│
└── apps/
    ├── daemon/              @observer-os/daemon           — Fastify daemon, REST + WebSocket
    ├── explorer/            @observer-os/explorer         — React runtime graph UI
    └── vscode-extension/    observer-os-vscode            — VS Code status bar + commands
```

---

## Documentation

| Document | Description |
|---|---|
| [OVERVIEW.md](./OVERVIEW.md) | **Start here** — full guide with reading order and how everything connects |
| [FAQ.md](./FAQ.md) | Common questions: stack support, MySQL setup, MCP-only workflow, Next.js |
| [RUNNING.md](./RUNNING.md) | Step-by-step: Docker, daemon, Explorer, demo app, MCP registration |
| [docs/getting-started.md](./docs/getting-started.md) | Quickstart, env vars, CLI reference, event type naming |
| [docs/zero-config.md](./docs/zero-config.md) | How `--require` injection works, what gets auto-detected |
| [docs/plugins.md](./docs/plugins.md) | All plugins — auto-instrumented vs manual SDK, usage examples |
| [docs/mcp-setup.md](./docs/mcp-setup.md) | MCP config for Claude Desktop, Cursor, VS Code — full tool list |
| [AI_AGENT_EXAMPLES.md](./AI_AGENT_EXAMPLES.md) | Real-world AI agent scenarios — schema mismatch, N+1, auth bugs |
| [docs/architecture/](./docs/architecture/) | Deployment, runtime graph, plugin system internals |
| [docs/rfcs/](./docs/rfcs/) | Design RFCs (0000–0012) — full specs for every subsystem |

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `OBSERVER_URL` | `http://localhost:4000` | Daemon URL — used by auto-instrument and SDK |
| `OBSERVER_PORT` | `4000` | Daemon listen port |
| `OBSERVER_HOST` | `127.0.0.1` | Daemon bind address |
| `OBSERVER_API_KEY` | unset | When set, all API calls require `Authorization: Bearer <key>` |
| `OBSERVER_LOG_LEVEL` | `info` | `debug \| info \| warn \| error` |
| `ANTHROPIC_API_KEY` | unset | Required for `observer_query` natural-language tool |

---

## Ports Reference

| Service | Port |
|---|---|
| Observer Daemon | 4000 |
| Explorer UI | 5173 |
| Demo App | 3000 |
| PostgreSQL (Docker) | 5433 |
| Redis (Docker) | 6379 |
| Chrome CDP (optional) | 9222 |

---

## Requirements

- **Node.js** ≥ 20
- **pnpm** ≥ 9
- **Docker** (demo app only)

---

## License

MIT
