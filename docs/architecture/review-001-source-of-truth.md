# Architecture Review 001: Source of Truth for Observer Runtime

| Field    | Value                                        |
|----------|----------------------------------------------|
| Status   | **DECIDED — Architecture B Adopted**         |
| Authors  | Founding Team                                |
| Blocks   | RFC-0005 (Session Model) and all subsequent RFCs |
| Decision | **Event-Sourced Runtime with Incremental Projection Engine** |

---

## Executive Summary

This review evaluates two competing architectural models for Observer before additional RFCs are written. The decision determines the canonical source of truth for all runtime data and affects every API, plugin interface, storage layer, replay mechanism, and AI integration in the platform.

**The core question:**

> Is the Runtime Graph the source of truth, or are Runtime Events the source of truth — with the Runtime Graph being a derived projection?

**Finding:** Architecture B (Event-Sourced) is the stronger foundation for Observer's long-term goals. Crucially, this is not a redesign. RFC-0003 (Runtime Object Model) already stated: *"RuntimeNodes are mutable views of current state. RuntimeEvents are the immutable source of truth. The current state is the materialized view of events."* We were already heading here. This review makes it explicit and resolves the ambiguity before it propagates into five more RFCs.

---

## Background

Observer OS RFCs have established:

1. **RFC-0000**: Runtime as graph. Events as facts. Sessions as investigations.
2. **RFC-0003 (ROM)**: RuntimeNodes are mutable. RuntimeEvents are immutable. "The current state is the materialized view of events." Replay operates on events.
3. **RFC-0004 (REM, in progress)**: Events as foundation for Sessions, Timeline, Replay, Context, AI.

The tension surfaces here: RFC-0003 describes nodes as mutable objects (implying the graph owns state), while simultaneously stating events are the source of truth (implying the graph is derived). Both cannot be primary. One must be canonical.

---

## Architecture A: Graph-Centric Runtime

### Structure

```
┌─────────────────────────────────────────────────────────────┐
│                         Runtime                              │
│           (Browser, Backend, DB, Terminal, etc.)             │
└───────────────────────────┬─────────────────────────────────┘
                            │ Plugin events drive graph mutations
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Runtime Graph                             │
│              (Mutable, authoritative state)                  │
│                                                             │
│   Nodes mutate in place. Graph IS the runtime state.        │
└────┬────────────┬──────────────┬──────────────┬────────────┘
     │            │              │              │
     ▼            ▼              ▼              ▼
 Explorer      Timeline       Context          AI
 (reads        (reads         (reads         (reads
  graph)        graph)         graph)         graph)
```

### How It Works

- Plugins emit typed events
- Events immediately mutate Runtime Nodes in the graph
- The graph reflects current live state at all times
- Timeline is built by reading node history (tracked on the node)
- Replay requires snapshotting graph state at intervals
- Context is assembled by traversing live graph

### Advantages

| Advantage | Detail |
|-----------|--------|
| **Simple read model** | Consumers query the graph directly. No projection step. |
| **Low read latency** | Graph is pre-built. Queries return immediately. |
| **Familiar pattern** | Graph databases, property graphs — well-understood. |
| **Lower initial complexity** | One data structure; consumers read it directly. |
| **Simpler plugin contract** | Plugins fire events; platform updates graph; done. |

### Disadvantages

| Disadvantage | Detail |
|--------------|--------|
| **Replay requires snapshots** | Can't replay from scratch. Must snapshot graph state at intervals and replay events between snapshots. Significant implementation complexity. |
| **Loss = unrecoverable** | If the in-memory graph is lost (crash, restart), no deterministic way to reconstruct it without a recent snapshot. |
| **Time travel is hard** | "What was the graph state at T-5 minutes?" requires replaying from the nearest snapshot. Approximate, not exact. |
| **Historical queries are expensive** | Any historical view requires snapshot + replay machinery. |
| **Testing is hard** | Tests must construct graph state directly. Mutable shared state is notoriously difficult to test in isolation. |
| **Distributed inconsistency** | Sharing graph state across machines requires synchronizing mutable objects. Hard consistency problem. |
| **Multiple consumers diverge** | AI Consumer and Runtime Explorer may want different views. Both read the same mutable graph, creating coupling. |
| **Schema migration is destructive** | Changing a node's field structure requires migrating live graph state. |

