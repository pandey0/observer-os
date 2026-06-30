# RFC-0001: Observer Glossary — The Language of Runtime Intelligence

| Field     | Value                                                |
|-----------|------------------------------------------------------|
| RFC       | 0001                                                 |
| Status    | Draft                                                |
| Version   | 0.1                                                  |
| Category  | Foundation                                           |
| Replaces  | —                                                    |

---

## Abstract

Every successful platform creates a language. Git gave developers *commits*, *branches*, and *merges*. Docker gave them *images*, *containers*, and *volumes*. Kubernetes gave them *pods*, *services*, and *deployments*. These words are not just labels. They are load-bearing mental models that shape how engineers think, how APIs are designed, how documentation is written, and how communities form around a platform.

Observer introduces a new domain: **Runtime Intelligence**. This domain has no established vocabulary. Existing terms — logs, events, traces, spans, sessions, contexts — arrive from adjacent fields with pre-existing associations and overloaded meanings. Using them without precision produces ambiguous architecture and confusing documentation.

This document defines the official vocabulary of Observer. Every RFC, API surface, SDK interface, UI component, and engineering discussion must use the terminology defined here. No RFC may introduce new core terminology without first amending this document.

This is the dictionary of Runtime Intelligence.

---

## Motivation

Language is architecture.

When the words a team uses are imprecise, the system they build reflects that imprecision. A team that says "context" when it means "session" will build a system that confuses the two. A team that says "event" when it means "observation" will conflate immutable facts with mutable interpretations.

Observer introduces a new mental model. That model requires new language. This document defines it precisely, so that 50 engineers hired tomorrow can reason about Observer correctly from day one.

---

## Goals

1. Define unambiguous terms for every core concept in Observer.
2. Establish the canonical mental model: **Workspace → Domains → Runtime Graph → Sessions → Runtime Intelligence**.
3. Prevent semantic drift across RFCs, code, and documentation.
4. Identify and resolve terminology conflicts before any code is written.

## Non-Goals

1. Defining implementation details (those belong in subsystem RFCs).
2. Defining API schemas (those belong in RFC-0002 and beyond).
3. Covering every possible future term (the glossary is extended by amendment, not speculation).

---

## Design

### The Mental Model

Observer's core concepts form a coherent hierarchy. Understanding the whole model requires understanding how each term relates to the others.

