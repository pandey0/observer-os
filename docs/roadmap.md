# Observer OS — Product Roadmap

> **North Star**: Become the runtime platform for software development. Just as Git became the language of version control and Docker became the language of containers, Observer OS aims to become the language of Runtime Intelligence.

---

## Current State

| Asset | Status |
|-------|--------|
| RFC series (RFC-0000 → RFC-0012) | ✅ Complete |
| Architecture Review 001 | ✅ Complete — Event-sourced architecture adopted |
| Vocabulary / Glossary | ✅ Locked |
| Architecture documentation | ✅ Complete |
| Phases 1–5 (v0.1 → v1.0) | ✅ Complete — 409/409 tests passing |
| Zero-config DX (`observer run` + `/observer.js`) | ✅ Complete |
| Auto-instrumentation (`@observer-os/auto-instrument`) | ✅ Complete |

---

## Phase 0 — Foundation ✅

*The RFC and architecture phase. What we're completing now.*

- [x] RFC-0000: Platform Philosophy — 10 engineering principles locked
- [x] RFC-0001: Glossary — Observer vocabulary defined and locked
- [x] RFC-0002: Vision — product positioning and architecture overview
- [x] RFC-0003: Runtime Object Model — universal runtime schema
- [x] RFC-0004: Runtime Event Model — immutable event foundation
- [x] RFC-0005: Runtime Graph — directed causal graph model
- [x] RFC-0006: Projection Engine — event-sourced architecture implemented
- [x] RFC-0007: Session Model — bounded investigation lifecycle
- [x] RFC-0008: Context Engine — curated AI-ready intelligence packages
- [x] RFC-0009: Plugin SDK — runtime instrumentation contract
- [x] RFC-0010: Browser Observer — reference plugin specification
- [x] RFC-0011: Runtime Explorer — primary UX specification
- [x] RFC-0012: AI Context API — external HTTP/WebSocket API specification
- [x] Architecture Review 001 — event-sourced vs graph-centric decision resolved

**Phase 0 success**: 50 engineers could join and understand Observer from documentation alone.

---

## Phase 1 — Core Engine (v0.1) ✅

*Build the foundation. No UX. No plugins. Events and projections only.*

### Deliverables

| Component | Description |
|-----------|-------------|
| Event Log | Append-only, in-memory + local disk persistence |
| Projection Engine (push path) | Live incremental graph updates; < 1ms per event |
| Runtime Object Model | Node types, relationship types, lifecycle management |
| Session Engine v0.1 | Create, start, complete, archive. Single session only. |
| Plugin SDK v0.1 | Event emission, node type registration, basic discovery |
| Local HTTP API | `GET /sessions`, `GET /sessions/{id}/nodes`, `GET /sessions/{id}/events` |

### Out of Scope for Phase 1

- UI (no Runtime Explorer)
- Context Engine
- Cross-domain correlation
- Replay
- Historical queries

**Phase 1 success**: A plugin can emit events, the platform stores them, and the graph projection reflects the current state of the emitted events via the REST API. ✅ Delivered — 71 core tests, 26 SDK tests.

---

## Phase 2 — Browser Intelligence (v0.2) ✅

*Make the browser runtime observable. Deliver the primary AI integration workflow.*

### Deliverables

| Component | Description |
|-----------|-------------|
| Browser Observer plugin | Network, Console, DOM, Exception, Navigation, Storage, Performance nodes |
| Runtime Explorer v0.1 | Graph view, Timeline view, Inspector panel |
| Context Engine v0.1 | Error anchor, DETAILED depth, Markdown format |
| "Copy Context" workflow | Select error → Copy → Paste into AI assistant |
| Session Browser | List sessions, start/stop sessions |
| AI Context API v0.1 | `POST /sessions/{id}/context`, basic REST queries |

### The Critical Workflow

```
Developer sees error in Runtime Explorer
  → clicks "Copy Context"
  → Context Engine assembles: error + causal chain + source locations
  → Copied to clipboard as Markdown
  → Developer pastes into AI assistant
  → AI has complete structured runtime context
```

This workflow eliminates manual context transfer. Everything else is additive.

**Phase 2 success**: A developer can open Observer, run their app, encounter an error, and send the AI assistant a complete structured context package in one click. ✅ Delivered — Runtime Explorer (React), plugin-browser (36 tests), context-engine (23 tests), AI query with SSE streaming.

---

## Phase 3 — Backend Intelligence (v0.3) ✅

*Full-stack observability. Developer workflow across browser + backend + database.*

### Deliverables

