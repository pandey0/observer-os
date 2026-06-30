# Observer OS — FAQ

Answers to every common question about how Observer OS works, what each piece does, and how to use it with your stack.

---

## Table of Contents

1. [What is Observer OS?](#1-what-is-observer-os)
2. [What are the plugins and what do they do?](#2-what-are-the-plugins-and-what-do-they-do)
3. [Does Observer only support certain tech stacks?](#3-does-observer-only-support-certain-tech-stacks)
4. [How do I add support for a database/library Observer doesn't know about?](#4-how-do-i-add-support-for-a-databaselibrary-observer-doesnt-know-about)
5. [What is the daemon and how does it run?](#5-what-is-the-daemon-and-how-does-it-run)
6. [What are Explorer, MCP, and plugins — are they the same thing?](#6-what-are-explorer-mcp-and-plugins--are-they-the-same-thing)
7. [What MCP tools are available?](#7-what-mcp-tools-are-available)
8. [Can I use Observer with only the MCP server (no browser UI)?](#8-can-i-use-observer-with-only-the-mcp-server-no-browser-ui)
9. [How do I use Observer with a Next.js app?](#9-how-do-i-use-observer-with-a-nextjs-app)
10. [How does auto-instrument work without code changes?](#10-how-does-auto-instrument-work-without-code-changes)
11. [What does an AI agent actually see through Observer?](#11-what-does-an-ai-agent-actually-see-through-observer)

---

## 1. What is Observer OS?

Observer OS is a **local-first runtime intelligence platform**. It sits next to your running application and records everything that happens — HTTP requests, SQL queries, Redis commands, console output, WebSocket messages — with no code changes required.

The data is stored locally in `~/.observer/` and exposed over a REST API at `localhost:4000`. Three things can read that data:

- **Explorer** (browser UI) — for humans to visually inspect
- **MCP server** — for AI agents (Claude Code) to read and reason about
- **Your own tooling** — the API is open

---

## 2. What are the plugins and what do they do?

There are two separate systems. People often confuse them:

### `auto-instrument` (zero-config)

A Node.js `--require` hook. Runs before your app, patches standard library prototypes at the process level. No imports, no code changes.

Covers:
- `http.Server` — all incoming HTTP requests + response bodies
- `pg.Pool` — PostgreSQL queries + params
- `ioredis` / `node-redis` — Redis commands
- `ws` — WebSocket messages
- `console.log/warn/error/debug/info` — all console output, correlated to the request that triggered it

### `plugin-*` packages (opt-in, SDK-based)

Manual instrumentation. You import and wire these up yourself. They extract library-level semantics that prototype-patching cannot see.

| Package | What it adds |
|---|---|
| `plugin-express` | Route name, middleware chain |
| `plugin-postgres` | Same as auto-instrument but with SDK integration |
| `plugin-redis` | Same as auto-instrument but with SDK integration |
| `plugin-prisma` | Prisma model name, operation type (`findMany`, `create`, etc.) |
| `plugin-graphql` | GraphQL operation name, query/mutation/subscription type |
| `plugin-nextjs` | App Router route names, `getServerSideProps` context, server component fetch calls |
| `plugin-react` | Component render counts, state changes, hook calls |
| `plugin-browser` | Browser fetch/XHR, DOM errors, navigation events |
| `plugin-http` | Outgoing `http.request` / `https.request` calls |

**Rule of thumb:** start with `auto-instrument`. Add plugins only when you need library-level metadata (Prisma model names, GraphQL operation names, Next.js route names).

---

## 3. Does Observer only support certain tech stacks?

No. The plugin list is not a limitation — it's an extension list.

`auto-instrument` works at the **protocol layer**, not the library layer:

- Patches `http.Server.prototype.emit` → catches **all** HTTP traffic regardless of framework (Express, Fastify, Hapi, Koa, raw Node — they all use `http.Server`)
- Patches `pg.Pool.prototype.query` → catches **all** Postgres queries regardless of ORM (Sequelize, TypeORM, Drizzle, Knex — they all call `pg` underneath)
- Patches `ioredis`/`node-redis` prototypes → same pattern

So if your stack is: **Fastify + TypeORM + Redis** — you get full visibility with zero code changes, even though there is no `plugin-fastify` or `plugin-typeorm`.

What you lose without specific plugins is the **semantic layer**: Fastify won't tell Observer the route name, TypeORM won't tell Observer which model is being queried. You'll still see the SQL and the HTTP, just without those labels.

---

## 4. How do I add support for a database/library Observer doesn't know about?

Write a patcher. The pattern is always the same:

1. Use `tryRequire('library-name')` to detect if the library is installed — if not, return `false` and skip.
2. Patch the prototype method that executes queries/commands.
3. Push `started`, `completed`, `failed` events to the queue.
4. Re-throw errors so the app is unaffected.

### MySQL example (`mysql2`)

```typescript
// packages/auto-instrument/src/patchers/mysql.ts
import { tryRequire } from '../detect';
import type { EventQueue } from '../queue';
import { correlationStorage } from '../context';

export function patchMysql(queue: EventQueue): boolean {
  const mysql2 = tryRequire('mysql2/promise') ?? tryRequire('mysql2');
  if (!mysql2) return false;

  const Pool = (mysql2 as any).Pool;
  if (!Pool?.prototype) return false;

  const orig = Pool.prototype.query;
  Pool.prototype.query = function (...args: unknown[]) {
    const sql = typeof args[0] === 'string' ? args[0] : (args[0] as any)?.sql ?? 'unknown';
    const correlationId = correlationStorage.getStore();
    const startedAt = Date.now();

    queue.push({ type: 'observer.mysql/query.started', sourceNodeId: 'mysql:pool', correlationId, occurredAt: startedAt, severity: 'DEBUG', payload: { query: sql.slice(0, 400) } });

    const result = orig.apply(this, args) as Promise<unknown>;
    return result
      .then((r) => {
        queue.push({ type: 'observer.mysql/query.completed', sourceNodeId: 'mysql:pool', correlationId, occurredAt: Date.now(), severity: 'DEBUG', payload: { durationMs: Date.now() - startedAt } });
        return r;
      })
      .catch((err: Error) => {
        queue.push({ type: 'observer.mysql/query.failed', sourceNodeId: 'mysql:pool', correlationId, occurredAt: Date.now(), severity: 'ERROR', payload: { errorMessage: err.message, durationMs: Date.now() - startedAt } });
        throw err;
      });
  };
  return true;
}
```

Then wire it in `packages/auto-instrument/src/index.ts`:
```typescript
import { patchMysql } from './patchers/mysql';
// ...
if (patchMysql(queue)) detected.push('mysql2');
```

Same pattern works for `mongodb`, `mongoose`, `mysql`, `better-sqlite3`, `cassandra-driver`, etc.

---

## 5. What is the daemon and how does it run?

The daemon is a plain **Node.js process** that:
- Receives events from your instrumented app over HTTP (`POST /api/sessions/:id/events`)
- Stores them to disk at `~/.observer/sessions/<session-id>/`
- Exposes a REST API for Explorer, MCP server, and your own tooling to query

### Storage format

Flat files — no SQLite, no external database:
```
~/.observer/
  sessions/
    ses_abc123/
      session.json       ← session metadata (name, status, timestamps)
      events.ndjson      ← one JSON event per line, appended synchronously (crash-safe)
    ses_def456/
      session.json
      events.ndjson
```

On restart, the daemon reads all NDJSON files back into memory. No migrations, no setup.

### How to start it

```bash
# In this monorepo (local dev):
node apps/daemon/dist/index.js

# Once published to npm (future):
npx @observer-os/daemon
```

Starts on `localhost:4000` by default. Environment overrides:

```bash
OBSERVER_PORT=4001        # change port
OBSERVER_STORAGE_PATH=/tmp/obs  # change where data is stored
OBSERVER_API_KEY=secret   # enable auth
```

### The daemon is the spine

Everything connects to it:

```
your app (auto-instrument)  ──POST /events──▶  daemon (port 4000)
                                                    │
                               ┌────────────────────┼────────────────────┐
                               ▼                    ▼                    ▼
                          Explorer            MCP Server          your tooling
                        (port 5173)          (stdio)            (direct HTTP)
```

Nothing in Observer talks directly to your app. Everything flows through the daemon.

---

## 6. What are Explorer, MCP, and plugins — are they the same thing?

No. They do completely different jobs:

| | Role | Who uses it | Direction |
|---|---|---|---|
| **auto-instrument** | Produces data | Your app (via `--require`) | Writes TO daemon |
| **plugin-*** | Produces data (with SDK) | Your app (manual import) | Writes TO daemon |
| **Explorer** | Consumes data visually | Human developer (browser) | Reads FROM daemon |
| **MCP server** | Consumes data for AI | Claude Code (AI agent) | Reads FROM daemon |

Plugins and `auto-instrument` are the **ingestion** side — they put data in.

Explorer and MCP are the **consumption** side — they take data out.

You can mix and match:
- Only MCP, no Explorer → perfectly valid
- Only Explorer, no MCP → perfectly valid
- Both → you can watch the graph while Claude also reads it

---

## 7. What MCP tools are available?

### Observer tools (runtime data)

| Tool | What it does |
|---|---|
| `observer_list_sessions` | List all sessions with status, node count, event count |
| `observer_get_session` | Single session details |
| `observer_search_sessions` | Filter by query text, domain, status, tag |
| `observer_get_nodes` | All graph nodes for a session (infrastructure + operation nodes) |
| `observer_get_events` | Raw event timeline, paginated |
| `observer_get_context` | Structured context around one node — causal chain, source locations |
| `observer_get_performance` | p50/p95/p99 latency, slowest operations |
| `observer_export_session` | Full session as markdown or JSON |
| `observer_query` | Ask Claude a natural-language question about a session (requires `ANTHROPIC_API_KEY`) |
| **`observer_debug_request`** | **Main debugging tool** — reconstructs full HTTP chain: request body, response body, all SQL queries + params, Redis commands, console output, auto-detected anomalies |

### CDP tools (browser control via Chrome DevTools Protocol)

Requires Chrome running with `--remote-debugging-port=9222`.

| Tool | What it does |
|---|---|
| `cdp_status` | Check if Chrome is connected |
| `cdp_list_pages` | List all open tabs |
| `cdp_navigate` | Navigate to a URL |
| `cdp_new_page` | Open a new tab |
| `cdp_select_page` | Switch active tab |
| `cdp_take_screenshot` | Screenshot (full page or CSS selector) |
| `cdp_take_snapshot` | Accessibility tree snapshot (page structure as text) |
| `cdp_evaluate` | Run JavaScript in page context |
| `cdp_click` | Click a CSS selector |
| `cdp_fill` | Type into an input |
| `cdp_press_key` | Send a key (Enter, Tab, Escape, etc.) |
| `cdp_get_console` | Browser console messages |
| `cdp_get_network` | Network requests from the browser |
| `cdp_heap_snapshot` | JavaScript heap size summary |
| `cdp_performance_start/stop` | Chrome performance trace |
| `cdp_emulate` | Mobile device emulation (iPhone 12, Galaxy S21, etc.) |

---

## 8. Can I use Observer with only the MCP server (no browser UI)?

Yes. Explorer is optional.

Minimum setup for MCP-only:

```bash
# 1. Start daemon
node apps/daemon/dist/index.js

# 2. Start your app with auto-instrument
NODE_OPTIONS="--require /path/to/auto-instrument/dist/index.js" \
OBSERVER_URL=http://localhost:4000 \
node src/index.js
```

```jsonc
// .claude/mcp.json
{
  "mcpServers": {
    "observer": {
      "command": "node",
      "args": ["/path/to/observer/packages/mcp-server/dist/index.js"],
      "env": { "OBSERVER_URL": "http://localhost:4000" }
    }
  }
}
```

That's all. Claude Code now has full visibility into your running app. The typical AI agent workflow:

```
agent writes code
     ↓
agent runs the app / triggers a request
     ↓
agent calls observer_debug_request
     ↓
sees: exact SQL that failed, request body that caused it,
      console.error that fired, 500 response body
     ↓
agent fixes the code inline, no copy-pasting, no logs to grep
```

---

## 9. How do I use Observer with a Next.js app?

Two paths. Start with Path A.

### Path A — Zero config via `NODE_OPTIONS` (2 minutes, no code changes)

```bash
# Start daemon
node /path/to/observer/apps/daemon/dist/index.js

# Start Next.js with Observer injected
NODE_OPTIONS="--require /path/to/observer/packages/auto-instrument/dist/index.js" \
OBSERVER_URL=http://localhost:4000 \
npx next dev
```

**Gets you:** all HTTP requests + response bodies, all SQL queries + params (if using `pg`), Redis commands, console output correlated to requests.

**Note:** Next.js spawns webpack and other child processes too. They inherit `NODE_OPTIONS` but `auto-instrument` silently skips processes where nothing is patchable. No harm done.

### Path B — `instrumentation.ts` + plugin (Next.js 13.4+, richer metadata)

Install:
```bash
npm install @observer-os/plugin-nextjs @observer-os/sdk
```

Create `instrumentation.ts` in your project root:
```typescript
export async function register() {
  // Only run in the Node.js server runtime, not Edge
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { ObserverClient } = await import('@observer-os/sdk');
  const { registerObserver } = await import('@observer-os/plugin-nextjs');

  const sdk = new ObserverClient({
    daemonUrl: process.env.OBSERVER_URL ?? 'http://localhost:4000',
  });
  await sdk.createSession({ name: `nextjs — pid ${process.pid}` });
  registerObserver(sdk);
}
```

Wrap App Router handlers:
```typescript
// app/api/users/route.ts
import { withAppRouterObserver } from '@observer-os/plugin-nextjs';

export const GET = withAppRouterObserver(async (req) => {
  const users = await db.query('SELECT * FROM users');
  return Response.json(users);
});
```

Wrap Pages Router handlers:
```typescript
// pages/products.tsx
import { withObserver } from '@observer-os/plugin-nextjs';

export const getServerSideProps = withObserver(async (ctx) => {
  const data = await fetchProducts();
  return { props: { data } };
}, sdk, 'gssp');
```

**Gets you:** everything from Path A + route names, `getServerSideProps` timing, server component fetch chain.

### Which path to choose

- Starting out, debugging an API → **Path A**
- Need to know which specific Next.js route is slow, or which server component fetches too much → **Path B**

---

## 10. How does auto-instrument work without code changes?

Node.js has a `--require` flag that runs a file before your app. `auto-instrument` uses this to patch standard library prototypes synchronously, before any user code loads.

```bash
node --require ./auto-instrument/dist/index.js src/app.js
```

When your app eventually does `require('pg')` or `require('ioredis')`, it gets the already-patched version. Every query, every command, every HTTP request from that point on flows through Observer's wrappers.

`auto-instrument` uses a **PID-keyed lockfile** (`/tmp/.obs-init-<pid>`) to ensure it only patches once even when the runtime (like `tsx`) loads the require hook twice in separate V8 threads.

Session lifecycle:
- On startup: creates a session named `<entrypoint> — pid <pid>` and starts buffering events
- On clean exit (`SIGTERM`/`SIGINT`): marks session as COMPLETED
- On crash: session stays ACTIVE. Next run cleans up orphaned ACTIVE sessions matching that pattern automatically.

---

## 11. What does an AI agent actually see through Observer?

Using `observer_debug_request`, the agent gets a full markdown report for any HTTP request:

```markdown
## POST /api/projects/123/tasks
Status: 500 | Duration: 54ms
Content-Type: application/json

### Request Body
{"title": "Fix auth bug", "assignee_id": "not-a-uuid"}

### Response Body
{"error": "Internal server error", "message": "invalid input syntax for type uuid: \"not-a-uuid\""}

### SQL Queries (2 executed)

✓ Query (10ms)
SELECT workspace_id FROM projects WHERE id = $1
Params: ["00000000-0000-0000-0000-000000000020"]

❌ FAILED Query (15ms)
SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2
Params: ["00000000-0000-0000-0000-000000000010", "not-a-uuid"]
Error: `invalid input syntax for type uuid: "not-a-uuid"`

### Console Output
[ERROR] [error] invalid input syntax for type uuid: "not-a-uuid"

### Anomalies Detected
- SQL error: invalid input syntax for type uuid: "not-a-uuid"
- HTTP 500 response
```

From this single tool call, the agent knows:
- Exact payload sent
- Which SQL query failed and with what params
- The database error message verbatim
- What `console.error` fired during the request
- The response the client received

The agent does not need to grep logs, add print statements, re-run requests, or ask the developer for more information. It has everything needed to identify and fix the bug.

---

## Quick Reference

```bash
# Start daemon
node apps/daemon/dist/index.js

# Start any Node.js app with Observer
NODE_OPTIONS="--require /path/to/auto-instrument/dist/index.js" \
OBSERVER_URL=http://localhost:4000 \
node src/index.js

# Start Next.js with Observer
NODE_OPTIONS="--require /path/to/auto-instrument/dist/index.js" \
OBSERVER_URL=http://localhost:4000 \
npx next dev

# Open Explorer (browser UI)
# Visit http://localhost:5173

# MCP config for Claude Code (.claude/mcp.json)
{
  "mcpServers": {
    "observer": {
      "command": "node",
      "args": ["/path/to/observer/packages/mcp-server/dist/index.js"],
      "env": { "OBSERVER_URL": "http://localhost:4000" }
    }
  }
}
```

### Ports

| Service | Port | Purpose |
|---|---|---|
| Daemon API | 4000 | Event ingestion + query |
| Explorer | 5173 | Browser UI |
| Demo app | 3000 | Example application |
| PostgreSQL (Docker) | 5433 | Database (remapped from 5432) |
| Redis (Docker) | 6379 | Cache |
| Browser bridge | 7891 | Browser plugin inject script |