### Implementation Complexity

```
MEDIUM-HIGH

Core: Graph data structure + mutation engine
      (~manageable)

Replay: Snapshot engine + incremental replay
        (~significant complexity)

History: Snapshot retrieval + partial replay
         (~significant complexity)

Time travel: Not practically achievable without
             massive snapshot overhead
             (~very hard)
```

---

## Architecture B: Event-Sourced Runtime

### Structure

```
┌─────────────────────────────────────────────────────────────┐
│                         Runtime                              │
│           (Browser, Backend, DB, Terminal, etc.)             │
└───────────────────────────┬─────────────────────────────────┘
                            │ Plugins emit typed events
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Event Log                                 │
│              (Immutable, append-only)                        │
│                                                             │
│   Events are never mutated. This is the source of truth.    │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  Projection Engine                           │
│         (Processes events → builds derived views)            │
│                                                             │
│   Each projection is a different lens on the same events.   │
└────┬────────────┬──────────────┬──────────────┬────────────┘
     │            │              │              │
     ▼            ▼              ▼              ▼
 Runtime       Timeline       Context          AI
 Graph         Projection     Projection    Projection
 (live,        (ordered       (scoped,      (structured
  in-memory     event view)    relevant)     package)
  projection)
```

### How It Works

- Plugins emit typed events to the Event Log (append-only)
- The Projection Engine consumes events and maintains derived views
- The Runtime Graph is a continuously-updated, in-memory projection of the event log
- Timeline is the event log filtered and ordered for a specific scope
- Context is assembled from a subgraph projection anchored on a specific event
- Replay is trivial: re-apply the event log to a fresh projection engine
- AI consumers receive structured projections, not raw events

### Advantages

| Advantage | Detail |
|-----------|--------|
| **True source of truth** | Events are the only facts. All views are derived. No ambiguity about what is canonical. |
| **Replay is trivial** | Replay = re-apply event log from any point. Deterministic. No snapshot machinery required. |
| **Time travel is exact** | Project the graph at any timestamp by replaying events up to that point. |
| **Loss is recoverable** | If the graph projection is lost, rebuild it by replaying the event log. |
| **Multiple independent projections** | AI Consumer, Runtime Explorer, and Context Engine can each maintain their own projection optimized for their needs. No coupling. |
| **Testing is straightforward** | Tests emit a sequence of events and assert on the resulting projection. Deterministic input → deterministic output. |
| **Schema evolution is possible** | Old events can be "upcasted" (transformed to new format) at projection time without modifying the event log. |
| **Distributed-first** | Events are naturally synchronizable across instances. The Event Log can be shared; projections are rebuilt locally. |
| **Sessions are native** | A Session is literally a bounded slice of the event log. Not a wrapper — it IS the events. |
| **History is free** | Historical queries are projections at a past timestamp. No extra work to support them. |
| **Audit trail** | Complete record of everything that happened. Immutable, verifiable. |

### Disadvantages

| Disadvantage | Detail |
|--------------|--------|
| **Projection Engine complexity** | A Projection Engine is a new architectural component that doesn't exist in Architecture A. It must be correct, fast, and handle event ordering. |
| **Projection latency** | For live debugging, the graph projection must stay current with near-zero lag. The Projection Engine must be incremental, not batch. |
| **Event storage growth** | Events are never deleted (append-only). Long sessions produce large event logs. Requires storage strategy. |
| **Event schema stability** | Events must be versioned carefully. Once emitted, they can't be changed. Upcasting infrastructure is required for schema evolution. |
| **Learning curve** | Event sourcing is less familiar than mutable graph patterns for many engineers. |
| **Projection bootstrapping** | When Observer starts mid-session, the Projection Engine must replay past events before the graph is current. |