```
┌─────────────────────────────────────────────────────────────┐
│                         Workspace                           │
│  A software project under observation                       │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │    Domain    │  │    Domain    │  │      Domain      │  │
│  │  (Browser)   │  │   (Node.js)  │  │  (PostgreSQL)    │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                    │            │
│  ┌──────▼─────────────────▼────────────────────▼─────────┐  │
│  │                    Runtime Graph                       │  │
│  │                                                        │  │
│  │   [Node] ──TRIGGERED──► [Node] ──CALLED──► [Node]     │  │
│  │     │                                         │       │  │
│  │   UPDATED                                  RETURNED   │  │
│  │     ▼                                         ▼       │  │
│  │   [Node]                                   [Node]     │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                       Session                          │  │
│  │                                                        │  │
│  │  Events · Snapshots · Timeline · Context               │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

Reading bottom-up: a **Session** captures **Events** and **Snapshots** from the **Runtime Graph**, which is built from **Runtime Nodes** grouped into **Domains**, all within a **Workspace**. **Runtime Intelligence** is what Observer derives from this structure.

---

## The Glossary

Terms are grouped by layer, from broadest to most specific.

---

### Workspace

**Definition**: A software project currently being observed by Observer.

A Workspace is the top-level organizational unit. It groups all Domains, Sessions, and Runtime Graphs belonging to a single application or service. A Workspace exists independently of any IDE, editor, or AI assistant.

**Key properties**:
- Contains one or more Domains
- Persists across Sessions
- Is identified by the project root on the filesystem

**Examples**:
- A React + Node.js web application
- A FastAPI backend service
- A Go microservice with a PostgreSQL database
- A Next.js monorepo

**What it is NOT**: A Workspace is not an IDE project, not a Git repository (though they often correspond), and not a running process.

---

### Runtime

**Definition**: The complete executing state of a software application at a point in time.

The Runtime is the totality of everything running. It includes every Domain, every active Node, every in-flight Event, and every active Session. The Runtime is not a log, not a trace, and not a snapshot — it is the living system.

**Key properties**:
- Exists only while software is executing
- Spans all Domains within a Workspace
- Is represented structurally through the Runtime Graph

**Runtime vs. "runtime" (general CS)**: In general computer science, "runtime" means "the period when a program is executing" (as opposed to compile time). In Observer, **Runtime** (capitalized) means the *full observable state* of executing software — a richer, structured concept. Context will usually distinguish the two; when ambiguity exists, write "Observer Runtime" for the Observer-specific concept.

---

### Domain

**Definition**: A distinct runtime ecosystem that Observer can observe.

A Domain corresponds to one technology layer or environment. It is the boundary within which a specific type of Runtime Node is produced. Domains are exposed by **Observers** (plugins).

**Key properties**:
- Contains one or more Runtime Nodes
- Has exactly one Observer plugin responsible for it
- May depend on or communicate with other Domains

**Examples**:

| Domain | What it observes |
|--------|-----------------|
| Browser Domain | DOM, fetch requests, console, cookies, storage |
| React Domain | Component tree, props, state, hooks |
| Node.js Domain | HTTP requests, process events, module calls |
| FastAPI Domain | Routes, middleware, request/response cycles |
| PostgreSQL Domain | Queries, transactions, connections |
| Redis Domain | Commands, keys, TTLs, pub/sub |
| Docker Domain | Containers, images, volumes, networks |
| Terminal Domain | Processes, stdin/stdout, exit codes |

**Domain vs. Runtime**: The Runtime spans all Domains. A Domain is one slice of the Runtime.

---

### Observer *(plugin type)*

**Definition**: A plugin responsible for exposing Runtime Nodes from one Domain.

An Observer connects a specific Domain to the Observer platform. It performs instrumentation, captures Runtime Events, normalizes them into Runtime Nodes conforming to the Runtime Object Model, and emits them into the active Session.

**Key properties**:
- Implements the Observer Plugin SDK
- Has a 1:1 relationship with its Domain
- Is developed and distributed independently
- Does not alter the runtime it observes

**Examples**:
- Browser Observer
- React Observer
- FastAPI Observer
- Redis Observer
- Docker Observer

> **Naming note**: The term "Observer" is overloaded — it refers to both the platform (Observer OS) and to individual plugins. See the [Terminology Conflicts](#terminology-conflicts) section for the resolution strategy.

---

### Runtime Node

**Definition**: The smallest individually addressable unit of observable runtime state.

Every object within the Runtime is represented as a Runtime Node. Nodes are typed, structured, and addressable by a stable identifier. They are the atoms of the Runtime Object Model.

**Key properties**:
- Has a unique identifier within a Session
- Has a defined type (from the ROM type taxonomy)
- May have Relationships to other Nodes
- Has a lifecycle (created, active, completed, failed, destroyed)
- Carries structured data defined by its type

**Examples**:

| Node Type | What it represents |
|-----------|-------------------|
| `HttpRequest` | A single HTTP request/response cycle |
| `ConsoleMessage` | One browser or server console output |
| `ReactComponent` | A mounted React component instance |
| `DatabaseQuery` | A single SQL query execution |
| `Cookie` | A browser cookie |
| `Route` | A matched backend route |
| `ReactHook` | A React hook invocation |
| `TerminalProcess` | A running terminal process |
| `Container` | A Docker container instance |
| `Transaction` | A database transaction |

**Runtime Node vs. Runtime Event**: A Node represents *state* — something that exists or existed. An Event represents *change* — something that happened. A Node may be created by an Event, updated by Events, and destroyed by an Event.

---

### Runtime Event

**Definition**: An immutable record of a change that occurred within the Runtime.

Runtime Events are the atomic facts that Observer collects. They are immutable — once recorded, they do not change. They carry a timestamp, a type, a reference to the affected Runtime Node, and a structured payload.

**Key properties**:
- Immutable after creation
- Timestamped to the originating runtime clock
- Typed according to the Runtime Event taxonomy
- Associated with one or more Runtime Nodes
- Ordered within a Session Timeline

**Examples**:

| Event Type | What it records |
|------------|----------------|
| `ButtonClicked` | A user interaction in the browser |
| `RequestStarted` | An HTTP request initiated |
| `RequestCompleted` | An HTTP response received |
| `ComponentRendered` | A React component completed a render |
| `ExceptionThrown` | An error was raised |
| `StateUpdated` | Application state changed |
| `QueryExecuted` | A database query ran to completion |
| `WorkerStarted` | A background worker process began |

**Runtime Event vs. log entry**: A log entry is a string written by a developer to describe something that happened. A Runtime Event is a structured, typed, machine-readable record of a fact. Observer always prefers Runtime Events over log entries.

---

### Runtime Graph

**Definition**: The complete directed graph representing all Runtime Nodes and their Relationships within a Workspace.

The Runtime Graph is Observer's primary structural model. It captures not just what exists in the Runtime, but how things are connected — causally, compositionally, and temporally.

**Key properties**:
- Nodes are Runtime Nodes
- Edges are Relationships (typed and directional)
- Grows as Events are processed
- Queryable by node type, relationship type, or traversal

**Example graph fragment**:

```
[ButtonClicked: "Submit Order"]
          │
     TRIGGERED
          │
          ▼
