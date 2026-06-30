# Getting Started with Observer OS

Observer OS is a local-first Runtime Intelligence Platform. It captures everything happening in your application — browser requests, server routes, database queries, WebSocket connections — as an immutable event stream, projects it into a live runtime graph, and makes that graph available to AI agents via MCP.

---

## Quickstart (zero config)

```bash
# 1. Clone and build
git clone <repo>
cd observe
pnpm install && pnpm build

# 2. Start the daemon (auto-creates a default session)
pnpm --filter @observer-os/daemon start
# Observer OS ready → http://localhost:4000

# 3. Run your app with auto-instrumentation
observer run node server.js
# or: observer run npm start
# or: observer run tsx src/index.ts

# 4. Add one script tag to your HTML (browser instrumentation)
# <script src="http://localhost:4000/observer.js"></script>

# 5. Open the runtime graph
pnpm --filter @observer-os/explorer dev
# → http://localhost:5173
```

That's it. No session creation. No plugin wiring. No code changes to your app.

---

## What gets instrumented automatically

### Node.js (via `observer run`)

`observer run` injects `@observer-os/auto-instrument` before your code via `NODE_OPTIONS=--require`. It probes `node_modules` and patches whatever it finds:

| Library | Auto-detected? | Events emitted |
|---------|---------------|----------------|
| Any HTTP framework (Express, Fastify, Koa, raw `http`) | Yes — patches `http.createServer` | `request.started`, `request.completed`, `request.failed` |
| Outgoing HTTP/HTTPS | Yes — patches `http.request` | `request.started`, `request.completed`, `request.failed` |
| `pg` (PostgreSQL) | Yes if installed | `query.started`, `query.completed`, `query.failed` |
| `ioredis` | Yes if installed | `command.started`, `command.completed`, `command.failed` |
| `ws` (WebSocket server) | Yes if installed | `client.connected`, `client.message`, `client.disconnected` |

No code changes needed in your application.

### Browser (via `<script>`)

The inject script served at `http://localhost:4000/observer.js` patches universal browser APIs:

| API | Events emitted |
|-----|----------------|
| `window.fetch` | `fetch.started`, `fetch.completed`, `fetch.failed` |
| `XMLHttpRequest` | `xhr.started`, `xhr.completed`, `xhr.failed` |
| `WebSocket` | `ws.connected`, `ws.disconnected`, `ws.error`, `ws.message.received`, `ws.message.sent` |
| `console.error` | `console.error` |
| `window.onerror` | `js-error` |
| `unhandledrejection` | `unhandled-rejection` |
| `history.pushState` | `navigation` |

---

## Architecture

```
Your Browser
  <script src="http://localhost:4000/observer.js">
        │
        │  POST /api/sessions/{id}/events
        ▼
Observer Daemon  :4000
  ├── EventLog          (immutable append-only)
  ├── ProjectionEngine  (live runtime graph)
  ├── SessionEngine     (session lifecycle)
  ├── REST API + WebSocket
  └── GET /observer.js  (browser inject script)
        ▲
        │  NODE_OPTIONS=--require @observer-os/auto-instrument
Your Node.js App (separate process, via observer run)
```

---

## Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OBSERVER_PORT` | `4000` | Daemon port |
| `OBSERVER_HOST` | `127.0.0.1` | Bind address |
| `OBSERVER_API_KEY` | unset | When set, all API calls require `Authorization: Bearer <key>` or `X-Api-Key: <key>` header. `/api/health` always public. |
| `OBSERVER_DATA_DIR` | unset | Directory for persistent event storage. Omit for in-memory only. |
| `OBSERVER_LOG_LEVEL` | `info` | `debug \| info \| warn \| error` |
| `OBSERVER_URL` | `http://localhost:4000` | Used by SDK and auto-instrument to reach the daemon |

---

## Manual SDK path (power users)

If you want fine-grained control instead of `observer run`:

```typescript
import { PluginSDKImpl } from '@observer-os/sdk';
import { createRequestMiddleware } from '@observer-os/plugin-express';

// Connect to the default session (auto-created by daemon on startup)
const sdk = new PluginSDKImpl(/* ... */);
await sdk.connectToDefault(); // hits GET /api/sessions/default

// Use with Express
app.use(createRequestMiddleware(sdk));
```

See `packages/sdk` and individual plugin packages for full API.

---

## Sessions

A **session** is a bounded observation window. All events, nodes, and edges are scoped to one session.

The daemon **auto-creates a Default Session on startup** — you don't need to create one manually.

### API

```bash
# Get the default (active) session
curl http://localhost:4000/api/sessions/default

# List all sessions
curl http://localhost:4000/api/sessions

# Create a named session
curl -X POST http://localhost:4000/api/sessions \
  -H 'content-type: application/json' \
  -d '{"name":"checkout-bug-hunt","tags":["prod-repro"]}'

# End a session
curl -X DELETE http://localhost:4000/api/sessions/{id}

# Share a session (returns self-contained HTML)
curl http://localhost:4000/api/sessions/{id}/share > session.html
```