### Implementation Complexity

```
MEDIUM (different kind of complexity than Architecture A)

Core: Event log + incremental Projection Engine
      (~comparable to Architecture A's graph mutation engine)

Replay: Re-apply event log from any point.
        No snapshot machinery needed.
        (~significantly simpler than Architecture A)

History: Project up to any timestamp.
         (~significantly simpler than Architecture A)

Time travel: Exact and native.
             (~dramatically simpler than Architecture A)

Upside: The hard part (Projection Engine) is
        concentrated in one place. Everything else gets simpler.
```

---

## Questions Evaluated

### Can the Runtime Graph always be reconstructed from Runtime Events?

**Yes — if Architecture B is adopted as designed.**

For this to be true, every mutation to the Runtime Graph must correspond to one or more Runtime Events. No silent mutations. No side channels. This is a plugin contract requirement: plugins may only change graph state by emitting events. The Projection Engine is the only writer to the graph.

In Architecture A, this is a design goal but not enforced. In Architecture B, it is enforced structurally — the graph cannot be written to directly.

---

### Should Runtime Events be immutable?

**Yes, unconditionally.**

Both architectures agree on this point. Events are facts about the past. A fact cannot be changed without falsifying history. Immutable events enable:
- Deterministic replay
- Trustworthy audit trails
- Safe concurrent reads
- Append-only storage optimization

If an event was emitted incorrectly, a corrective event is appended. The original remains.

---

### Should the Runtime Graph become disposable?

**Yes — in Architecture B.**

If the event log is the source of truth, the Runtime Graph is a derived artifact. It can always be rebuilt. This has profound implications:
- Crashes are recoverable without data loss
- Memory pressure? Drop the graph, rebuild from events
- New graph query algorithm? Rebuild the projection with the new algorithm against the existing event log
- Bug in the Projection Engine? Fix it, rebuild the graph, result is correct

"Disposable" does not mean "unimportant." It means "derived, not primary."

---

### Should Timelines be projections?

**Yes.**

A Timeline is the event log filtered, ordered, and scoped to a node, domain, or session. It is not a separate data structure — it is a view over the event log. In Architecture B, Timeline generation becomes:

```
timeline(scope) = events
  .filter(e => e.affects(scope))
  .sortBy(e => e.occurredAt)
```

No separate Timeline storage required.

---

### Should Context be a projection?

**Yes.**

Context is a curated subgraph assembled for a specific question. In Architecture B, the Context Engine:
1. Identifies the anchor event (an error, a node, a time range)
2. Traverses the graph projection to find related nodes
3. Retrieves the events that produced those nodes
4. Assembles them into a structured context package

Context is ephemeral. It is computed on demand from the event log and graph projection. It does not need to be stored — it can always be recomputed.

---

### Should AI Consumers receive projections or raw events?

**Projections.**

Raw events require the AI to perform the same projection work Observer already does. AI Consumers should receive structured context packages — the output of the Context Engine — which are projections assembled specifically for machine consumption.

However, AI Consumers with special needs (e.g., an agent building its own timeline) should be able to request the raw event stream for a bounded scope (a Session, a Node, a time range). Raw event access is a capability, not the default.

---

### How would replay work?

**Architecture A**: Replay requires a snapshot of the graph state at the start of the replay window, plus the events that occurred after. Both must be stored and kept synchronized. Rebuilding from a snapshot is approximate — the snapshot may have been taken mid-mutation.

**Architecture B**: Replay is:

```
replay(session, fromTimestamp) =
  Projection Engine(events.filter(session).filter(t >= fromTimestamp))
```

Deterministic. Exact. No snapshot infrastructure required for basic replay. Snapshots are a performance optimization (skip replaying the first N events), not a correctness requirement.

---

### Would Event Sourcing simplify architecture?

**Yes, substantially — but it moves complexity, not eliminates it.**

