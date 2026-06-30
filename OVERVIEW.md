# Observer OS — Complete Guide

Start here. This doc explains what Observer OS is, how the pieces fit together, and where to read more for each topic.

---

## What is Observer OS?

Observer OS is a **local-first runtime intelligence platform**. Run it alongside your Node.js app and it records everything — HTTP requests, SQL queries, Redis commands, WebSocket messages, console output — with **zero code changes**.

That data flows into a daemon that stores it locally and exposes it to:
- **Explorer** — a browser UI for humans to inspect the runtime graph
- **MCP server** — gives AI agents (Claude Code, Cursor) direct read access to your runtime data
- **REST API** — open endpoint any tool can query

```
Your App (auto-instrument via --require)
        │  POST events
        ▼
   Daemon :4000  ───── REST/WS ─────▶  Explorer :5173
        │                         └──── MCP stdio ─────▶  Claude Code
        └── ~/.observer/sessions/  (flat files, no DB)
```

---

## Reading Order

### 1. Understand the concepts first

| Doc | What you learn |
|-----|---------------|
| [FAQ.md](./FAQ.md) | All common questions answered: what each piece does, MySQL support, daemon storage, MCP-only workflow, Next.js setup |
| [docs/glossary.md](./docs/glossary.md) | Precise definitions: Session, Node, Event, Edge, Correlation |
| [docs/rfcs/0000-philosophy.md](./docs/rfcs/0000-philosophy.md) | Why Observer exists, core design principles |

### 2. Set up and run

| Doc | What you learn |
|-----|---------------|
| [RUNNING.md](./RUNNING.md) | Full setup: Docker, daemon, Explorer, demo app, MCP registration |
| [docs/getting-started.md](./docs/getting-started.md) | Quickstart, env vars, package map, event type naming |
| [docs/zero-config.md](./docs/zero-config.md) | How `--require` injection works, what gets auto-detected |

### 3. Wire up your stack

| Doc | What you learn |
|-----|---------------|
| [docs/plugins.md](./docs/plugins.md) | Auto-instrumented libraries vs manual SDK plugins, usage examples for each plugin |
| [docs/mcp-setup.md](./docs/mcp-setup.md) | MCP config for Claude Desktop, Cursor, VS Code — full tool list |
| [packages/mcp-server/USAGE.md](./packages/mcp-server/USAGE.md) | Quick MCP config reference |

### 4. See real use cases

| Doc | What you learn |
|-----|---------------|
| [AI_AGENT_EXAMPLES.md](./AI_AGENT_EXAMPLES.md) | Real-world scenarios: schema mismatch, N+1 queries, auth bugs, cache debugging |
| [examples/demo-app/README.md](./examples/demo-app/README.md) | Demo app walkthrough — what Observer captures for each user action |

### 5. Go deeper

| Doc | What you learn |
|-----|---------------|
| [docs/architecture/runtime.md](./docs/architecture/runtime.md) | Runtime graph internals: how nodes and edges materialize |
| [docs/architecture/plugin-system.md](./docs/architecture/plugin-system.md) | How plugins hook into the SDK |
| [docs/roadmap.md](./docs/roadmap.md) | What's planned |
| [docs/rfcs/](./docs/rfcs/) | Full design RFCs (0001–0012) — detailed specs for every subsystem |

---

## The Three Surfaces

Understanding these three is key to understanding Observer:

### auto-instrument (data in)
- Loaded via `NODE_OPTIONS="--require /path/to/auto-instrument/dist/index.js"`
- Patches Node.js prototypes **before your code runs**
- Captures: HTTP (all frameworks), PostgreSQL, MySQL, Redis, WebSocket, console
- Zero code changes, zero imports

### Explorer (humans out)
- Browser UI at `http://localhost:5173`
- Shows runtime graph: nodes = infrastructure + requests, edges = causal relationships
- Session sidebar: compare current run vs previous runs

### MCP server (AI agents out)
- Exposes 10 Observer tools + 17 CDP browser control tools to any MCP-compatible AI agent
- Key tool: `observer_debug_request` — reconstructs full HTTP chain with request body, response body, SQL queries + params, console output, anomalies detected
- Config: add to `.claude/mcp.json` or Claude Desktop config

---

## How a Request Flows Through Observer

```
1. Browser sends POST /api/tasks

2. auto-instrument intercepts in http.Server.emit:
   → emits observer.http-server/request.started
   → taps request body (JSON captured)
   → runs your Express handler inside AsyncLocalStorage context

3. Your handler calls pool.query(...)
   → auto-instrument intercepts in Pool.prototype.query
   → emits observer.postgres/query.started  (with SQL + params)
   → query runs
   → emits observer.postgres/query.completed (with duration)

4. Response sent
   → emits observer.http-server/request.body  (captured body)
   → emits observer.http-server/request.completed (status + response body)

5. EventQueue flushes via setImmediate
   → each event POSTed to daemon at localhost:4000

6. Daemon appends to ~/.observer/sessions/<id>/events.ndjson

7. Claude calls observer_debug_request
   → waits 1.5s for in-flight events to settle
   → returns full markdown report with the whole chain
```

---

## Quick Start (copy-paste)

```bash
# 1. Build
cd /path/to/observe && pnpm install && pnpm build

# 2. Start Docker (demo app needs Postgres + Redis)
cd examples/demo-app && docker compose up -d && cd ../..

# 3. Start daemon
pnpm --filter @observer-os/daemon start
# → http://localhost:4000

# 4. Start Explorer
pnpm --filter @observer-os/explorer dev
# → http://localhost:5173

# 5. Start demo app with auto-instrument
cd examples/demo-app
PGPORT=5433 OBSERVER_URL=http://localhost:4000 \
  ./node_modules/.bin/tsx \
  --require ../../packages/auto-instrument/dist/index.js \
  src/index.ts
# → [Observer OS] auto-instrumented (http-server, postgres, ioredis, ws) → session ses_xxx

# 6. Wire MCP to Claude Code
claude mcp add observer-os \
  -e OBSERVER_URL=http://localhost:4000 \
  -s local \
  -- node packages/mcp-server/dist/index.js
```

---

## Ports Reference

| Service | Port |
|---------|------|
| Daemon API | 4000 |
| Explorer UI | 5173 |
| Demo app | 3000 |
| PostgreSQL (Docker) | 5433 |
| Redis (Docker) | 6379 |
| Chrome CDP (optional) | 9222 |

---

## Key Design Decisions

**Why flat files, not SQLite?**
Append-only NDJSON is crash-safe — a process kill mid-write corrupts at most one line. No migrations, no external dependencies. Sessions load by replaying the file.

**Why AsyncLocalStorage for correlation?**
Node.js `AsyncLocalStorage` propagates context through async call chains automatically. A `correlationId` set when a request starts is readable in any `.then()` or async function called during that request — including inside `pg.Pool.query`. No manual threading.

**Why patch Pool only, not Client?**
`pg.Pool.query` internally calls `pg.Client.query`. Patching both doubles every event. Only Pool is patched.

**Why 1.5s delay in `observer_debug_request`?**
Events travel: `app → EventQueue (setImmediate) → HTTP POST → daemon → disk`. The 1.5s settle ensures all in-flight events from the most recent request have arrived before the tool queries them.