---

## Querying captured data

### REST API

```bash
SESSION=<session-id>

# Get materialized runtime graph (nodes + edges)
curl http://localhost:4000/api/sessions/$SESSION/nodes | jq .

# Get raw events
curl http://localhost:4000/api/sessions/$SESSION/events | jq .

# Filter events
curl "http://localhost:4000/api/sessions/$SESSION/events?severity=ERROR&limit=20"

# Get AI-ready context package around a node
curl -X POST http://localhost:4000/api/sessions/$SESSION/context \
  -H 'content-type: application/json' \
  -d '{"nodeId":"browser:fetch:api-checkout","depth":"DETAILED"}'

# Ask a natural language question (requires ANTHROPIC_API_KEY)
curl -X POST "http://localhost:4000/api/sessions/$SESSION/query?stream=true" \
  -H 'content-type: application/json' \
  -d '{"question":"why did the checkout fail?"}'
```

### WebSocket (live stream)

```js
const ws = new WebSocket(`ws://localhost:4000/ws/sessions/${sessionId}`);

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  // msg.type: 'snapshot' | 'event' | 'node' | 'pong'
};

// Keep-alive
setInterval(() => ws.send(JSON.stringify({ type: 'ping' })), 30_000);
```

On connect, you receive a `snapshot` with full current state. After that, `event` and `node` messages arrive as new data comes in.

---

## Cross-domain correlation

When your browser calls `fetch('/api/checkout')`:

1. The inject script adds `traceparent: 00-<traceId>-<spanId>-01` (W3C standard)
2. The auto-instrument hook reads this header in the Express request
3. The `ProjectionEngine.CorrelationResolver` links the browser node to the Express node with a `CORRELATED_WITH` edge

Result: you see the full chain — browser fetch → Express route → PostgreSQL query — in one graph view, with timing at each step.

---

## CLI reference

```bash
observer sessions list                     # list all sessions
observer sessions create --name "my-run"  # create named session
observer sessions search --tag prod        # search by tag
observer emit <session-id> <event-type> <node-id> '{"key":"val"}'
observer query <session-id> "why did X fail?"
observer export <session-id> --format json
observer run <command>                     # run with auto-instrumentation
```

---

## Prometheus metrics

```bash
curl http://localhost:4000/api/metrics
```

Returns text/plain Prometheus format:

```
observer_sessions_total{status="ACTIVE"} 1
observer_events_total 142
observer_alerts_fired_total 3
observer_memory_rss_bytes 52428800
observer_uptime_seconds 312
```

---

## Package map

```
observe/
├── packages/
│   ├── core/                @observer-os/core        — EventLog, ProjectionEngine, SessionEngine
│   ├── sdk/                 @observer-os/sdk          — PluginSDKImpl, PluginRegistry
│   ├── auto-instrument/     @observer-os/auto-instrument — --require hook, zero-config
│   ├── context-engine/      @observer-os/context-engine  — AI context packages
│   ├── ai-query/            @observer-os/ai-query        — Anthropic streaming query
│   ├── cli/                 @observer-os/cli             — observer CLI
│   ├── mcp-server/          @observer-os/mcp-server      — MCP tools for Claude/Cursor
│   ├── registry/            @observer-os/registry        — plugin registry
│   ├── plugin-browser/      @observer-os/plugin-browser  — browser IIFE instrumentation
│   ├── plugin-express/      @observer-os/plugin-express  — Express middleware
│   ├── plugin-postgres/     @observer-os/plugin-postgres — pg Pool/Client patching
│   ├── plugin-redis/        @observer-os/plugin-redis    — ioredis patching
│   ├── plugin-prisma/       @observer-os/plugin-prisma   — Prisma $extends
│   ├── plugin-graphql/      @observer-os/plugin-graphql  — execute() wrapping
│   ├── plugin-http/         @observer-os/plugin-http     — http/https patching
│   ├── plugin-react/        @observer-os/plugin-react    — React component tracking
│   └── plugin-nextjs/       @observer-os/plugin-nextjs   — Next.js integration
│
└── apps/
    ├── daemon/              @observer-os/daemon          — Fastify daemon, REST + WS + MCP
    ├── explorer/            @observer-os/explorer        — React runtime graph UI
    └── vscode-extension/    observer-os-vscode           — VS Code status bar + commands
```

---

## Event type naming

All event types follow `observer.<domain>/<object>.<verb>`:

```
observer.http-server/request.started
observer.http-server/request.completed
observer.http-server/request.failed
observer.http-client/request.started
observer.postgres/query.completed
observer.postgres/query.failed
observer.redis/command.completed
observer.ws/client.connected
observer.ws/client.disconnected
observer.browser/fetch.started
observer.browser/fetch.failed
observer.browser/ws.connected
observer.browser/ws.disconnected
observer.browser/console.error
observer.browser/js-error
observer.browser/unhandled-rejection
observer.browser/navigation
```

Domain is extracted from before `/`. The `ProjectionEngine.GraphMaterializer` infers node type and domain automatically.