The complexity shifts from:
- **Architecture A**: Distributed, implicit (replay machinery, snapshot scheduling, history queries, mutation tracking)
- **Architecture B**: Concentrated, explicit (Projection Engine must be correct, fast, and handle ordering)

Architecture B's complexity is easier to test, easier to reason about, and easier to evolve because it is centralized. A bug in the Projection Engine affects all views predictably. A bug in Architecture A's graph mutation logic can silently corrupt state in ways that only manifest during replay or historical queries.

---

### Would CQRS concepts apply?

**Yes, directly.**

CQRS (Command Query Responsibility Segregation) separates write operations (commands that produce events) from read operations (queries against projections):

```
                  WRITE SIDE
Plugin emits event (command) → Event Log

                  READ SIDE
Consumer queries projection (query) → Projection (Graph, Timeline, Context)
```

Observer's plugin SDK becomes the command side. All queries (from Runtime Explorer, AI Consumers, Context Engine) go to the read side. This separation allows:
- Read and write sides to scale independently
- Different projections optimized for different query patterns
- Write side to remain simple (append events)

---

### How would distributed runtimes behave?

**Architecture A**: Sharing a mutable graph across machines is a distributed consistency problem. Every mutation requires synchronization. Last-write-wins semantics corrupt data. Vector clocks or CRDTs are required — extremely high complexity.

**Architecture B**: Each Observer instance maintains its local event log and projection. Sharing is event log synchronization — each instance sends its events; the other replays them. Event logs are naturally mergeable (append-only, timestamped). Projections are rebuilt locally. This is how Git branches merge.

---

## Comparison Matrix

| Dimension | Architecture A (Graph-Centric) | Architecture B (Event-Sourced) |
|-----------|-------------------------------|-------------------------------|
| **Source of truth** | Runtime Graph (mutable) | Event Log (immutable) |
| **Complexity** | Distributed across mutation sites | Concentrated in Projection Engine |
| **Read performance** | Low latency (graph is live) | Low latency (incremental projection is live) |
| **Write performance** | Low latency (direct mutation) | Low latency (append + project) |
| **Memory** | Graph only | Events + projections (higher, but bounded by session) |
| **Replay** | Complex (snapshot + partial replay) | Trivial (re-apply event log) |
| **Time travel** | Approximate (nearest snapshot) | Exact (project to any timestamp) |
| **Crash recovery** | Requires recent snapshot | Full recovery from event log |
| **Testing** | Hard (mutable state) | Straightforward (deterministic events → deterministic projection) |
| **Debugging the platform** | Hard (mutation source unclear) | Easy (trace any state to the event that produced it) |
| **Scalability** | Limited by mutable graph size | Events scale linearly; projections can be pruned |
| **Plugin ecosystem** | Plugins mutate graph (coupling) | Plugins only emit events (decoupled) |
| **Schema evolution** | Destructive migration | Non-destructive upcasting |
| **Cloud sync** | Mutable state sync (hard) | Event log sync (easy) |
| **AI consumption** | Query live graph (projections must be built by AI) | Receive structured projections (purpose-built) |
| **Developer experience** | Familiar graph model | Requires understanding projections |
| **Maintainability** | Mutation logic scattered | Projection logic centralized |
| **Open source contributions** | Contributors must understand full graph state | Contributors add event types and projections independently |
| **Distributed runtime** | Requires distributed consensus | Natural (event log merge) |

**Architecture B wins on 12 of 17 dimensions.** Architecture A wins only on initial developer familiarity.

---

## Comparison with Analogous Systems

