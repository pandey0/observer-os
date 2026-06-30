# Observer OS — AI Agent Examples

Observer OS gives an AI agent **live eyes into a running application** via MCP.
The agent can inspect the runtime graph, query the event timeline, diagnose slowdowns,
and reason across layers (HTTP → Postgres → Redis → WebSocket) — all without touching
source code or logs.

---

## Setup

```bash
# Daemon must be running
curl http://localhost:4000/api/health   # → {"status":"ok"}

# MCP registered in Claude Code
claude mcp list   # → observer-os: ✔ Connected
```

---

## Tool chaining pattern

Most useful workflows follow this shape:

```
1. observer_list_sessions        → find the session ID
2. observer_get_nodes            → understand the graph topology
3. observer_get_events           → drill into the timeline
4. observer_get_context          → get structured context for a specific node
5. observer_query                → ask a natural-language question (requires ANTHROPIC_API_KEY on daemon)
```

---

## Example 1 — Debug a slow endpoint

**Prompt to Claude:**
```
My /api/workspaces endpoint feels slow. 
Use Observer OS to find out what's happening on the backend.
```

**What Claude does:**
```
1. observer_list_sessions
   → finds ses_abc123 (ACTIVE, 146 events, 23 nodes)

2. observer_get_nodes(session_id="ses_abc123")
   → sees: http-server:request:cor_xyz (COMPLETED),
           postgres:pool:localhost:5433/observer_demo (ACTIVE),
           redis:client:localhost:6379 (ACTIVE)

3. observer_get_events(session_id="ses_abc123", limit=50)
   → finds a request node with correlationId cor_xyz
   → traces: request.started → query.started (x3) → command.started (x2) → request.completed

4. observer_get_context(session_id="ses_abc123", node_id="http-server:request:cor_xyz")
   → gets structured markdown: method=GET url=/api/workspaces
     durationMs=340, 3 postgres queries, 2 redis commands
```

**Claude's output:**
```
The /api/workspaces request took 340ms. Breakdown:
- Redis GET (session lookup): 2ms
- Postgres query 1 (SELECT workspaces): 280ms  ← bottleneck
- Postgres query 2 (SELECT members): 45ms
- Redis SET (cache write): 3ms

The workspace query is doing a full table scan. 
Adding an index on workspaces.owner_id would fix this.
```

---

## Example 2 — Trace a request end-to-end

**Prompt:**
```
When alice logs in, what exactly happens across postgres and redis? 
Walk me through every step.
```

**What Claude does:**
```
1. observer_list_sessions → gets active session

2. observer_get_events(session_id=..., limit=100)
   → filters for events with type containing "auth" or correlationId from login request

3. observer_get_context(session_id=..., node_id="http-server:request:cor_login_1")
   → full context package with all correlated events
```

**Claude's output:**
```
Login flow for alice@acme.com (correlationId: cor_login_1, total: 87ms):

1. [+0ms]   HTTP POST /api/auth/login received
2. [+2ms]   Redis GET session:old_token  → nil (no prior session)
3. [+4ms]   Postgres SELECT users WHERE email='alice@acme.com' AND password=...
4. [+52ms]  bcrypt.compare() — password verification (CPU bound, ~48ms)
5. [+54ms]  Postgres INSERT INTO sessions VALUES (new_token, user_id, expires_at)
6. [+56ms]  Redis SET session:new_token → user_id (TTL 7 days)
7. [+87ms]  HTTP 200 {token, user} returned

The 48ms bcrypt cost is expected (cost factor 10). 
Everything else is fast — no issues.
```

---

## Example 3 — Compare before and after a code change

**Prompt:**
```
I just refactored the task listing endpoint to add Redis caching.
Compare the before session ses_aaa111 with the after session ses_bbb222 
and tell me if the caching is actually helping.
```