| Component | Description |
|-----------|-------------|
| Node.js / Express / Fastify Observer | HTTP requests, routes, middleware, process events |
| PostgreSQL Observer | Queries, transactions, connections, query plans |
| React Observer | Component tree, props, state, hooks, renders |
| Cross-domain correlation | Browser request → Backend route → DB query edges |
| Projection Engine pull path | Replay, historical queries, cold-start from snapshot |
| Session comparison (Diff) | Compare two sessions to find regressions |
| AI Context API WebSocket | Live event subscriptions for AI agents |

**Phase 3 success**: A developer can trace a failed user action from button click through React state, fetch request, Express route, PostgreSQL query, and back — all in one Runtime Explorer graph view. ✅ Delivered — plugin-express (28 tests), plugin-postgres (12 tests), plugin-react (7 tests), W3C traceparent correlation, AsyncLocalStorage propagation.

---

## Phase 4 — Full Stack Intelligence (v0.4) ✅

*Containers, queues, caches. Session replay. First stable plugin ecosystem.*

### Deliverables

| Component | Description |
|-----------|-------------|
| Docker Observer | Container lifecycle, resource usage, logs |
| Redis Observer | Commands, keyspace notifications, pub/sub |
| Session Replay | FAST mode (instant), TIMING_FAITHFUL mode (real-time), STEP_BY_STEP (interactive) |
| Plugin SDK v1.0 | Stable API, schema evolution, capability negotiation, `@observer-os/plugin-test` |
| Runtime Explorer v1.0 | Focus Mode, Search, Replay Mode, Session Browser, keyboard navigation |
| Snapshot Manager | Periodic checkpoints for cold-start performance |
| Plugin documentation site | First-party and third-party plugin development guides |

**Phase 4 success**: Any developer using React + Node.js + PostgreSQL has complete runtime visibility. Plugin authors can build and publish Observer plugins independently. ✅ Delivered — plugin-redis (14 tests), plugin-prisma (11 tests), plugin-graphql (11 tests), plugin-http (10 tests), plugin-nextjs (21 tests), session replay modes, Plugin SDK v1.0, persistence + snapshot manager.

---

## Phase 5 — Platform (v1.0) ✅

*Public release. AI integrations. Team features.*

### Deliverables

| Component | Description |
|-----------|-------------|
| Observer OS v1.0 public release | Stable API, stable SDK, production-quality Explorer |
| Claude MCP Server | MCP tool definitions for Claude to call the AI Context API |
| Cursor extension | IDE integration: runtime context surfaced in Cursor AI panel |
| VS Code extension | Status bar, error detection, one-click "Copy Context" |
| Session sharing (opt-in) | Export sessions as read-only links for team debugging |
| Plugin registry | Searchable registry of verified Observer plugins |
| SDK documentation site | `docs.observeros.dev` — full API and SDK reference |

**Phase 5 success**: Observer OS is the standard way to give AI assistants runtime context. Developers say "did you check Observer?" the way they say "did you check the console?" ✅ Delivered — MCP server (15 tests), VS Code extension (19 tests), session sharing (self-contained HTML export), plugin registry (17 tests), zero-config `observer run` + `/observer.js` inject, `@observer-os/auto-instrument` --require hook, WebSocket coverage browser + server. Total: 409/409 tests passing.

---

## Future (v2.0+) 🔬

*Research and long-term vision.*

| Item | Description |
|------|-------------|
| Distributed sessions | Multi-machine Observer instances sharing a session across a microservices cluster |
| Production mode | Lightweight ROM event emission from production deployments; bridge to observability platforms |
| Python Observer | Full Python / FastAPI / Django / SQLAlchemy plugin suite |
| Go Observer | Go HTTP, gRPC, database plugins |
| Session branching | Counterfactual replay: "what would have happened if this function returned X?" |
| Natural language context queries | "Why did the order fail?" → Context Engine resolves to the relevant error |
| Observer as open standard | Publish Runtime Object Model as an open specification for third-party tooling |
| Observer Cloud | Optional cloud layer: persistent session storage, team workspaces, remote AI agent access |

---

## Non-Goals (Permanent)

Observer will never be:

| Not This | Reason |
|----------|--------|
| An AI model | Observer produces facts; AI reasons about them. |
| An IDE | Runtime layer must be independent of editing environment. |
| A production APM | Designed for local development comprehension, not fleet monitoring. |
| A log aggregator | Logs are one input to Observer, not the product. |
| A browser DevTools replacement | Observer is a layer above DevTools, not a replacement. |

---

## Engineering Principles (Permanent — RFC-0000)

Every feature in every phase must answer yes to:

> **Does this improve the developer's understanding of running software?**

If no, it doesn't belong in Observer.

---

## References

- [Architecture Review 001](architecture/review-001-source-of-truth.md) — Event-sourced architecture decision
- [RFC-0002](rfcs/0002-vision.md) — Full vision and product philosophy
- [RFC-0000](rfcs/0000-philosophy.md) — Engineering principles