| System | Architecture | Lesson for Observer |
|--------|-------------|---------------------|
| **Git** | Immutable commits (events) → working tree (projection) | Branching, time travel, and merging are native because events are primary. Observer needs the same superpowers. |
| **Kafka** | Immutable event log → consumer-built projections | Kafka proved that append-only event logs scale to any throughput. Consumers build exactly the view they need. |
| **Redux** | Immutable actions (events) → reducer (projection engine) → state (projection) | Architecture B is Redux for runtime intelligence. Every frontend developer already understands this model. |
| **Chrome DevTools Protocol** | Browser emits typed events → DevTools builds its views | CDP is Architecture B. The browser doesn't know how DevTools visualizes events. |
| **OpenTelemetry** | Spans/traces are events → analysis tools build projections | OTel's success is partly because events are the contract; backends decide how to project them. |
| **Kubernetes** | etcd stores desired state (Architecture A-ish) → controllers reconcile | Kubernetes chose mutable state for desired spec but uses event-watch for controllers. Note: K8s's hardest problems (watch events, cache sync, informer lag) are all projection problems. |
| **Event Sourcing (DDD)** | Domain events → aggregate projections | Observer is applying this pattern to runtime intelligence rather than business domains. The pattern fits perfectly. |

---

## Risks

### Architecture A Risks

| Risk | Severity | Likelihood |
|------|----------|-----------|
| Replay feature is never fully correct due to snapshot approximation | High | High |
| Historical queries require disproportionate engineering | High | High |
| Graph corruption during crash is unrecoverable | High | Medium |
| Plugin bugs silently corrupt graph state | Medium | High |
| Distributed session sharing is intractable | High | High |
| Schema migration requires downtime or complex migration tooling | Medium | Medium |

### Architecture B Risks

| Risk | Severity | Likelihood |
|------|----------|-----------|
| Projection Engine becomes a bottleneck at high event volumes | High | Low (incremental projection, not batch) |
| Event ordering issues in distributed environments create incorrect projections | Medium | Medium |
| Event log grows without bound (storage cost) | Medium | Medium (bounded by session; log rotation is standard) |
| Event schema locked too early, upcasting becomes complex | Medium | Low (schema versioning from day one) |
| Projection bootstrapping latency when Observer starts mid-session | Low | Medium |
| Team unfamiliar with event sourcing patterns | Low | Low |

**Architecture B's risks are lower severity, more predictable, and have known mitigations.** Architecture A's risks compound over time and become harder to address as the codebase grows.

---

## Recommended Architecture

**Architecture B: Event-Sourced Runtime, with Incremental In-Memory Projection**

### Refined Model

```
┌──────────────────────────────────────────────────────────────────┐
│                           Runtime                                │
└──────────────────────────────┬───────────────────────────────────┘
                               │
               Plugins emit typed, versioned RuntimeEvents
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                         Event Log                                │
│                (Append-only · Immutable · Durable)               │
│                                                                  │
│  Every event has: id · type · occurredAt · recordedAt ·         │
│                   sourceNode · causedBy · payload · session      │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                    Events streamed to Projection Engine
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Projection Engine                            │
│         (Incremental · In-memory primary · Event-driven)         │
│                                                                  │
│  Processes events as they arrive.                                │
│  Maintains all live projections in memory.                       │
│  Rebuilds any projection from event log on demand.               │
└──────┬──────────────┬────────────────┬──────────────┬───────────┘
       │              │                │              │
       ▼              ▼                ▼              ▼
┌──────────┐   ┌──────────┐   ┌──────────────┐  ┌──────────┐
│ Runtime  │   │ Timeline │   │   Context    │  │   AI     │
│  Graph   │   │  View    │   │  Projection  │  │ Context  │
│(live,    │   │(ordered  │   │(on-demand,   │  │  API     │
│ in-mem)  │   │ events)  │   │ scoped)      │  │          │
└──────────┘   └──────────┘   └──────────────┘  └──────────┘
       │
       ▼
Runtime Explorer (reads Runtime Graph projection)
```

### Key Properties of This Design

1. **The Event Log is the only durable store.** All projections are derived from it.
2. **The Runtime Graph is an incremental, in-memory projection.** It is updated with near-zero latency as events arrive — live debugging feels instant.
3. **No snapshot infrastructure is required for core correctness.** Snapshots are a performance optimization (skip replaying early events on startup) implemented later.
4. **Plugins only emit events.** They never write to the graph directly. The Projection Engine is the only writer.
5. **The Projection Engine is the single most critical component.** Its correctness determines the correctness of everything else.