**What Claude does:**
```
1. observer_get_nodes(session_id="ses_aaa111")
   → before: 12 nodes, redis only has SET operations

2. observer_get_nodes(session_id="ses_bbb222")
   → after: 12 nodes, redis now has GET + SET operations

3. observer_get_events(session_id="ses_aaa111", limit=200)
   → counts postgres query.completed events for /api/projects/:id/tasks

4. observer_get_events(session_id="ses_bbb222", limit=200)
   → counts same events, also counts redis command.completed (GET hits)

5. observer_get_performance(session_id="ses_aaa111")
   → p95 latency for task list: 210ms

6. observer_get_performance(session_id="ses_bbb222")
   → p95 latency for task list: 18ms
```

**Claude's output:**
```
Caching is working:

Before: every task list → Postgres query (avg 210ms p95)
After:  first request → Postgres (210ms), subsequent → Redis GET (avg 3ms)

Cache hit rate in after-session: 8/10 requests served from cache (80%)
P95 latency improvement: 210ms → 18ms (91% faster)

One concern: redis GET is called before the auth check in 2 events — 
make sure cache keys are scoped per-user, not per-project, 
otherwise user A could see user B's tasks.
```

---

## Example 4 — Catch a bug before it ships

**Prompt:**
```
Review the session from my latest test run and tell me 
if anything looks wrong before I deploy.
```

**What Claude does:**
```
1. observer_list_sessions → finds most recent COMPLETED session

2. observer_get_nodes(session_id=...)
   → scans for nodes with status=FAILED

3. observer_get_events(session_id=..., limit=200)
   → looks for .failed events, error payloads, unusual patterns

4. observer_get_context for each FAILED node
```

**Claude's output:**
```
Found 2 issues in session ses_xyz789:

ISSUE 1 — Postgres query failed (node: postgres:pool:localhost:5433/observer_demo)
  Event: observer.postgres/query.failed at +340ms
  Error: "column tasks.assignee_color does not exist"
  Query: SELECT tasks.*, users.name as assignee_name, users.color as assignee_color FROM tasks...
  → Column was renamed in migration 004 but query not updated. Will 500 in prod.

ISSUE 2 — Redis command failed (node: redis:client:localhost:6379)
  Event: observer.redis/command.failed at +12ms
  Error: "WRONGTYPE Operation against a key holding the wrong kind of value"
  Key: session:<token>  
  → Session key was stored as a string in old code, new code tries to HGETALL it.
    Existing Redis sessions will fail until they expire (7 days).
  
Neither issue is caught by your test suite. Fix both before deploying.
```

---

## Example 5 — Autonomous monitoring agent

**Prompt:**
```
Watch the active session and alert me if any postgres query takes over 500ms 
or if any request returns a 5xx status.
```

**What Claude does (in a loop):**
```
Every 30s:
1. observer_get_events(session_id=..., after_sequence=<last_seen>, limit=100)
   → checks new events since last poll

2. Scans for:
   - observer.postgres/query.completed where payload.durationMs > 500
   - observer.http-server/request.failed where payload.status >= 500

3. Reports violations with full context
```

**Example alert Claude surfaces:**
```
ALERT [12:34:07] — Slow query detected

Node: postgres:pool:localhost:5433/observer_demo
Duration: 1,240ms  (threshold: 500ms)
Query: SELECT * FROM tasks WHERE project_id=$1 ORDER BY created_at DESC
CorrelationId: cor_abc → triggered by GET /api/projects/00000000.../tasks

The tasks table has 50,000 rows. Missing index on (project_id, created_at).
Estimated fix: CREATE INDEX tasks_project_created ON tasks(project_id, created_at DESC);
```

---

## Example 6 — Architecture audit

**Prompt:**
```
Look at the current runtime graph and describe the actual architecture 
of this app — not what the README says, what's actually happening.
```

**What Claude does:**
```
1. observer_list_sessions → active session

2. observer_get_nodes(session_id=...)
   → full node list with types and domains

3. observer_get_events(session_id=..., limit=200)
   → understands relationships: which requests hit which stores
```

