# Observer OS — Glossary

Quick reference for all Observer OS terms. For full definitions, rationale, and design context see [RFC-0001](rfcs/0001-glossary.md).

---

## Core Terms

**AI Consumer** — Any external system that consumes Runtime Intelligence produced by Observer. Examples: Claude, Cursor, GitHub Copilot, custom agents. Observer has no coupling to any specific AI Consumer. See [RFC-0001](rfcs/0001-glossary.md), [RFC-0012](rfcs/0012-ai-context-api.md).

**Capability** — An operation supported by a Runtime Node. Declared by the plugin at connect time. See [Capability Types](#capability-types) below. See [RFC-0001](rfcs/0001-glossary.md), [RFC-0009](rfcs/0009-plugin-sdk.md).

**Context** — A curated, structured subset of Runtime Intelligence assembled around a specific anchor (error, event, node, or time range). Never equivalent to the complete Runtime. Produced by the Context Engine. See [RFC-0001](rfcs/0001-glossary.md), [RFC-0008](rfcs/0008-context-engine.md).

**Context Anchor** — The origin point of a Context package. One of: `error`, `node`, `event`, `timeRange`, or `query` (future). See [RFC-0008](rfcs/0008-context-engine.md).

**Context Depth** — How much information a Context package contains. One of `SURFACE`, `DETAILED`, or `FULL`. See [Context Depth Levels](#context-depth-levels) below.

**Context Engine** — The platform component that transforms Runtime Graph subgraphs into structured Context packages. Produces facts; does not reason. See [RFC-0008](rfcs/0008-context-engine.md).

**Context Package** — The output of the Context Engine. Contains: anchor, causal chain, relevant nodes and events, source locations, summary, and redaction report. See [RFC-0008](rfcs/0008-context-engine.md).

**CorrelationId** — A value included in events by plugins to enable cross-domain edge formation. A browser `fetch` and a backend route handler share a `correlationId`; the Projection Engine matches them and creates a cross-domain Relationship. See [RFC-0004](rfcs/0004-runtime-event-model.md), [RFC-0009](rfcs/0009-plugin-sdk.md).

**Diff** — The semantic difference between two Snapshots of the same Runtime Node. Operates on structured objects, not raw text. See [RFC-0001](rfcs/0001-glossary.md).

**Discovery** — The process by which plugins automatically identify their Domain within a Workspace. Discovery is the default; configuration is the override. See [RFC-0001](rfcs/0001-glossary.md), [RFC-0009](rfcs/0009-plugin-sdk.md).

**Domain** — A distinct runtime ecosystem observed by one plugin. Examples: Browser Domain, Node.js Domain, PostgreSQL Domain. See [RFC-0001](rfcs/0001-glossary.md), [RFC-0003](rfcs/0003-runtime-object-model.md).

**Event Log** — The append-only, immutable, durable store of all Runtime Events. The source of truth in Observer's event-sourced architecture. All other data structures are projections derived from the Event Log. See [RFC-0004](rfcs/0004-runtime-event-model.md), [RFC-0006](rfcs/0006-projection-engine.md).

**Materializer** — A component inside the Projection Engine that processes Runtime Events and updates one specific projection (Graph Materializer, Timeline Materializer, Context Materializer). See [RFC-0006](rfcs/0006-projection-engine.md).

**Observation** — Structured runtime evidence collected during a Session. Factual; does not contain reasoning or interpretation. See [RFC-0001](rfcs/0001-glossary.md).

**Observer (plugin)** — A plugin responsible for exposing Runtime Nodes from one Domain. Implements the Plugin SDK. Examples: Browser Observer, React Observer. See [RFC-0001](rfcs/0001-glossary.md), [RFC-0009](rfcs/0009-plugin-sdk.md), [RFC-0010](rfcs/0010-browser-observer.md). **Note:** open naming question — may be renamed to "Probe" or "Sensor" to avoid collision with the Observer OS platform name.

**Projection** — A derived, disposable, deterministically-rebuildable view of the Event Log. The Runtime Graph, Timeline, and Context are all projections. Losing a projection is not data loss — it can always be rebuilt from the Event Log. See [RFC-0006](rfcs/0006-projection-engine.md).

**Projection Engine** — The platform component that processes Runtime Events and maintains all derived projections (Runtime Graph, Timeline views, Context packages). The only authorized writer to the Runtime Graph. See [RFC-0006](rfcs/0006-projection-engine.md).

**Runtime** — The complete executing state of a software application. In Observer, Runtime (capitalized) refers to the full, structured, observable state — richer than the general CS meaning of "when a program executes." See [RFC-0001](rfcs/0001-glossary.md).

**Runtime Explorer** — The primary user interface for navigating and understanding the Runtime. Shows the Runtime Graph, Timeline, and Inspector Panel. See [RFC-0001](rfcs/0001-glossary.md), [RFC-0011](rfcs/0011-runtime-explorer.md).

**Runtime Graph** — The complete directed graph of Runtime Nodes and Relationships within a Workspace. A projection of the Event Log — disposable and always rebuildable. See [RFC-0001](rfcs/0001-glossary.md), [RFC-0005](rfcs/0005-runtime-graph.md).

**Runtime Intelligence** — The product of transforming raw Runtime data into structured understanding: Context, Timelines, Diffs, Relationships, Sessions. Explicitly excludes AI reasoning. See [RFC-0001](rfcs/0001-glossary.md).

**Runtime Node** — The smallest individually addressable unit of observable runtime state. Every observable entity (HTTP request, React component, database query, etc.) is a Runtime Node. See [RFC-0001](rfcs/0001-glossary.md), [RFC-0003](rfcs/0003-runtime-object-model.md).

**Runtime Event** — An immutable record of a change that occurred within the Runtime. Never modified after creation. The source of truth. See [RFC-0001](rfcs/0001-glossary.md), [RFC-0004](rfcs/0004-runtime-event-model.md).

**Sequence Number** — A globally monotonic integer assigned by Observer to each Runtime Event on receipt. Used for canonical event ordering in projections. Not the same as `occurredAt` (plugin clock). See [RFC-0004](rfcs/0004-runtime-event-model.md), [RFC-0006](rfcs/0006-projection-engine.md).

**Session** — A bounded developer investigation. A named, scoped slice of the Event Log. Contains Runtime Events, Snapshots, and assembled Context packages. First-class object in Observer. See [RFC-0001](rfcs/0001-glossary.md), [RFC-0007](rfcs/0007-session-model.md). **Note:** "Session" in Observer = developer investigation, not HTTP/auth session.

**Snapshot** — An immutable, point-in-time copy of a Runtime Node's state or the full Runtime Graph state. Used for Diff operations and cold-start projection performance. See [RFC-0001](rfcs/0001-glossary.md).

**Timeline** — A chronological representation of Runtime Events associated with a Node or Session. A projection of the Event Log ordered by `occurredAt`. Designed for human navigation. See [RFC-0001](rfcs/0001-glossary.md).

**Workspace** — The top-level organizational unit in Observer. A software project under observation. Contains Domains, Sessions, and the Runtime Graph. Exists independently of any IDE. See [RFC-0001](rfcs/0001-glossary.md).

---

## Relationship Types

Typed, directional edges in the Runtime Graph. See [RFC-0001](rfcs/0001-glossary.md), [RFC-0005](rfcs/0005-runtime-graph.md).

| Type | Meaning | Example |
|------|---------|---------|
| `TRIGGERED` | Source caused Target to begin | `ButtonClick → TRIGGERED → HttpRequest` |
| `CALLED` | Source invoked Target | `Route → CALLED → DatabaseQuery` |
| `RETURNED` | Source produced result in Target | `DatabaseQuery → RETURNED → DbResult` |
| `FAILED` | Source caused Target to fail | `NetworkError → FAILED → HttpRequest` |
| `UPDATED` | Source modified state in Target | `HttpResponse → UPDATED → ReactComponent` |
| `RENDERED` | Source caused Target to be displayed | `ReactComponent → RENDERED → DomNode` |
| `CREATED` | Source caused Target to exist | `Factory → CREATED → WorkerProcess` |
| `DESTROYED` | Source caused Target to cease to exist | `GC → DESTROYED → CacheEntry` |
| `DEPENDS_ON` | Source requires Target to function | `Service → DEPENDS_ON → DbConnection` |
| `USES` | Source reads from Target without modifying | `Component → USES → Context` |
| `OBSERVES` | An Observer plugin monitors Target | `ReactObserver → OBSERVES → Component` |
| `PRODUCED` | Source created a message/item consumed downstream | `Worker → PRODUCED → KafkaMessage` |
| `CONSUMED` | Source processed a message/item from upstream | `Consumer → CONSUMED → KafkaMessage` |
| `CORRELATED_WITH` | Source and Target are linked by correlationId | `BrowserRequest → CORRELATED_WITH → BackendRoute` |
| `EXPLAINS` | Source provides causal explanation for Target | `DbConstraintError → EXPLAINS → HttpError` |

---

## Capability Types

Operations available on Runtime Nodes. Declared by plugins; checked by consumers before invocation. See [RFC-0001](rfcs/0001-glossary.md), [RFC-0009](rfcs/0009-plugin-sdk.md).

| Capability | Description |
|------------|-------------|
| `WATCH` | Subscribe to live state changes |
| `SNAPSHOT` | Capture immutable point-in-time copy |
| `DIFF` | Compare two Snapshots |
| `EXPAND` | Reveal child or related nodes (lazy loading) |
| `INSPECT` | View full structured detail |
| `REPLAY` | Re-execute the event sequence that produced this node |
| `TIMELINE` | View chronological event history |
| `SEARCH` | Query across nodes of this type |
| `RECORD` | Explicitly start recording events |

---

## Context Depth Levels

| Level | Contents | Typical size |
|-------|----------|-------------|
| `SURFACE` | Anchor node + direct relationships + 1-hop neighbors + error message | ~500 tokens |
| `DETAILED` | Anchor + causal chain to root + all affected nodes + event history + source mapping | ~2,000 tokens |
| `FULL` | DETAILED + extended subgraph + all session events in surrounding time window | ~8,000 tokens |

---

## Node Lifecycle States

| State | Meaning |
|-------|---------|
| `DISCOVERED` | Plugin detected the node; may not yet be active |
| `ACTIVE` | Node is operating (request in-flight, component mounted) |
| `COMPLETED` | Node completed work successfully |
| `FAILED` | Node terminated in error state |
| `DESTROYED` | Node no longer exists in the runtime |
| `ARCHIVED` | Data retained for historical query; no longer live |

---

## Subsystem RFC Index

| Subsystem | RFC |
|-----------|-----|
| Platform Philosophy | [RFC-0000](rfcs/0000-philosophy.md) |
| Glossary (canonical) | [RFC-0001](rfcs/0001-glossary.md) |
| Vision | [RFC-0002](rfcs/0002-vision.md) |
| Runtime Object Model (ROM) | [RFC-0003](rfcs/0003-runtime-object-model.md) |
| Runtime Event Model (REM) | [RFC-0004](rfcs/0004-runtime-event-model.md) |
| Runtime Graph | [RFC-0005](rfcs/0005-runtime-graph.md) |
| Projection Engine | [RFC-0006](rfcs/0006-projection-engine.md) |
| Session Model | [RFC-0007](rfcs/0007-session-model.md) |
| Context Engine | [RFC-0008](rfcs/0008-context-engine.md) |
| Plugin SDK | [RFC-0009](rfcs/0009-plugin-sdk.md) |
| Browser Observer | [RFC-0010](rfcs/0010-browser-observer.md) |
| Runtime Explorer | [RFC-0011](rfcs/0011-runtime-explorer.md) |
| AI Context API | [RFC-0012](rfcs/0012-ai-context-api.md) |
