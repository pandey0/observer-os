# Observer — Founder's Notebook

> This is not an RFC. It is not documentation. It is not a spec.
>
> This is the private history of how Observer evolved — the realizations,
> the rejections, the reframings, and the moments where the product became
> something we hadn't planned.
>
> Ideas here may become RFCs. Many will not. Some will be wrong.
> All of them are real.

---

## Format

Each entry has a date, a title, and a body. No templates. No required sections.
Write when the insight is fresh. Revisit when the architecture drifts.

---

## Entries

---

### The Developer Is Middleware

*Observer founding period*

The debugger workflow today:

```
Run app → open DevTools → read console → open network panel →
copy request → open terminal → copy log → open AI → paste everything
→ describe behavior → wait → repeat
```

We kept calling this a "workflow problem." It is not. It is an infrastructure problem.

There is no machine-readable interface to the runtime. Developers fill that gap manually.
They are performing integration work. They are middleware.

The product exists to remove the middleware. Not to improve the workflow on top of it.
Remove it entirely.

This is the founding insight. Every feature proposal that does not reduce manual
runtime transfer is the wrong feature.

---

### Runtime Is a Graph, Not a Tree

*Observer founding period*

We initially described runtime as hierarchical:
- Workspace contains Domains
- Domains contain Components
- Components contain Events

That is wrong.

A user click triggers a Redux action which triggers an API call which
triggers a backend route which triggers a database query which returns
data which updates Redux state which re-renders a component.

That is a directed graph with causal edges. The component is both
downstream of the click and upstream of the DOM update. Nothing is
purely hierarchical.

The moment we switched to "graph" the architecture became more honest.
Relationships are first-class. Not a display concern. Not a UI feature.
The model itself is a graph.

---

### AI Is a Consumer, Not the Product

*Observer founding period*

Early framing: "Observer is an AI debugging tool."

Problem: that statement means Observer succeeds when AI is good at debugging.
It couples our value to a third party's model quality. It positions us as an AI
feature, not infrastructure.

Reframing: Observer produces Runtime Intelligence. AI consumes it.
The relationship is producer → consumer.

Git doesn't get worse if GitHub releases a bad feature. Docker doesn't
become less useful if Kubernetes changes its scheduler. Infrastructure
is not dependent on its consumers.

Observer is infrastructure. AI assistants are consumers.
Humans are consumers. Future tools we haven't imagined are consumers.

This is not a marketing position. It is an architectural constraint.

---

### Sessions Are Investigations, Not Streams

*Observer founding period*

We kept modeling runtime as a stream:
"Observe the stream of events. Query the stream."

Problem: streams have no natural unit of meaning.
A stream of 10,000 events is not an investigation.
It is noise.

Insight: developers do not debug events. They investigate behavior.
"Why did the order fail?" is an investigation. It has a beginning, middle, and end.
It has scope. It is comparable to other investigations.

Sessions are the unit. Not events.

Once we made Sessions first-class, everything else became cleaner:
- Context is scoped to a Session
- Timelines are derived from Session Events
- Replay operates on Sessions
- Collaboration shares Sessions

---

### Context Over Volume

*Observer founding period*

First instinct: capture everything.
More data → better AI understanding.

Wrong.

An AI receiving 10,000 raw events understands the same amount as an AI
receiving a 3,000-token window of random log lines: very little.

An AI receiving a Context package — the error, its causal chain, the 5 events
before it, the relevant component state, the source location — understands precisely.

Context is not a subset of logs. It is a different type of artifact.
The Context Engine exists specifically to produce this.

Volume does not produce understanding. Relevance does.

---

### Language Is Architecture

*Observer glossary period*

We spent two months writing RFCs without agreeing on the words.

"Session" meant three things to three engineers. "Context" was React Context
to the frontend engineers and conversation context to the AI engineers.
"Observer" meant the product and also a plugin type.