**Claude's output:**
```
Observed architecture (from runtime, not docs):

HTTP layer:
  - Express server on :3000
  - All routes go through JWT middleware (redis lookup on every request)
  - 3 route groups: /auth, /workspaces/:slug, /tasks/:id

Data layer:
  - Postgres: primary store for users, workspaces, projects, tasks, comments
  - Redis: session tokens (TTL 7d), NOT used for caching (yet)
  
Real-time layer:
  - WebSocket server on same port 3000
  - Clients subscribe to project rooms
  - Task mutations broadcast to room subscribers

Observed call patterns per request:
  - Auth check: 1 Redis GET (always)
  - Task list: 2 Postgres queries (tasks + assignees, no join)
  - Task update: 1 Postgres UPDATE + 1 WebSocket broadcast (0 Redis)
  - Comment post: 1 Postgres INSERT (no notification, no cache invalidation)

Gaps vs typical patterns:
  - No read-through cache on task queries (Redis is idle during task reads)
  - Comments don't broadcast via WebSocket — clients won't see new comments live
  - No connection pooling metrics visible (pool.connected fires once, no idle/wait events)
```

---

## Example 7 — Write a test based on observed behavior

**Prompt:**
```
Look at what the login endpoint actually does in the runtime graph 
and generate an integration test that covers it.
```

**What Claude does:**
```
1. observer_get_events → find login request events with correlationId
2. Trace the exact sequence: HTTP → Postgres → Redis → HTTP response
3. Extract: query shapes, redis key patterns, response shape, timing expectations
```

**Claude's output:**
```typescript
// Generated from observed runtime behavior — session ses_abc123
// Observed: POST /api/auth/login → Postgres lookup → bcrypt → Redis SET → 200

describe('POST /api/auth/login', () => {
  it('returns token and sets redis session on valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@acme.com', password: 'password123' });

    // Observed: always 200 with token + user object
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      token: expect.stringMatching(/^[0-9a-f-]{36}$/), // UUID format observed
      user: { email: 'alice@acme.com', role: 'admin' },
    });

    // Observed: Redis key set with 7-day TTL
    const redisVal = await redis.get(`session:${res.body.token}`);
    expect(redisVal).not.toBeNull();
    const ttl = await redis.ttl(`session:${res.body.token}`);
    expect(ttl).toBeCloseTo(7 * 24 * 3600, -2); // within ~100s

    // Observed: Postgres session row inserted
    const { rows } = await db.query(
      'SELECT * FROM sessions WHERE token=$1', [res.body.token]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(aliceUserId);
  });

  it('returns 401 on bad password', async () => {
    // Observed: 401, no Redis write, no session row
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@acme.com', password: 'wrong' });

    expect(res.status).toBe(401);
    
    // Observed: no Redis side effect on failure
    const keys = await redis.keys('session:*');
    expect(keys).toHaveLength(0); // assuming clean state
  });
});
```

---

## Tool reference (quick)

```
observer_list_sessions                          → all sessions
observer_get_session(session_id)                → single session detail
observer_search_sessions(q, domain, status)     → filtered search
observer_get_nodes(session_id)                  → runtime graph nodes
observer_get_events(session_id, limit, after)   → event timeline
observer_get_context(session_id, node_id)       → structured node context
observer_query(session_id, question)            → NL question (needs AI key)
observer_get_performance(session_id)            → latency buckets + slowest
observer_export_session(session_id, format)     → full export (json|markdown)
```

---

## Key insight for agents

The MCP tools give an agent **ground truth about runtime behavior**, not static analysis guesses.

| Traditional approach | With Observer OS |
|---|---|
| Read source code, guess what happens | See what actually happened |
| Check logs for errors | Inspect correlated event chains |
| Estimate query cost from EXPLAIN | Measure actual durationMs per query |
| Assume Redis is a cache | Observe every command type + key pattern |
| Write tests based on docs | Write tests based on observed sequences |
| "This might be slow" | "Query at line X took 1,240ms, here's the fix" |

The agent doesn't need read access to the source code, database, or log files.
It only needs the MCP connection to the running Observer daemon.