[HttpRequest: POST /api/orders]
          │
         CALLED
          │
          ▼
[Route: OrderController.create]
          │
       EXECUTED
          │
          ▼
[DatabaseQuery: INSERT INTO orders]
          │
       RETURNED
          │
          ▼
[HttpResponse: 201 Created]
          │
      UPDATED
          │
          ▼
[ReactComponent: OrderConfirmation]
```

This graph encodes not just *what* happened but *why* — the full causal chain from user action to rendered UI.

**Runtime Graph vs. trace**: A distributed trace records timing spans across services. The Runtime Graph records typed, structured nodes and their semantic relationships across all Domains. A trace is a subset of what the Runtime Graph can express.

---

### Relationship

**Definition**: A directional, typed connection between two Runtime Nodes.

Relationships are the edges of the Runtime Graph. They express causality, composition, dependency, and temporal succession. Every Relationship has a source Node, a target Node, and a type.

**Standard Relationship Types**:

| Type | Meaning |
|------|---------|
| `TRIGGERED` | Source Node caused Target Node to begin |
| `CALLED` | Source Node invoked Target Node |
| `UPDATED` | Source Node modified state represented by Target Node |
| `FAILED` | Source Node caused Target Node to fail |
| `RETURNED` | Source Node produced the result held in Target Node |
| `RENDERED` | Source Node caused Target Node to be displayed |
| `CREATED` | Source Node caused Target Node to come into existence |
| `DESTROYED` | Source Node caused Target Node to cease to exist |
| `DEPENDS_ON` | Source Node requires Target Node to function |
| `USES` | Source Node reads from Target Node |
| `OBSERVES` | An Observer Node monitors a Target Node |

**Key properties**:
- Directional: `A → B` is not the same as `B → A`
- Typed: the type determines the semantic meaning
- Queryable: traversal queries can follow Relationship types
- Immutable once recorded (the graph grows; edges are not deleted)

---

### Capability

**Definition**: An operation that can be performed on a Runtime Node.

Capabilities define what Observer can *do* with a Node, beyond simply displaying it. They are exposed by the plugin that owns the Domain and by the Observer platform itself.

**Standard Capabilities**:

| Capability | Description |
|------------|-------------|
| `Watch` | Subscribe to live updates as the Node changes |
| `Snapshot` | Capture an immutable point-in-time copy |
| `Diff` | Compare two Snapshots of the same Node |
| `Expand` | Reveal child Nodes or related Nodes |
| `Inspect` | View full structured detail |
| `Replay` | Re-execute the sequence of Events that produced this Node |
| `Timeline` | View the chronological Event history of this Node |
| `Search` | Query across Nodes of this type |

Not all Capabilities are available on all Node types. Plugins declare which Capabilities they support.

---

### Snapshot

**Definition**: An immutable, point-in-time representation of a Runtime Node or Runtime Graph.

A Snapshot captures the complete state of a Node (or the full Graph) at a specific moment. Because Snapshots are immutable, they can be compared, stored, shared, and used for replay.

**Key properties**:
- Immutable after creation
- Associated with a timestamp
- Scoped to a Session
- May represent a single Node or the full Graph
- Foundation for Diff operations

**Snapshot vs. Runtime Node**: A Runtime Node is a live, mutable entity. A Snapshot is a frozen copy of a Node at one moment.

---

### Diff

**Definition**: The semantic difference between two Snapshots.

A Diff expresses what changed between one point in time and another. It operates on structured Runtime Nodes, not on raw text or logs. Two Snapshots of the same React component reveal which props changed, which state values changed, and which child components were added or removed.

**Key properties**:
- Requires two Snapshots of comparable structure
- Produces a typed, structured change set
- Human-readable and machine-readable
- Never diffs raw log output

---

### Timeline

**Definition**: A chronological representation of Runtime Events associated with a Node or Session.

A Timeline orders Events along a time axis. It is a derived view — generated from the immutable Event record — designed for human comprehension of runtime behavior over time. Timelines are the primary temporal navigation tool in the Runtime Explorer.

**Key properties**:
- Derived from Events (not stored separately)
- Chronologically ordered
- Scoped to a Node, a Domain, or a full Session
- Designed for human navigation

**Timeline vs. log stream**: A log stream is an unbounded sequence of text lines. A Timeline is a bounded, structured, typed sequence of Events within a Session. A Timeline has a beginning, an end, and semantic structure.

---

### Session

**Definition**: A bounded, intentional unit of runtime investigation.

A Session is the organizing container for all runtime data collected during one investigation. Every Runtime Event, Snapshot, Timeline, and Context produced during an investigation belongs to one Session. Sessions are first-class objects in Observer — they can be named, saved, shared, and compared.

**Key properties**:
- Has a defined start and end
- Scoped to one Workspace
- Contains Events, Snapshots, Timelines, and Context
- Identified by a stable Session ID
- Can be replayed or compared with other Sessions

**What demarcates a Session**: Sessions can be started and stopped explicitly by the developer, triggered automatically by test runs, or defined by heuristics (e.g., "a new Session begins when the dev server restarts"). Session lifecycle is defined in RFC-0005.

**Session vs. user session**: In web development, a "session" typically means an authenticated user's browser session (tracked by a cookie or token). In Observer, a **Session** means a developer investigation. These are different concepts at different layers. When ambiguity exists, "Observer Session" vs. "user session" disambiguates.

---

### Context

**Definition**: The relevant subset of Runtime information required to answer a specific question.

Context is the output of Observer's Context Engine. It is not the complete Runtime — it is a curated, structured package assembled around a specific anchor: an error, an Event, a Node, or a time range. Context is designed to be consumed: by AI assistants, by human developers, by automated tools.

**Key properties**:
- Always scoped (never the full Runtime)
- Produced by the Context Engine in response to a query or event
- Structured and typed
- Format-agnostic (can be rendered as Markdown, JSON, or structured objects)
- Contains references to source Nodes, Events, and Relationships

**Context vs. logs**: Logs are unstructured, high-volume, flat. Context is structured, curated, relationship-aware. An AI assistant receiving Context knows *what* broke, *what called it*, *what state it was in*, and *where in the source code to look*.

---

### Observation

**Definition**: Structured runtime evidence collected during a Session.

Observations are facts recorded by Observer. They do not contain interpretation, reasoning, or recommendations — those belong to the AI Consumer layer. An Observation might be "the HTTP request to `/api/orders` returned a 500 status code with this response body." What that *means* and what to *do* about it is not Observer's responsibility.

**Key properties**:
- Factual, not interpretive
- Derived from Runtime Events and Nodes
- Immutable
- Attributed to a specific Session and timestamp

**Observation vs. Event**: An Event is the raw atomic record of a change. An Observation is a potentially composed, structured fact derived from one or more Events — possibly with additional enrichment (source mapping, relationship context) applied.

---

### Discovery

**Definition**: The process of automatically identifying and connecting to Runtime Domains within a Workspace.

Discovery is how Observer reduces configuration burden. When a developer opens a Workspace, Observer attempts to identify which Domains are present — which framework is running, which database is connected, which browser tab belongs to this application — without requiring explicit configuration.

**Key properties**:
- Runs automatically when a Workspace is opened or a Session is started
- Produces a list of candidate Domains and their corresponding Observers
- Configuration can override Discovery results
- Discovery failures are surfaced explicitly — they never fail silently

**Discovery vs. configuration**: Discovery is the default. Configuration is the override. Both produce the same result: a set of connected Domains.

---

### Runtime Intelligence

**Definition**: The product of transforming raw Runtime data into structured understanding.

Runtime Intelligence is what Observer produces. It encompasses Context, Timelines, Diffs, Relationship graphs, and Sessions — the full set of structured, derived artifacts that make running software understandable to humans and machines.

**Runtime Intelligence explicitly excludes**: AI reasoning, natural language interpretation, suggestions, and recommendations. Those are produced by **AI Consumers** using Runtime Intelligence as input.

**Runtime Intelligence = structured input to reasoning. Not the reasoning itself.**

---

### AI Consumer

**Definition**: Any external system that consumes Runtime Intelligence produced by Observer.

Observer is AI-agnostic. Any system capable of querying Observer's APIs and processing its output is an AI Consumer. Observer has no coupling to any specific AI Consumer.

**Examples**:
- Claude (Anthropic)
- ChatGPT (OpenAI)
- Gemini (Google)
- Cursor
- GitHub Copilot
- Custom agents and scripts

**AI Consumer vs. Observer**: Observer produces. AI Consumers consume. This distinction is architectural and permanent.

---

### Runtime Explorer

**Definition**: The primary user interface for navigating and understanding the Runtime.

The Runtime Explorer is the visual surface of Observer. It presents the Runtime Graph, Sessions, Timelines, and Context in a form navigable by human developers. It does not expose raw logs — it exposes structured Runtime Nodes.

The Runtime Explorer is a consumer of Observer's internal APIs, subject to the same interface contracts as any external AI Consumer.

---

## Term Relationships

```
Workspace
    │
    ├── contains 1+ Domains
    │       └── each Domain is exposed by one Observer (plugin)
    │
    └── has one Runtime Graph
            │
            ├── nodes: Runtime Nodes
            │       └── lifecycle driven by Runtime Events
            │       └── addressable by stable ID
            │       └── connected via Relationships
            │
            └── produces Sessions
                    │
                    ├── Events (immutable facts)
                    ├── Snapshots (point-in-time copies)
                    ├── Timeline (chronological view of Events)
                    └── Context (curated subset for a question)
                            │
                            └── consumed by AI Consumers