### What Changes in Existing RFCs

| RFC | Change Required |
|-----|----------------|
| **RFC-0003 (ROM)** | Minor clarification: Runtime Graph is explicitly a projection, not the source of truth. Node mutability refers to projection state (updated by events), not independent mutation. |
| **RFC-0004 (REM)** | Already aligned. Events are central by design. Strengthen language: "Events are the source of truth." |
| **RFC-0005 (Runtime Graph)** | Moderate revision: Graph is now formally a projection of the Event Log. Add Projection Engine as a new architectural component. Traversal and query semantics unchanged. |
| **RFC-0006+ (Session, Context, etc.)** | Simplified: Sessions are slices of the event log. Context is an on-demand projection. Replay is trivial. |

### What Does NOT Change

- Runtime Node types and schemas
- Relationship types
- Plugin event emission interface
- Glossary definitions
- The seven engineering principles (RFC-0000)

---

## Experiments to Validate the Decision

Before fully committing, these experiments would de-risk the choice:

1. **Projection throughput benchmark**: Build a minimal Projection Engine, emit 10,000 events at browser event frequency, measure graph update latency. Target: < 1ms per event for live sessions.

2. **Replay correctness test**: Emit a known sequence of events, capture the resulting graph, clear the graph, replay events, assert graph identity. This validates the "disposable graph" claim.

3. **Cross-domain correlation prototype**: Emit browser request events and backend route events with a shared correlation ID, verify the Projection Engine creates the cross-domain edge. This validates the hardest part of the graph projection.

4. **Event schema evolution test**: Emit v1 events, update the event schema to v2 with an upcast function, re-project, verify the graph is correct. This validates schema evolution safety.

---

## Assumptions

1. Runtime sessions are bounded in time (hours, not days). Event log storage is manageable within session boundaries.
2. The Projection Engine runs in the same process as Observer's core (low inter-process latency).
3. Plugin event emission is synchronous from the plugin's perspective (fire and forget from plugin; buffered if needed).
4. The common case is a single developer on a single machine (distributed concerns are future work).

---

## Open Questions — DECIDED

| # | Question | Decision |
|---|----------|----------|
| 1 | **Projection Engine architecture?** | **Hybrid push+pull.** Live events push incremental updates (~0ms). Cold starts and historical queries pull via event log replay. |
| 2 | **Cross-domain event ordering?** | **Observer-assigned monotonic sequence numbers.** `occurredAt` = plugin clock (timeline display). `sequenceNumber` = Observer global order (projection). Plugins include `correlationId` for cross-domain linking. |
| 3 | **Snapshot strategy?** | **Optional performance optimization only.** Checkpoint every 1000 events or 60s for fast cold starts. Never required for correctness — event replay is always correct. |
| 4 | **Event log pruning?** | **Session-bounded.** Events live for the lifetime of their Session. On Session close: compress and archive. |
| 5 | **Projection Engine its own RFC?** | **Yes — RFC-0006.** It is the most critical new architectural component introduced by the event-sourced decision. |

---

## Recommendation Summary

| Question | Answer |
|----------|--------|
| Which architecture? | **B: Event-Sourced** |
| Does this require rewriting existing RFCs? | No. RFC-0003 needs clarification; RFC-0004 is already aligned |
| Does this add a new architectural component? | Yes: the **Projection Engine** |
| Does this change plugin interfaces? | No. Plugins already emit events |
| Is this a risky pivot? | No. We were already heading here. This makes it explicit |
| Should RFC-0005 be written before this is resolved? | No |
| What must be decided before RFC-0005? | Open Questions 1, 2, and 5 above |

---

## References

- RFC-0000: The Observer Philosophy
- RFC-0001: Observer Glossary
- RFC-0003: Runtime Object Model (ROM)
- RFC-0004: Runtime Event Model (in review)
- Martin Fowler: *Event Sourcing* pattern
- Martin Fowler: *CQRS* pattern
- Greg Young: *Event Sourcing* (foundational paper)