Realizations:
1. Ambiguous language produces ambiguous APIs.
2. The team was building slightly different systems in their heads.
3. The glossary needed to precede the architecture, not follow it.

Git succeeded partly because "commit", "branch", and "merge" are
precise words with no prior meaning in software. Everyone learned them fresh.
They became the team's shared vocabulary.

We need the same thing. The glossary is not documentation for users.
It is architecture for the team.

---

### The Naming Problem: Observer

*Observer glossary period*

We named the plugin type "Observer" before we noticed that the product is
also called Observer.

"Write an Observer for your Observer Domain."

That sentence is a sign that we have a problem.

Options: Probe, Sensor, Lens, Tap.

Sensor implies passive collection without mutation — close to right.
Probe implies deep, targeted, diagnostic instrumentation — also close.

Decision not yet made. But the problem is real and costs us nothing to fix now,
and potentially costs the SDK team weeks to fix after it ships.

---

### The Static / Runtime Divide

*Observer philosophy period*

We kept trying to describe Observer relative to what it is NOT
(not an IDE, not a debugger, not observability).

Cleaner frame: there are two worlds.

**Static world**: files, code, repos, commits, types.
Excellent tooling. AI understands it extremely well.

**Runtime world**: executing state, events, relationships, time.
Fragmented tooling. AI barely understands it.

Observer owns the runtime world. The static world already has owners.

This framing made the non-goals obvious: anything in the static world
is not Observer's problem. Anything in the runtime world is.

---

### Discovery Over Configuration Is a Product Principle, Not Just a UX Choice

*Observer philosophy period*

We almost filed "discovery over configuration" as a UX guideline.

It is more than that. It is an architectural constraint.

If Observer requires configuration to run, then Observer fails every time
a developer opens a new project. The first-run experience defines the product.

Discovery means: plugins must expose enough information about their detection
heuristics that Observer can compose them automatically. If a plugin can only be
connected manually, it is not first-class.

This changes how the Plugin SDK is designed. Plugins must implement
a `discover()` function alongside `connect()`.

---

### The Architecture Decision: Events Are the Source of Truth

*Architecture Review 001*

We almost locked the Runtime Graph as Observer's source of truth. Architecture A.

We stopped before RFC-0005 and ran a formal review.

The correct answer is Architecture B: Runtime Events are the source of truth. The Runtime Graph is a projection.

This is not a redesign. RFC-0003 already said it: "RuntimeEvents are the immutable source of truth. The current state is the materialized view of events." We were heading here. The review just made it explicit and load-bearing.

**The analogy that crystallized it:**

Git is to source code what Observer is to runtime. Git won because commits are immutable and the working tree is derived. You can blow away your working tree; the history is permanent. Observer must have the same property: blow away the Runtime Graph; rebuild from events. Always correct, always recoverable.

**What this adds:**

One new component: the **Projection Engine**. It processes events and maintains all derived views — Runtime Graph, Timeline, Context. It is the single most important component in the platform.

**What this does NOT change:**

- Node types and schemas
- Relationship types
- Plugin event emission interface
- Glossary definitions
- The 10 engineering principles

**Key decisions made:**

- Projection Engine: hybrid push+pull (live = push incremental; cold start/history = pull replay)
- Ordering: Observer-assigned monotonic sequence numbers. Plugin `correlationId` for cross-domain linking.
- Snapshots: optional performance optimization only. Correctness never depends on them.
- Pruning: session-bounded. Archive on close.

**The lesson:**

Stop and do the architecture review before writing 10 more RFCs. One wrong assumption at the foundation costs months. One right decision costs one afternoon.

---

## Notes on Using This Notebook

- Write when the insight is fresh, not when it is polished.
- Date entries when written. Time is context.
- Revisit and annotate when an insight turns out to be wrong.
- Do not delete entries. Strike through and annotate instead.
- Some of these ideas will be quoted in future fundraising decks.
  Others will be quietly forgotten. Write them anyway.