```

---

## Terminology Conflicts

The following terms carry risk of overloading or confusion. This section documents the decision made for each.

---

### `Observer` — Platform vs. Plugin

**Problem**: The word "Observer" refers to both the product (Observer OS) and a specific plugin type that implements the Observer interface.

Saying "the Browser Observer connects to Observer" is awkward. Saying "write an Observer for your Observer Domain" is confusing.

**Options considered**:

| Plugin name | Assessment |
|-------------|-----------|
| Observer | Current — ambiguous |
| Connector | Generic, no domain association |
| Sensor | Good — implies passive collection, not mutation |
| Probe | Good — implies deep, targeted instrumentation |
| Lens | Good — implies observation without alteration |
| Adapter | Too engineering-pattern-flavored |
| Tap | Good — implies passive tap on a data flow |
| Agent | Overloaded in AI context (2024+) |

**Recommendation**: Rename the plugin type from "Observer" to **Probe** or **Sensor**.

- *"The Browser Probe collects DOM events."*
- *"Write a Probe for your Redis Domain."*
- *"Observer uses Probes to instrument each Domain."*

This cleanly separates the platform name from the plugin type. **Decision is open** — requires explicit acceptance before RFC-0007 (Plugin SDK) is written.

---

### `Runtime` — General CS vs. Observer Concept

**Problem**: "Runtime" is a widely used term in computer science meaning "the period during which a program executes." In Observer, Runtime means something richer: the complete, structured, observable state of executing software.

**Resolution**: Capitalize **Runtime** when referring to the Observer concept. Use lowercase "runtime" for the general CS meaning. Prefer "Observer Runtime" when context is ambiguous. Document this convention in all RFC introductions.

---

### `Context` — General vs. Observer-Specific

**Problem**: "Context" is one of the most overloaded words in software engineering. It appears in: React Context, execution context, security context, request context, database connection context, goroutine context (Go), and conversational context (AI).

**Resolution**: In Observer documentation, **Context** (capitalized) always refers to the Observer concept: a curated, structured package of Runtime Intelligence assembled for a specific question. In code, the type name `RuntimeContext` or `ObserverContext` should be used in any environment where the word "context" already has an established meaning (Go, React, etc.).

---

### `Session` — Developer Investigation vs. User Session

**Problem**: "Session" in web development almost always means an authenticated user's browser session, tracked by a token or cookie. Developers joining Observer will carry this association.

**Resolution**: In Observer, **Session** always means a *developer investigation session* — a bounded container for runtime data collection. When discussing web authentication, write "user session" (lowercase) or "auth session." The types in Observer code should be named `InvestigationSession` or `ObserverSession` to avoid collision in codebases where HTTP session types are also present.

---

### `Observation` vs. `Event` vs. `Snapshot`

**Problem**: These three terms are related and easy to conflate.

| Term | Is it immutable? | Contains raw data? | Is it derived? | Unit of |
|------|------------------|--------------------|----------------|---------|
| Runtime Event | Yes | Yes | No | *Change* |
| Snapshot | Yes | Yes | Partially | *State at a moment* |
| Observation | Yes | Partially | Yes | *Structured fact* |

**Resolution**: Maintain the distinction clearly in documentation. An **Event** is the raw signal. A **Snapshot** is a frozen copy of state. An **Observation** is an enriched, structured fact derived from one or more Events, possibly including relationship context, source mapping, and typing applied by the Context Engine.

---

### `Domain` — Observer vs. DDD

**Problem**: "Domain" is heavily associated with Domain-Driven Design (DDD), where it means a bounded business problem space. Observer uses Domain to mean a runtime technology ecosystem (Browser, Node.js, PostgreSQL).

**Resolution**: The two usages are in different contexts (software architecture vs. runtime observation) and unlikely to co-occur in the same sentence without clear framing. The Observer meaning stands. If DDD language appears in future Observer documentation, use "bounded context" (the DDD term) rather than "DDD domain" to avoid collision.

---

## Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | Should the plugin type be renamed from "Observer" to "Probe", "Sensor", or another term? | **Open — must resolve before RFC-0007** |
| 2 | Should "Runtime Node" be shortened to just "Node" in code and APIs, with "Runtime Node" used only in documentation? | Open |
| 3 | Should `RuntimeContext` or `ObserverContext` be the canonical code-level name for Context? | Open |
| 4 | Is "Workspace" the right term, or does it risk confusion with VS Code Workspaces and similar? | Open |
| 5 | Should "Observation" be retained as a distinct term, or collapsed into either "Event" or "Context"? | Open |

---

## Future Work

Terms that will likely need addition as Observer evolves:

- **Replay** — deterministic re-execution of a Session
- **Subscription** — a registered interest in Runtime Events of a specific type
- **Manifest** — the declared capabilities and Node types of an Observer plugin
- **Trigger** — a condition that causes a Context package to be assembled automatically
- **Correlation** — linking Nodes across Domain boundaries (e.g., browser request to backend handler)
- **Annotation** — developer-added notes attached to Nodes, Events, or Sessions

These terms are not yet defined. Do not use them in RFCs until defined here.

---

## References

- RFC-0000: The Observer Philosophy
- RFC-0002: Observer OS — Vision and Product Philosophy
- RFC-0003: Runtime Object Model (ROM)
- RFC-0005: Session Model
- RFC-0006: Context Engine
- RFC-0007: Plugin SDK
